import { GridIndex, haversineMeters, walkMinutes, walkRadiusMeters, WALK_SPEED } from './geo';
import type { CompactReach, Estimate, ListingPoint, Place, PlanResult, Walking } from './types';

/**
 * Quick estimate for one home: walk to each stop within the person's walking
 * limit, add how early you'd have to leave that stop, keep the smallest total.
 *
 * The result means "leave home this many minutes before the deadline", the
 * same thing a full trip plan reports, so badges and the side panel agree. In
 * testing against full plans on DC routes it landed within about 2 minutes.
 */
export function estimateOne(
  home: ListingPoint,
  place: Place,
  reach: CompactReach,
  grid: GridIndex,
  walking: Walking,
): Estimate {
  const speed = WALK_SPEED[walking.walkPace];
  let best: Estimate = { placeId: place.id, minutes: null };
  let bestMinutes = Infinity;

  const direct = walkMinutes(haversineMeters(home.lat, home.lon, place.lat, place.lon), speed);
  if (direct <= walking.maxWalkMinutes) {
    bestMinutes = direct;
    best = { placeId: place.id, minutes: Math.round(direct), walkMinutes: Math.round(direct), walkOnly: true };
  }

  for (const i of grid.near(home.lat, home.lon, walkRadiusMeters(walking.maxWalkMinutes, speed))) {
    const walk = walkMinutes(haversineMeters(home.lat, home.lon, reach.lat[i], reach.lon[i]), speed);
    const total = walk + reach.dur[i];
    if (total < bestMinutes) {
      bestMinutes = total;
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

/** A saved full trip plan beats the quick estimate. */
export function estimateFromPlan(plan: PlanResult): Estimate | null {
  const best = plan.itineraries[0];
  if (!best) return null;
  const rides = best.legs.filter((l) => l.mode !== 'WALK');
  return {
    placeId: plan.placeId,
    minutes: best.leadMinutes,
    walkMinutes: best.walkMinutes,
    stopName: rides[0]?.from,
    transfers: best.transfers,
    modes: rides.map((l) => l.mode).join(','),
    walkOnly: rides.length === 0,
    exact: true,
  };
}

/** Color band for a time: 0 shortest … bands.length for "longer than every band", -1 unknown. */
export function bandIndex(minutes: number | null | undefined, bands: readonly number[]): number {
  if (minutes == null) return -1;
  for (let i = 0; i < bands.length; i++) if (minutes <= bands[i]) return i;
  return bands.length;
}
