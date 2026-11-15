import { describe, expect, it } from 'vitest';
import { bandIndex, estimateFromPlan, estimateOne } from '../lib/estimate';
import { GridIndex, haversineMeters } from '../lib/geo';
import type { CompactReach, Place, PlanResult, Walking } from '../lib/types';

const place: Place = {
  id: 'work',
  personId: 'me',
  label: 'Work',
  address: 'Union Station',
  lat: 38.8977,
  lon: -77.006,
  arriveBy: '09:00',
  day: 'weekday',
  tz: 'America/New_York',
  mode: 'transit',
  enabled: true,
};

const home = { id: 'h1', lat: 39.0, lon: -77.03 };
const north = (meters: number) => home.lat + meters / 111_195;
const walking = (patch: Partial<Walking> = {}): Walking => ({ walkPace: 'relaxed', maxWalkMinutes: 15, stepFree: false, ...patch });

function reachOf(stops: { lat: number; lon: number; dur: number; k: number; name: string }[]): CompactReach {
  return {
    v: 1,
    key: 'k',
    placeId: place.id,
    fetchedAt: Date.now(),
    arriveAtIso: '2026-11-17T14:00:00.000Z',
    maxTravelMinutes: 90,
    lat: stops.map((s) => s.lat),
    lon: stops.map((s) => s.lon),
    dur: stops.map((s) => s.dur),
    k: stops.map((s) => s.k),
    name: stops.map((s) => s.name),
    modes: stops.map(() => 'BUS'),
  };
}

describe('estimateOne', () => {
  const reach = reachOf([
    { lat: north(300), lon: home.lon, dur: 20, k: 1, name: 'Near stop' },
    { lat: north(900), lon: home.lon, dur: 5, k: 2, name: 'Far fast stop' },
    { lat: north(3000), lon: home.lon, dur: 1, k: 1, name: 'Too far' },
  ]);
  const grid = new GridIndex(reach.lat, reach.lon);

  it('walks to the best stop inside the walking limit', () => {
    // Relaxed pace with a 15 minute limit reaches about 760 m in a straight line.
    const e = estimateOne(home, place, reach, grid, walking());
    expect(e).toMatchObject({ stopName: 'Near stop', walkMinutes: 6, minutes: 26, transfers: 0 });
  });

  it('takes a farther, faster stop when the person can walk that far', () => {
    const e = estimateOne(home, place, reach, grid, walking({ maxWalkMinutes: 20 }));
    expect(e).toMatchObject({ stopName: 'Far fast stop', minutes: 23, transfers: 1 });
  });

  it('gets slower and shorter-ranged for a slow walker', () => {
    // At 0.9 m/s a 10 minute limit is about 415 m: still the near stop, but a longer walk.
    const e = estimateOne(home, place, reach, grid, walking({ walkPace: 'slow', maxWalkMinutes: 10 }));
    expect(e).toMatchObject({ stopName: 'Near stop', walkMinutes: 7, minutes: 27 });
  });

  it('still gives a time past the walking limit, marked with the walk it takes', () => {
    // With a 6 minute limit nothing fits: the near stop is a 7 minute walk at a slow
    // pace, the fast one 22. The fast one would save half a minute, so the shorter walk wins.
    const e = estimateOne(home, place, reach, grid, walking({ walkPace: 'slow', maxWalkMinutes: 6 }));
    expect(e).toMatchObject({ stopName: 'Near stop', walkMinutes: 7, minutes: 27, longWalk: 7 });
    // Trips inside the limit are never marked.
    expect(estimateOne(home, place, reach, grid, walking()).longWalk).toBeUndefined();
    // An hour on foot is as far as it looks.
    const farAway = { id: 'h3', lat: north(-5000), lon: home.lon };
    expect(estimateOne(farAway, place, reach, grid, walking()).minutes).toBeNull();
  });

  it('says out of range when nothing is reachable', () => {
    expect(estimateOne(home, place, reachOf([]), new GridIndex([], []), walking()).minutes).toBeNull();
  });

  it('notices when the place is a short walk away', () => {
    const near = { id: 'h2', lat: place.lat + 400 / 111_195, lon: place.lon };
    expect(haversineMeters(near.lat, near.lon, place.lat, place.lon)).toBeCloseTo(400, -1);
    expect(estimateOne(near, place, reachOf([]), new GridIndex([], []), walking())).toMatchObject({ walkOnly: true, minutes: 8 });
  });
});

describe('estimateFromPlan', () => {
  it('turns the best saved itinerary into an exact estimate', () => {
    const plan: PlanResult = {
      key: 'p',
      placeId: 'work',
      fetchedAt: Date.now(),
      deadlineIso: '2026-11-17T14:00:00.000Z',
      itineraries: [
        {
          signature: 'SUBWAY:R',
          departIso: '2026-11-17T13:41:00Z',
          arriveIso: '2026-11-17T14:00:00Z',
          rideMinutes: 19,
          leadMinutes: 19,
          transfers: 0,
          walkMinutes: 5,
          walkMeters: 303,
          longestWalkMinutes: 4,
          alsoDepartsIso: [],
          legs: [
            { mode: 'WALK', from: 'Home', to: 'Silver Spring', startIso: '', endIso: '', minutes: 1 },
            { mode: 'SUBWAY', route: 'R', from: 'Silver Spring', to: 'Union Station', startIso: '', endIso: '', minutes: 14 },
            { mode: 'WALK', from: 'Union Station', to: 'Destination', startIso: '', endIso: '', minutes: 4 },
          ],
        },
      ],
    };
    expect(estimateFromPlan(plan, 'work')).toMatchObject({ placeId: 'work', minutes: 19, exact: true, stopName: 'Silver Spring', walkMinutes: 1, transfers: 0 });
    expect(estimateFromPlan(plan, 'work')?.longWalk).toBeUndefined();
    // A plan that had to allow a longer walk says how long.
    expect(estimateFromPlan({ ...plan, overLimit: true }, 'work')).toMatchObject({ minutes: 19, longWalk: 4 });
    // A place re-added at the same spot gets a new id but reuses the cached plan.
    expect(estimateFromPlan(plan, 'work-again')?.placeId).toBe('work-again');
    expect(estimateFromPlan({ ...plan, itineraries: [] }, 'work')).toBeNull();
  });
});

describe('bandIndex', () => {
  it('puts minutes into color bands', () => {
    const bands = [30, 45, 60];
    expect([12, 30, 31, 60, 61].map((m) => bandIndex(m, bands))).toEqual([0, 0, 1, 2, 3]);
    expect(bandIndex(null, bands)).toBe(-1);
  });
});
