// The bits of routing shoot.mjs needs on the Node side: reach for the sample
// places (for badges and shading on the Redfin page) and one trip plan (for
// the route drawn on the map). Same parameters the extension sends.
import { WALK_SPEED } from '../../lib/geo';
import { LOCAL_TRANSIT_MODES, type MotisPlan, type MotisReachable } from '../../lib/motis';
import { groupItineraries } from '../../lib/plan';
import { compactReach, MAX_TRAVEL_MINUTES } from '../../lib/reach';
import { nextServiceTime } from '../../lib/time';
import type { CompactReach, ListingPoint, Person, Place, SimpleItinerary } from '../../lib/types';

export { people, places, saved } from './sample-data';

const BASE = 'https://api.transitous.org';
const UA = 'RailtyMaps-store-assets/1.0 (+https://github.com/devAgam/railtymaps)';

async function get<T>(path: string, params: URLSearchParams, attempt = 1): Promise<T> {
  try {
    const res = await fetch(`${BASE}${path}?${params}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
    return (await res.json()) as T;
  } catch (e) {
    // One retry after a pause; connection timeouts to a volunteer-run server happen.
    if (attempt >= 2) throw e;
    await new Promise((r) => setTimeout(r, 5000));
    return get(path, params, attempt + 1);
  }
}

export async function reachFor(place: Place, person: Person): Promise<CompactReach> {
  const arriveAt = nextServiceTime(place.day, place.arriveBy);
  const params = new URLSearchParams({
    one: `${place.lat},${place.lon}`,
    arriveBy: 'true',
    time: arriveAt.toISOString(),
    maxTravelTime: String(MAX_TRAVEL_MINUTES),
    pedestrianSpeed: String(WALK_SPEED[person.walkPace]),
    maxPostTransitTime: String(person.maxWalkMinutes * 60),
    transitModes: LOCAL_TRANSIT_MODES,
  });
  if (person.stepFree) params.set('pedestrianProfile', 'WHEELCHAIR');
  return compactReach(await get<MotisReachable>('/api/v6/one-to-all', params), place.id, 'store-assets', arriveAt);
}

export async function bestRoute(home: ListingPoint, place: Place, person: Person): Promise<SimpleItinerary | null> {
  const deadline = nextServiceTime(place.day, place.arriveBy);
  const walk = String(person.maxWalkMinutes * 60);
  const params = new URLSearchParams({
    fromPlace: `${home.lat},${home.lon}`,
    toPlace: `${place.lat},${place.lon}`,
    time: deadline.toISOString(),
    arriveBy: 'true',
    searchWindow: '2700',
    pedestrianSpeed: String(WALK_SPEED[person.walkPace]),
    maxPreTransitTime: walk,
    maxPostTransitTime: walk,
    transitModes: LOCAL_TRANSIT_MODES,
    detailedTransfers: 'false',
  });
  const plan = await get<MotisPlan>('/api/v6/plan', params);
  return groupItineraries(plan.itineraries ?? [], deadline)[0] ?? null;
}
