import { browser } from 'wxt/browser';
import { GridIndex, WALK_SPEED } from './geo';
import { LOCAL_TRANSIT_MODES, motisGet, type MotisReachable } from './motis';
import { nextServiceTime } from './time';
import type { CompactReach, Place, Walking } from './types';
import { prettyName, round } from './util';

// "Reach" is every stop from which you can still get to a place by its deadline,
// along with how early you'd have to leave that stop. One arrive-by one-to-all
// query per place prices every listing on a map, which is what keeps the
// extension light on Transitous: a full trip plan per listing would be 40+
// requests per search page.

export const MAX_TRAVEL_MINUTES = 90;
const REACH_TTL_MS = 7 * 24 * 3600 * 1000;

/** Everything that changes the answer. A different key means a new query. */
export function reachKey(place: Place, walking: Walking, routerUrl: string): string {
  return [
    'r2',
    place.lat.toFixed(5),
    place.lon.toFixed(5),
    place.arriveBy,
    place.day,
    walking.walkPace,
    walking.maxWalkMinutes,
    walking.stepFree ? 'sf' : 'any',
    MAX_TRAVEL_MINUTES,
    routerUrl,
  ].join('|');
}

export function compactReach(raw: MotisReachable, placeId: string, key: string, arriveAt: Date): CompactReach {
  const out: CompactReach = {
    v: 1,
    key,
    placeId,
    fetchedAt: Date.now(),
    arriveAtIso: arriveAt.toISOString(),
    maxTravelMinutes: MAX_TRAVEL_MINUTES,
    lat: [],
    lon: [],
    dur: [],
    k: [],
    name: [],
    modes: [],
  };
  for (const r of raw.all ?? []) {
    // k = 0 means "walk there"; the walk-only check in estimateOne covers that case.
    if (!r.place || r.k < 1) continue;
    out.lat.push(round(r.place.lat, 5));
    out.lon.push(round(r.place.lon, 5));
    out.dur.push(r.duration);
    out.k.push(r.k);
    out.name.push(prettyName(r.place.name ?? ''));
    out.modes.push((r.place.modes ?? []).join(','));
  }
  return out;
}

async function fetchReach(place: Place, walking: Walking, routerUrl: string, key: string): Promise<CompactReach> {
  const arriveAt = nextServiceTime(place.day, place.arriveBy);
  const params = new URLSearchParams({
    one: `${place.lat},${place.lon}`,
    arriveBy: 'true',
    time: arriveAt.toISOString(),
    maxTravelTime: String(MAX_TRAVEL_MINUTES),
    pedestrianSpeed: String(WALK_SPEED[walking.walkPace]),
    // In an arrive-by search the "post transit" leg is the walk from the last stop to the place.
    maxPostTransitTime: String(walking.maxWalkMinutes * 60),
    transitModes: LOCAL_TRANSIT_MODES,
  });
  if (walking.stepFree) params.set('pedestrianProfile', 'WHEELCHAIR');
  const raw = await motisGet<MotisReachable>(routerUrl, '/api/v6/one-to-all', params, { heavy: true, timeoutMs: 60_000 });
  return compactReach(raw, place.id, key, arriveAt);
}

interface Loaded {
  reach: CompactReach;
  grid: GridIndex;
}

const memory = new Map<string, Loaded>();
const inflight = new Map<string, Promise<Loaded>>();

const storageKey = (placeId: string) => `reach:${placeId}`;

function fresh(r: CompactReach | undefined, key: string): r is CompactReach {
  return !!r && r.key === key && Date.now() - r.fetchedAt < REACH_TTL_MS;
}

/** Reach for a place from memory, then storage, then the network (when allowed). */
export async function loadReach(
  place: Place,
  walking: Walking,
  routerUrl: string,
  allowFetch = true,
): Promise<Loaded | null> {
  const key = reachKey(place, walking, routerUrl);
  const mem = memory.get(place.id);
  if (mem && fresh(mem.reach, key)) return mem;

  const sk = storageKey(place.id);
  const stored = (await browser.storage.local.get(sk))[sk] as CompactReach | undefined;
  if (fresh(stored, key)) {
    const loaded = { reach: stored, grid: new GridIndex(stored.lat, stored.lon) };
    memory.set(place.id, loaded);
    return loaded;
  }
  if (!allowFetch) return null;

  // Several tabs can ask for the same place at once on first load; share one request.
  let pending = inflight.get(key);
  if (!pending) {
    pending = fetchReach(place, walking, routerUrl, key)
      .then(async (reach) => {
        await browser.storage.local.set({ [sk]: reach });
        const loaded = { reach, grid: new GridIndex(reach.lat, reach.lon) };
        memory.set(place.id, loaded);
        return loaded;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  return pending;
}

export async function forgetReach(placeId?: string): Promise<void> {
  if (placeId) {
    memory.delete(placeId);
    await browser.storage.local.remove(storageKey(placeId));
    return;
  }
  memory.clear();
  const all = await browser.storage.local.get(null);
  await browser.storage.local.remove(Object.keys(all).filter((k) => k.startsWith('reach:')));
}
