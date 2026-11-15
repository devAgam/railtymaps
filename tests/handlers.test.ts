import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { handleRequest } from '../lib/handlers';
import type { EstimateResponse, MapReach } from '../lib/messages';
import type { Person, Place, PlanResult } from '../lib/types';

const home1 = { id: 'h1', lat: 39.0, lon: -77.03 };
const home2 = { id: 'h2', lat: 39.2, lon: -77.3 }; // nowhere near a stop
const north = (meters: number) => home1.lat + meters / 111_195;

const me: Person = { id: 'me', name: 'Me', color: '#1d4ed8', walkPace: 'relaxed', maxWalkMinutes: 15, stepFree: false };
const dad: Person = { id: 'dad', name: 'Dad', color: '#a21caf', walkPace: 'slow', maxWalkMinutes: 6, stepFree: true };

function place(id: string, personId: string, lat: number, mode: Place['mode'] = 'transit'): Place {
  return { id, personId, label: id, address: 'x', lat, lon: -77.006, arriveBy: '09:00', day: 'weekday', tz: 'America/New_York', mode, enabled: true };
}

const reachResponse = {
  one: { name: '', lat: 38.8977, lon: -77.006 },
  all: [
    { place: { name: 'NEAR STOP', lat: north(300), lon: home1.lon, modes: ['BUS'] }, duration: 20, k: 1 },
    { place: { name: 'Transfer stop', lat: north(600), lon: home1.lon, modes: ['SUBWAY'] }, duration: 50, k: 2 },
    { place: { name: 'The place itself', lat: 38.8977, lon: -77.006 }, duration: 2, k: 0 },
  ],
};

const respond = () => vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify(reachResponse), { status: 200 }));

describe('background request handling', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.restoreAllMocks();
    fakeBrowser.runtime.getManifest = (() => ({ version: '1.0.0' })) as never;
  });

  it('prices every home from one cached reachability query per place', async () => {
    await fakeBrowser.storage.local.set({ people: [me], places: [place('work', 'me', 38.8977)] });
    const fetchMock = respond();

    const res = (await handleRequest({ type: 'estimate', homes: [home1, home2] }, 1)) as EstimateResponse;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe('/api/v6/one-to-all');
    expect(url.searchParams.get('arriveBy')).toBe('true');
    expect(url.searchParams.get('maxPostTransitTime')).toBe('900');
    expect(url.searchParams.get('pedestrianProfile')).toBeNull();
    expect(url.searchParams.get('transitModes')).not.toContain('LONG_DISTANCE');

    expect(res.errors).toEqual({});
    expect(res.results.h1[0]).toMatchObject({ placeId: 'work', minutes: 26, stopName: 'Near Stop', transfers: 0 });
    expect(res.results.h2[0].minutes).toBeNull();

    await handleRequest({ type: 'estimate', homes: [home1] }, 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await new Promise((r) => setTimeout(r, 0));
    expect(await handleRequest({ type: 'usage' }, 1)).toMatchObject({ count: 1, limit: 700, resetsAt: null });

    const map = (await handleRequest({ type: 'reachForMap', placeId: 'work' }, 1)) as MapReach;
    expect(map.dur).toEqual([20, 50]);
    expect(map).toMatchObject({ walkSpeed: 1.1, maxWalk: 15 });
  });

  it("uses each person's own walking limits", async () => {
    await fakeBrowser.storage.local.set({ people: [me, dad], places: [place('clinic', 'dad', 38.95)] });
    const fetchMock = respond();
    const res = (await handleRequest({ type: 'estimate', homes: [home1] }, 1)) as EstimateResponse;
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get('pedestrianSpeed')).toBe('0.9');
    expect(url.searchParams.get('maxPostTransitTime')).toBe('360');
    expect(url.searchParams.get('pedestrianProfile')).toBe('WHEELCHAIR');
    // 300 m at a slow pace is a 7 minute walk, past Dad's 6 minute limit: still a
    // time, but marked with the walk it takes.
    expect(res.results.h1[0]).toMatchObject({ minutes: 27, stopName: 'Near Stop', longWalk: 7 });
  });

  it('leaves hidden places off the badges', async () => {
    await fakeBrowser.storage.local.set({ people: [me], places: [{ ...place('gym', 'me', 38.9), enabled: false }] });
    respond();
    const res = (await handleRequest({ type: 'estimate', homes: [home1] }, 1)) as EstimateResponse;
    expect(res.results.h1).toEqual([]);
  });

  it('marks estimates with the error when the routing server is down', async () => {
    await fakeBrowser.storage.local.set({ people: [me], places: [place('school', 'me', 38.91)] });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const res = (await handleRequest({ type: 'estimate', homes: [home1] }, 1)) as EstimateResponse;
    expect(res.errors.school).toMatch(/Could not reach the routing server/);
    expect(res.results.h1[0]).toMatchObject({ minutes: null, error: res.errors.school });
  });

  it('remembers the home being looked at, per tab', async () => {
    const listing = { site: 'redfin' as const, id: '1', lat: 39, lon: -77, address: '100 Example St' };
    await handleRequest({ type: 'setCurrent', listing }, 7);
    expect(await fakeBrowser.storage.session.get('current:7')).toEqual({ 'current:7': listing });
    await handleRequest({ type: 'setCurrent', listing: null }, 7);
    expect(await fakeBrowser.storage.session.get('current:7')).toEqual({});
  });
});

describe('address search and time zones', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.restoreAllMocks();
    fakeBrowser.runtime.getManifest = (() => ({ version: '1.1.0' })) as never;
  });

  it('searches the whole country, leaning toward a point when given one', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.hostname.includes('census')) return new Response(JSON.stringify({ result: { addressMatches: [] } }));
      return new Response(JSON.stringify([{ type: 'STOP', name: 'Union Station', lat: 34.056, lon: -118.236, tz: 'America/Los_Angeles', areas: [{ name: 'Los Angeles' }] }]));
    });
    const far = (await handleRequest({ type: 'geocode', text: 'Union Station' }, 1)) as { label: string; tz?: string }[];
    expect(far).toEqual([expect.objectContaining({ label: 'Union Station', tz: 'America/Los_Angeles' })]);
    const routerCall = (n: number) => new URL(String(fetchMock.mock.calls.filter(([u]) => !String(u).includes('census'))[n][0]));
    expect(routerCall(0).searchParams.get('place')).toBeNull();

    await handleRequest({ type: 'geocode', text: 'Union Station', near: { lat: 41.88, lon: -87.64 } }, 1);
    expect(routerCall(1).searchParams.get('place')).toBe('41.88,-87.64');
  });

  it("looks up a point's time zone", async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response(JSON.stringify([{ type: 'PLACE', name: 'Somewhere', lat: 41.88, lon: -87.64 }, { type: 'ADDRESS', name: 'x', lat: 41.88, lon: -87.64, tz: 'America/Chicago' }])),
    );
    expect(await handleRequest({ type: 'timezone', lat: 41.88, lon: -87.64 }, 1)).toBe('America/Chicago');
  });
});

describe('places without transit data', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.restoreAllMocks();
    fakeBrowser.runtime.getManifest = (() => ({ version: '1.1.0' })) as never;
  });

  it('says there is no transit data instead of "90+ min"', async () => {
    await fakeBrowser.storage.local.set({ people: [me], places: [place('ranch', 'me', 44.5)] });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ one: {}, all: [] })));
    const res = (await handleRequest({ type: 'estimate', homes: [home1] }, 1)) as EstimateResponse;
    expect(res.errors.ranch).toMatch(/No transit data near ranch/);
    expect(res.results.h1[0]).toMatchObject({ minutes: null, error: res.errors.ranch });
  });
});

// Trip plans are for the next service day, so pin "now" to a Saturday: the
// next weekday deadline is then Tuesday, Nov 17, 2026, 9:00 Eastern (14:00Z).
const SATURDAY = new Date('2026-11-14T15:00:00Z');

describe('driving and walking places', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.restoreAllMocks();
    vi.useFakeTimers({ now: SATURDAY, toFake: ['Date'] });
    fakeBrowser.runtime.getManifest = (() => ({ version: '1.1.0' })) as never;
  });
  afterEach(() => vi.useRealTimers());

  it('times walking places from distance, with no network at all', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    // 300 m north of home1: 300 × 1.3 / 1.1 m/s ≈ 6 minutes.
    await fakeBrowser.storage.local.set({ people: [me], places: [{ ...place('cafe', 'me', north(300), 'walk'), lon: home1.lon }] });
    const res = (await handleRequest({ type: 'estimate', homes: [home1] }, 1)) as EstimateResponse;
    expect(res.results.h1[0]).toMatchObject({ placeId: 'cafe', minutes: 6, walkOnly: true });
    // Shading is rings around the place, out to the longest band.
    expect(await handleRequest({ type: 'reachForMap', placeId: 'cafe' }, 1)).toEqual({ lat: [], lon: [], dur: [], walkSpeed: 1.1, maxWalk: 60 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('routes driving places in one batch and remembers the answers', async () => {
    await fakeBrowser.storage.local.set({ people: [me], places: [place('office', 'me', 38.8977, 'drive')] });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(JSON.stringify([{ duration: 1237 }, {}])));

    const res = (await handleRequest({ type: 'estimate', homes: [home1, home2] }, 1)) as EstimateResponse;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe('/api/v1/one-to-many');
    expect(url.searchParams.get('mode')).toBe('CAR');
    expect(url.searchParams.get('arriveBy')).toBe('true');
    expect(url.searchParams.get('one')).toBe('38.8977;-77.006');
    expect(url.searchParams.get('many')).toBe('39;-77.03,39.2;-77.3');
    expect(res.results.h1[0]).toMatchObject({ placeId: 'office', minutes: 21 });
    expect(res.results.h2[0].minutes).toBeNull(); // no road route in time

    await handleRequest({ type: 'estimate', homes: [home1, home2] }, 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await handleRequest({ type: 'reachForMap', placeId: 'office' }, 1)).toBeNull();
  });

  it('asks for a street-only route when planning a drive', async () => {
    await fakeBrowser.storage.local.set({ people: [me], places: [place('office', 'me', 38.8977, 'drive')] });
    const car = { duration: 1254, startTime: '2026-11-17T13:39:00Z', endTime: '2026-11-17T14:00:00Z', transfers: 0, legs: [{ mode: 'CAR', from: { name: 'START', lat: 39, lon: -77.03 }, to: { name: 'END', lat: 38.9, lon: -77 }, startTime: '2026-11-17T13:39:00Z', endTime: '2026-11-17T14:00:00Z', duration: 1254, distance: 12680 }] };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ direct: [car], itineraries: [] })));
    const plan = (await handleRequest({ type: 'plan', home: home1, placeId: 'office' }, 1)) as { itineraries: { leadMinutes: number; legs: { mode: string }[] }[] };
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get('transitModes')).toBe('');
    expect(url.searchParams.get('directModes')).toBe('CAR');
    expect(url.searchParams.get('maxDirectTime')).toBe(String(6 * 3600));
    expect(plan.itineraries[0]).toMatchObject({ leadMinutes: 21, legs: [{ mode: 'CAR' }] });
  });
});

describe('past the walking limit', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.restoreAllMocks();
    vi.useFakeTimers({ now: SATURDAY, toFake: ['Date'] });
    fakeBrowser.runtime.getManifest = (() => ({ version: '1.1.0' })) as never;
  });
  afterEach(() => vi.useRealTimers());

  const at = (hhmm: string) => `2026-11-17T${hhmm}:00Z`;
  const bus = {
    duration: 2400,
    startTime: at('13:20'),
    endTime: at('14:00'),
    transfers: 0,
    legs: [
      { mode: 'WALK', from: { name: 'START', lat: 39, lon: -77.03 }, to: { name: 'Falls Rd', lat: 39.01, lon: -77.03 }, startTime: at('13:20'), endTime: at('13:32'), duration: 720, distance: 650 },
      { mode: 'BUS', routeShortName: 'M82', from: { name: 'Falls Rd', lat: 39.01, lon: -77.03 }, to: { name: 'END', lat: 38.95, lon: -77.006 }, startTime: at('13:35'), endTime: at('14:00'), duration: 1500 },
    ],
  };

  it('plans again with a longer walk when nothing fits, and says so', async () => {
    await fakeBrowser.storage.local.set({ people: [me, dad], places: [place('clinic', 'dad', 38.95)] });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async () => new Response(JSON.stringify({ direct: [], itineraries: [] })))
      .mockImplementationOnce(async () => new Response(JSON.stringify({ direct: [], itineraries: [bus] })));

    const plan = (await handleRequest({ type: 'plan', home: home1, placeId: 'clinic' }, 1)) as PlanResult;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const walkLimit = (n: number) => new URL(String(fetchMock.mock.calls[n][0])).searchParams.get('maxPreTransitTime');
    expect([walkLimit(0), walkLimit(1)]).toEqual(['360', '3600']);
    expect(plan.overLimit).toBe(true);
    expect(plan.itineraries[0]).toMatchObject({ leadMinutes: 40, longestWalkMinutes: 12 });

    // The badge for that home then shows the planned time, marked with the walk.
    const res = (await handleRequest({ type: 'estimate', homes: [home1] }, 1)) as EstimateResponse;
    expect(res.results.h1[0]).toMatchObject({ minutes: 40, exact: true, longWalk: 12 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('asks only once when a trip fits', async () => {
    await fakeBrowser.storage.local.set({ people: [me], places: [place('work', 'me', 38.95)] });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ direct: [], itineraries: [bus] })));
    const plan = (await handleRequest({ type: 'plan', home: home1, placeId: 'work' }, 1)) as PlanResult;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(plan.overLimit).toBeUndefined();
  });
});

describe('address suggestions', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.restoreAllMocks();
    fakeBrowser.runtime.getManifest = (() => ({ version: '1.1.0' })) as never;
  });

  it('asks only the router geocoder, which handles half-typed text', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(JSON.stringify([{ type: 'STOP', name: 'UNION STATION', lat: 38.9, lon: -77, tz: 'America/New_York' }])));
    const found = (await handleRequest({ type: 'suggest', text: 'union sta', near: { lat: 38.9, lon: -77 } }, 1)) as { label: string }[];
    expect(found.map((f) => f.label)).toEqual(['Union Station']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe('/api/v1/geocode');
    expect(url.searchParams.get('text')).toBe('union sta');
    expect(await handleRequest({ type: 'suggest', text: 'un' }, 1)).toEqual([]);
  });

  it('leaves out matches outside the US', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(
          JSON.stringify([
            { type: 'PLACE', name: 'Willis Tower', lat: 41.88, lon: -87.64, country: 'US', tz: 'America/Chicago' },
            { type: 'PLACE', name: 'Willis Tower Watson', lat: 53.3, lon: -6.2, country: 'IE', tz: 'Europe/Dublin' },
            { type: 'STOP', name: 'Union Station', lat: 43.6, lon: -79.4, country: 'CA', tz: 'America/Toronto' },
          ]),
        ),
    );
    const found = (await handleRequest({ type: 'suggest', text: 'willis' }, 1)) as { label: string }[];
    expect(found.map((f) => f.label)).toEqual(['Willis Tower']);
  });
});
