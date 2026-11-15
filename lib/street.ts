import { browser } from 'wxt/browser';
import { haversineMeters, walkMinutes, WALK_SPEED } from './geo';
import { motisGet } from './motis';
import type { Estimate, ListingPoint, Place, Walking } from './types';

// Driving and walking times for places someone doesn't take transit to.
//
// Walking needs no network: straight-line distance with the same detour factor
// the transit estimates use is close enough for a badge, and the side panel
// asks for the real route.
//
// Driving can't be guessed that way (rivers, highways), so listings are routed
// in batches with MOTIS's one-to-many street router: one request per place per
// page of new listings, cached for a month because roads rarely change. These
// are free-flow times: nothing in the free data knows about rush hour.

/** Past this a trip shows as "90+", same as transit. */
const MAX_MINUTES = 90;
const MAX_DRIVE_SECONDS = 2 * 3600;
const DRIVE_TTL_MS = 30 * 24 * 3600 * 1000;
// How many listings go in one request. Transitous caps it server-side; a
// search page has about 40.
const BATCH = 50;

export function walkEstimate(home: ListingPoint, place: Place, walking: Walking): Estimate {
  const minutes = Math.round(walkMinutes(haversineMeters(home.lat, home.lon, place.lat, place.lon), WALK_SPEED[walking.walkPace]));
  if (minutes > MAX_MINUTES) return { placeId: place.id, minutes: null };
  return { placeId: place.id, minutes, walkMinutes: minutes, walkOnly: true, modes: 'WALK' };
}

interface DriveCache {
  key: string;
  fetchedAt: number;
  /** "lat,lon" rounded to ~10 m → minutes, or null when no road route was found in time. */
  minutes: Record<string, number | null>;
}

const pointKey = (p: { lat: number; lon: number }) => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`;
const driveKey = (place: Place, routerUrl: string) => ['d1', place.lat.toFixed(5), place.lon.toFixed(5), routerUrl].join('|');

// One request at a time per place, so two tabs asking about the same listings
// don't both pay for them.
const queues = new Map<string, Promise<unknown>>();

export function driveEstimates(place: Place, homes: ListingPoint[], routerUrl: string): Promise<Map<string, Estimate>> {
  const run = async () => {
    const sk = `drive:${place.id}`;
    const key = driveKey(place, routerUrl);
    const stored = (await browser.storage.local.get(sk))[sk] as DriveCache | undefined;
    const cache: DriveCache =
      stored && stored.key === key && Date.now() - stored.fetchedAt < DRIVE_TTL_MS ? stored : { key, fetchedAt: Date.now(), minutes: {} };

    const missing = [...new Map(homes.filter((h) => !(pointKey(h) in cache.minutes)).map((h) => [pointKey(h), h])).values()];
    for (let i = 0; i < missing.length; i += BATCH) {
      const chunk = missing.slice(i, i + BATCH);
      const params = new URLSearchParams({
        one: `${place.lat};${place.lon}`,
        many: chunk.map((h) => `${h.lat};${h.lon}`).join(','),
        mode: 'CAR',
        max: String(MAX_DRIVE_SECONDS),
        maxMatchingDistance: '250',
        arriveBy: 'true', // many homes → one place
      });
      const result = await motisGet<{ duration?: number }[]>(routerUrl, '/api/v1/one-to-many', params, { heavy: true });
      chunk.forEach((h, j) => {
        const seconds = result?.[j]?.duration;
        cache.minutes[pointKey(h)] = seconds == null ? null : Math.round(seconds / 60);
      });
    }
    if (missing.length) await browser.storage.local.set({ [sk]: cache });

    return new Map(
      homes.map((h): [string, Estimate] => {
        const minutes = cache.minutes[pointKey(h)] ?? null;
        return [h.id, { placeId: place.id, minutes: minutes != null && minutes <= MAX_MINUTES ? minutes : null, modes: 'CAR' }];
      }),
    );
  };
  const next = (queues.get(place.id) ?? Promise.resolve()).then(run, run);
  queues.set(
    place.id,
    next.catch(() => {}),
  );
  return next;
}

export async function forgetDrives(placeId?: string): Promise<void> {
  if (placeId) {
    await browser.storage.local.remove(`drive:${placeId}`);
    return;
  }
  const all = await browser.storage.local.get(null);
  await browser.storage.local.remove(Object.keys(all).filter((k) => k.startsWith('drive:')));
}
