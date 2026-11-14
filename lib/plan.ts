import { browser } from 'wxt/browser';
import { WALK_SPEED } from './geo';
import { LOCAL_TRANSIT_MODES, motisGet, type MotisItinerary, type MotisLeg, type MotisPlan } from './motis';
import { reachKey } from './reach';
import { nextServiceTime } from './time';
import type { ListingPoint, Place, PlanResult, SimpleItinerary, SimpleLeg, Walking } from './types';
import { hashKey, prettyName } from './util';

// Full trip plans for one home and one place. These only run when someone opens
// a home in the side panel or asks for exact times on the Saved tab, and they're
// cached for a week.

const PLAN_TTL_MS = 7 * 24 * 3600 * 1000;
// Asking for trips that arrive up to 45 minutes before the deadline shows how
// often the same route runs, which matters a lot more than the single best trip.
const SEARCH_WINDOW_S = 45 * 60;

export function planKey(home: ListingPoint, place: Place, walking: Walking, routerUrl: string): string {
  return ['p2', home.lat.toFixed(5), home.lon.toFixed(5), reachKey(place, walking, routerUrl)].join('|');
}

export function planStorageKey(home: ListingPoint, place: Place, walking: Walking, routerUrl: string): string {
  return `plan:${hashKey(planKey(home, place, walking, routerUrl))}`;
}

function placeName(name: string | undefined, fallback: string): string {
  // MOTIS names the request's own endpoints START and END.
  if (!name || name === 'START' || name === 'END') return fallback;
  return prettyName(name);
}

function simplifyLeg(l: MotisLeg): SimpleLeg {
  const walk = l.mode === 'WALK';
  return {
    mode: l.mode,
    route: walk ? undefined : l.routeShortName || l.displayName || l.routeLongName,
    routeLong: l.routeLongName || undefined,
    agency: l.agencyName,
    headsign: l.headsign,
    color: l.routeColor ? `#${l.routeColor}` : undefined,
    textColor: l.routeTextColor ? `#${l.routeTextColor}` : undefined,
    from: placeName(l.from?.name, 'Home'),
    to: placeName(l.to?.name, 'Destination'),
    startIso: l.startTime,
    endIso: l.endTime,
    minutes: Math.round(l.duration / 60),
    meters: l.distance ? Math.round(l.distance) : undefined,
    stops: Array.isArray(l.intermediateStops) ? l.intermediateStops.length + 1 : undefined,
    polyline: l.legGeometry?.points,
    precision: l.legGeometry?.precision,
  };
}

export function simplifyItinerary(it: MotisItinerary, deadline: Date): SimpleItinerary {
  const legs = it.legs.map(simplifyLeg);
  const walks = legs.filter((l) => l.mode === 'WALK');
  const rides = legs.filter((l) => l.mode !== 'WALK');
  return {
    signature: rides.map((l) => `${l.mode}:${l.route ?? '?'}`).join('>') || 'WALK',
    departIso: it.startTime,
    arriveIso: it.endTime,
    rideMinutes: Math.round(it.duration / 60),
    leadMinutes: Math.round((deadline.getTime() - Date.parse(it.startTime)) / 60000),
    transfers: Math.max(0, rides.length - 1),
    walkMinutes: walks.reduce((sum, l) => sum + l.minutes, 0),
    walkMeters: walks.reduce((sum, l) => sum + (l.meters ?? 0), 0),
    longestWalkMinutes: walks.reduce((max, l) => Math.max(max, l.minutes), 0),
    legs,
    alsoDepartsIso: [],
  };
}

/**
 * MOTIS returns the same route several times at different departure times.
 * Collapse those into one option (keeping the latest departure that still makes
 * the deadline) and list the rest as other departures. Best option first.
 */
export function groupItineraries(raw: MotisItinerary[], deadline: Date, limit = 4): SimpleItinerary[] {
  const groups = new Map<string, SimpleItinerary[]>();
  for (const it of raw) {
    if (Date.parse(it.endTime) > deadline.getTime() + 60_000) continue;
    const s = simplifyItinerary(it, deadline);
    groups.set(s.signature, [...(groups.get(s.signature) ?? []), s]);
  }
  const options = [...groups.values()].map((list) => {
    list.sort((a, b) => Date.parse(b.departIso) - Date.parse(a.departIso));
    const others = [...new Set(list.slice(1).map((x) => x.departIso))].sort();
    return { ...list[0], alsoDepartsIso: others };
  });
  options.sort((a, b) => a.leadMinutes - b.leadMinutes || a.transfers - b.transfers || a.walkMinutes - b.walkMinutes);
  return options.slice(0, limit);
}

async function fetchPlan(home: ListingPoint, place: Place, walking: Walking, routerUrl: string): Promise<PlanResult> {
  const deadline = nextServiceTime(place.day, place.arriveBy);
  const walkSeconds = String(walking.maxWalkMinutes * 60);
  const params = new URLSearchParams({
    fromPlace: `${home.lat},${home.lon}`,
    toPlace: `${place.lat},${place.lon}`,
    time: deadline.toISOString(),
    arriveBy: 'true',
    searchWindow: String(SEARCH_WINDOW_S),
    pedestrianSpeed: String(WALK_SPEED[walking.walkPace]),
    maxPreTransitTime: walkSeconds,
    maxPostTransitTime: walkSeconds,
    maxDirectTime: walkSeconds,
    transitModes: LOCAL_TRANSIT_MODES,
    detailedTransfers: 'false',
    joinInterlinedLegs: 'true',
  });
  if (walking.stepFree) params.set('pedestrianProfile', 'WHEELCHAIR');
  const raw = await motisGet<MotisPlan>(routerUrl, '/api/v6/plan', params, { heavy: true });
  return {
    key: planKey(home, place, walking, routerUrl),
    placeId: place.id,
    fetchedAt: Date.now(),
    deadlineIso: deadline.toISOString(),
    itineraries: groupItineraries([...(raw.direct ?? []), ...(raw.itineraries ?? [])], deadline),
  };
}

const inflight = new Map<string, Promise<PlanResult>>();

export async function getPlan(
  home: ListingPoint,
  place: Place,
  walking: Walking,
  routerUrl: string,
  allowFetch = true,
): Promise<PlanResult | null> {
  const key = planKey(home, place, walking, routerUrl);
  const sk = planStorageKey(home, place, walking, routerUrl);
  const stored = (await browser.storage.local.get(sk))[sk] as PlanResult | undefined;
  if (stored && stored.key === key && Date.now() - stored.fetchedAt < PLAN_TTL_MS) return stored;
  if (!allowFetch) return null;

  let pending = inflight.get(key);
  if (!pending) {
    pending = fetchPlan(home, place, walking, routerUrl)
      .then(async (plan) => {
        await browser.storage.local.set({ [sk]: plan });
        return plan;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  return pending;
}

/** Saved plans for many home/place pairs in a single storage read. */
export async function getCachedPlans(
  pairs: { home: ListingPoint; place: Place; walking: Walking }[],
  routerUrl: string,
): Promise<Map<string, PlanResult>> {
  const keys = pairs.map((p) => planStorageKey(p.home, p.place, p.walking, routerUrl));
  const found = await browser.storage.local.get(keys);
  const out = new Map<string, PlanResult>();
  pairs.forEach((p, i) => {
    const plan = found[keys[i]] as PlanResult | undefined;
    if (plan && plan.key === planKey(p.home, p.place, p.walking, routerUrl) && Date.now() - plan.fetchedAt < PLAN_TTL_MS) {
      out.set(`${p.home.id}|${p.place.id}`, plan);
    }
  });
  return out;
}

export async function prunePlans(): Promise<void> {
  const all = await browser.storage.local.get(null);
  const stale = Object.entries(all)
    .filter(([k, v]) => k.startsWith('plan:') && Date.now() - ((v as PlanResult)?.fetchedAt ?? 0) > PLAN_TTL_MS)
    .map(([k]) => k);
  if (stale.length) await browser.storage.local.remove(stale);
}

export async function forgetPlans(): Promise<void> {
  const all = await browser.storage.local.get(null);
  await browser.storage.local.remove(Object.keys(all).filter((k) => k.startsWith('plan:')));
}
