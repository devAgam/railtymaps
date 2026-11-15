import { GridIndex, haversineMeters, LONGEST_WALK_MINUTES, walkMinutes, walkRadiusMeters, WALK_SPEED } from './geo';
import type { CompactReach, Estimate, ListingPoint, Place, PlanResult, Walking } from './types';

/**
 * Quick estimate for one home: walk to each stop within the person's walking
 * limit, add how early you'd have to leave that stop, keep the smallest total.
 *
 * The result means "leave home this many minutes before the deadline", the
 * same thing a full trip plan reports, so badges and the side panel agree. In
 * testing against full plans on DC routes it landed within about 2 minutes.
 *
 * If no stop is within the limit, it looks again with up to an hour's walk and
 * says so in `longWalk`. For a home just past the limit, "~38, with a 12-minute
 * walk" is more useful than "90+", as long as it's marked.
 */
export function estimateOne(
  home: ListingPoint,
  place: Place,
  reach: CompactReach,
  grid: GridIndex,
  walking: Walking,
): Estimate {
  const within = fastest(home, place, reach, grid, walking, walking.maxWalkMinutes);
  if (within.minutes != null || walking.maxWalkMinutes >= LONGEST_WALK_MINUTES) return within;
  const longer = fastest(home, place, reach, grid, walking, LONGEST_WALK_MINUTES);
  if (longer.minutes == null) return within;
  // Rounding can make a walk just past the limit look equal to it.
  return { ...longer, longWalk: Math.max(longer.walkMinutes ?? 0, walking.maxWalkMinutes + 1) };
}

function fastest(home: ListingPoint, place: Place, reach: CompactReach, grid: GridIndex, walking: Walking, maxWalk: number): Estimate {
  const speed = WALK_SPEED[walking.walkPace];
  // Past the person's limit every extra minute on foot counts double, so a
  // 7-minute walk to a bus beats a 22-minute walk to a train that's a minute faster.
  const cost = (total: number, walk: number) => total + Math.max(0, walk - walking.maxWalkMinutes);
  let best: Estimate = { placeId: place.id, minutes: null };
  let bestCost = Infinity;

  const direct = walkMinutes(haversineMeters(home.lat, home.lon, place.lat, place.lon), speed);
  if (direct <= maxWalk) {
    bestCost = cost(direct, direct);
    best = { placeId: place.id, minutes: Math.round(direct), walkMinutes: Math.round(direct), walkOnly: true };
  }

  for (const i of grid.near(home.lat, home.lon, walkRadiusMeters(maxWalk, speed))) {
    const walk = walkMinutes(haversineMeters(home.lat, home.lon, reach.lat[i], reach.lon[i]), speed);
    const total = walk + reach.dur[i];
    if (cost(total, walk) < bestCost) {
      bestCost = cost(total, walk);
      best = {
        placeId: place.id,
        minutes: Math.round(total),
        walkMinutes: Math.round(walk),
        stopName: reach.name[i],
        transfers: Math.max(0, reach.k[i] - 1),
        modes: reach.modes[i],
      };
    }
  }
  return best;
}

/**
 * A saved full trip plan beats the quick estimate. Plans are cached by
 * location and settings, not by place id (a place deleted and re-added at the
 * same spot reuses them), so the id comes from the caller.
 */
export function estimateFromPlan(plan: PlanResult, placeId: string): Estimate | null {
  const best = plan.itineraries[0];
  if (!best) return null;
  const rides = best.legs.filter((l) => l.mode !== 'WALK');
  const first = best.legs[0];
  return {
    placeId,
    minutes: best.leadMinutes,
    // The walk to the first stop, the same thing a quick estimate reports.
    walkMinutes: first?.mode === 'WALK' ? first.minutes : 0,
    stopName: rides[0]?.from,
    transfers: best.transfers,
    modes: rides.map((l) => l.mode).join(','),
    walkOnly: rides.length === 0,
    ...(plan.overLimit ? { longWalk: best.longestWalkMinutes } : {}),
    exact: true,
  };
}

/** Color band for a time: 0 shortest … bands.length for "longer than every band", -1 unknown. */
export function bandIndex(minutes: number | null | undefined, bands: readonly number[]): number {
  if (minutes == null) return -1;
  for (let i = 0; i < bands.length; i++) if (minutes <= bands[i]) return i;
  return bands.length;
}
