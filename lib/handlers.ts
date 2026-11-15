import { browser } from 'wxt/browser';
import { estimateFromPlan, estimateOne } from './estimate';
import { geocode, suggest, timeZoneAt } from './geocode';
import { WALK_SPEED } from './geo';
import type { EstimateResponse, MapReach, Request } from './messages';
import { usageInfo } from './motis';
import { forgetPlans, getCachedPlans, getPlan } from './plan';
import { forgetReach, loadReach } from './reach';
import { currentListingKey, getPeople, getPlaces, getSettings, pageStatusKey, walkingFor } from './storage';
import { driveEstimates, forgetDrives, walkEstimate } from './street';
import type { Estimate, ListingPoint, Place, Walking } from './types';

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
      return geocode(msg.text, (await getSettings()).routerUrl, msg.near);
    case 'suggest':
      return suggest(msg.text, (await getSettings()).routerUrl, msg.near);
    case 'timezone':
      return timeZoneAt(msg.lat, msg.lon, (await getSettings()).routerUrl);
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
      await Promise.all([forgetReach(), forgetPlans(), forgetDrives()]);
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
      const exact = new Map<string, Estimate>();
      for (const home of homes) {
        const plan = saved.get(`${home.id}|${place.id}`);
        const e = plan && estimateFromPlan(plan, place.id);
        if (e) exact.set(home.id, e);
      }
      // Only estimate homes that don't already have a full plan saved.
      const quick = await quickEstimates(place, walking, homes.filter((h) => !exact.has(h.id)), s.routerUrl, errors);
      byPlace.set(place.id, new Map(homes.map((h) => [h.id, exact.get(h.id) ?? quick.get(h.id)!])));
    }),
  );

  const results: Record<string, Estimate[]> = {};
  for (const home of homes) results[home.id] = visible.map((p) => byPlace.get(p.id)!.get(home.id)!);
  return { results, errors };
}

async function quickEstimates(
  place: Place,
  walking: Walking,
  homes: ListingPoint[],
  routerUrl: string,
  errors: Record<string, string>,
): Promise<Map<string, Estimate>> {
  const failAll = (message: string) => {
    errors[place.id] = message;
    return new Map(homes.map((h) => [h.id, { placeId: place.id, minutes: null, error: message }]));
  };
  if (!homes.length) return new Map();
  if (place.mode === 'walk') return new Map(homes.map((h) => [h.id, walkEstimate(h, place, walking)]));
  if (place.mode === 'drive') {
    try {
      return await driveEstimates(place, homes, routerUrl);
    } catch (e) {
      return failAll((e as Error).message);
    }
  }

  let loaded;
  try {
    loaded = await loadReach(place, walking, routerUrl);
  } catch (e) {
    return failAll((e as Error).message);
  }
  if (!loaded) return failAll('Not available yet');
  // Nothing at all can reach the place: either no transit there, or an area
  // Transitous doesn't have schedules for. Say that instead of "90+ min".
  const noData = loaded.reach.lat.length === 0;
  if (noData) errors[place.id] = `No transit data near ${place.label}. Transitous may not cover that area yet.`;
  const { reach, grid } = loaded;
  return new Map(homes.map((h) => [h.id, noDataNote(estimateOne(h, place, reach, grid, walking), noData ? errors[place.id] : undefined)]));
}

/** A walk-only estimate still counts when there's no transit data; otherwise explain why there's no number. */
function noDataNote(e: Estimate, note: string | undefined): Estimate {
  return note && e.minutes == null ? { ...e, error: note } : e;
}

/** Stops that make a place's deadline within the longest color band, for shading the map. */
export async function reachForMap(placeId: string): Promise<MapReach | null> {
  const [places, people, s] = await Promise.all([getPlaces(), getPeople(), getSettings()]);
  const place = places.find((p) => p.id === placeId);
  if (!place || place.mode === 'drive') return null; // no isochrones for cars
  const walking = walkingFor(place, people);
  const limit = s.bands[s.bands.length - 1];
  // Walking is just rings around the place itself, up to the longest band.
  if (place.mode === 'walk') return { lat: [], lon: [], dur: [], walkSpeed: WALK_SPEED[walking.walkPace], maxWalk: limit };
  const loaded = await loadReach(place, walking, s.routerUrl);
  if (!loaded) return null;
  const { reach } = loaded;
  const out: MapReach = { lat: [], lon: [], dur: [], walkSpeed: WALK_SPEED[walking.walkPace], maxWalk: walking.maxWalkMinutes };
  for (let i = 0; i < reach.dur.length; i++) {
    if (reach.dur[i] >= limit) continue;
    out.lat.push(reach.lat[i]);
    out.lon.push(reach.lon[i]);
    out.dur.push(reach.dur[i]);
  }
  return out;
}
