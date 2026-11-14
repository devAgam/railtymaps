import { browser } from 'wxt/browser';
import { estimateFromPlan, estimateOne } from './estimate';
import { geocode } from './geocode';
import { WALK_SPEED } from './geo';
import type { EstimateResponse, MapReach, Request } from './messages';
import { usageInfo } from './motis';
import { forgetPlans, getCachedPlans, getPlan } from './plan';
import { forgetReach, loadReach } from './reach';
import { currentListingKey, getPeople, getPlaces, getSettings, pageStatusKey, walkingFor } from './storage';
import type { Estimate, ListingPoint } from './types';

/** Everything the background does on request. Kept apart from the listeners so tests can call it. */
export async function handleRequest(msg: Request, tabId: number | undefined): Promise<unknown> {
  switch (msg.type) {
    case 'estimate':
      return estimate(msg.homes);
    case 'reachForMap':
      return reachForMap(msg.placeId);
    case 'plan': {
      const [places, people, s] = await Promise.all([getPlaces(), getPeople(), getSettings()]);
      const place = places.find((p) => p.id === msg.placeId);
      if (!place) throw new Error('That place was removed.');
      return getPlan(msg.home, place, walkingFor(place, people), s.routerUrl, msg.allowFetch ?? true);
    }
    case 'geocode':
      return geocode(msg.text, (await getSettings()).routerUrl);
    case 'setCurrent':
      if (tabId == null) return null;
      if (msg.listing) await browser.storage.session.set({ [currentListingKey(tabId)]: msg.listing });
      else await browser.storage.session.remove(currentListingKey(tabId));
      return null;
    case 'pageStatus':
      if (tabId != null) await browser.storage.session.set({ [pageStatusKey(tabId)]: msg.status });
      return null;
    case 'usage':
      return usageInfo();
    case 'clearCache':
      await Promise.all([forgetReach(), forgetPlans()]);
      return null;
    default:
      throw new Error(`Unknown request: ${(msg as { type?: string })?.type}`);
  }
}

export async function estimate(homes: ListingPoint[]): Promise<EstimateResponse> {
  const [places, people, s] = await Promise.all([getPlaces(), getPeople(), getSettings()]);
  const visible = places.filter((p) => p.enabled);
  const errors: Record<string, string> = {};
  const byPlace = new Map<string, Map<string, Estimate>>();
  const saved = await getCachedPlans(
    homes.flatMap((home) => visible.map((place) => ({ home, place, walking: walkingFor(place, people) }))),
    s.routerUrl,
  );

  await Promise.all(
    visible.map(async (place) => {
      const walking = walkingFor(place, people);
      let loaded = null;
      try {
        loaded = await loadReach(place, walking, s.routerUrl);
      } catch (e) {
        errors[place.id] = (e as Error).message;
      }
      const out = new Map<string, Estimate>();
      for (const home of homes) {
        const plan = saved.get(`${home.id}|${place.id}`);
        const exact = plan && estimateFromPlan(plan);
        out.set(
          home.id,
          exact ??
            (loaded
              ? estimateOne(home, place, loaded.reach, loaded.grid, walking)
              : { placeId: place.id, minutes: null, error: errors[place.id] ?? 'Not available yet' }),
        );
      }
      byPlace.set(place.id, out);
    }),
  );

  const results: Record<string, Estimate[]> = {};
  for (const home of homes) results[home.id] = visible.map((p) => byPlace.get(p.id)!.get(home.id)!);
  return { results, errors };
}

/** Stops that make a place's deadline within the longest color band, for shading the map. */
export async function reachForMap(placeId: string): Promise<MapReach | null> {
  const [places, people, s] = await Promise.all([getPlaces(), getPeople(), getSettings()]);
  const place = places.find((p) => p.id === placeId);
  if (!place) return null;
  const walking = walkingFor(place, people);
  const loaded = await loadReach(place, walking, s.routerUrl);
  if (!loaded) return null;
  const { reach } = loaded;
  const limit = s.bands[s.bands.length - 1];
  const out: MapReach = { lat: [], lon: [], dur: [], walkSpeed: WALK_SPEED[walking.walkPace], maxWalk: walking.maxWalkMinutes };
  for (let i = 0; i < reach.dur.length; i++) {
    if (reach.dur[i] >= limit) continue;
    out.lat.push(reach.lat[i]);
    out.lon.push(reach.lon[i]);
    out.dur.push(reach.dur[i]);
  }
  return out;
}
