import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { handleRequest } from '../lib/handlers';
import type { EstimateResponse, MapReach } from '../lib/messages';
import type { Person, Place } from '../lib/types';

const home1 = { id: 'h1', lat: 39.0, lon: -77.03 };
const home2 = { id: 'h2', lat: 39.2, lon: -77.3 }; // nowhere near a stop
const north = (meters: number) => home1.lat + meters / 111_195;

const me: Person = { id: 'me', name: 'Me', color: '#1d4ed8', walkPace: 'relaxed', maxWalkMinutes: 15, stepFree: false };
const dad: Person = { id: 'dad', name: 'Dad', color: '#a21caf', walkPace: 'slow', maxWalkMinutes: 6, stepFree: true };

function place(id: string, personId: string, lat: number): Place {
  return { id, personId, label: id, address: 'x', lat, lon: -77.006, arriveBy: '09:00', day: 'weekday', enabled: true };
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
    // 300 m at a slow pace is a 7 minute walk, past Dad's 6 minute limit.
    expect(res.results.h1[0].minutes).toBeNull();
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
