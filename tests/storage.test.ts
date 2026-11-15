import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { exportData, getPeople, getPlaces, getSaved, getSettings, importData, migrate, resetAll, SCHEMA, toggleSaved, walkingFor } from '../lib/storage';

describe('storage', () => {
  beforeEach(() => fakeBrowser.reset());

  it('moves 0.1 data into a single person who owns every place', async () => {
    await fakeBrowser.storage.local.set({
      destinations: [{ id: 'd1', label: 'Work', address: 'Union Station', lat: 38.9, lon: -77, arriveBy: '09:00', day: 'weekday', color: '#000', enabled: true }],
      shortlist: [{ site: 'zillow', id: '1', lat: 39, lon: -77, address: 'x', addedAt: 5 }],
      settings: { walkPace: 'average', maxWalkMinutes: 10, stepFree: true, mapDestinationId: 'd1', bands: [20, 40, 60] },
    });
    await migrate();

    const [me] = await getPeople();
    expect(me).toMatchObject({ name: 'Me', walkPace: 'brisk', maxWalkMinutes: 10, stepFree: true });
    const places = await getPlaces();
    expect(places).toEqual([{ id: 'd1', personId: me.id, label: 'Work', address: 'Union Station', lat: 38.9, lon: -77, arriveBy: '09:00', day: 'weekday', tz: 'America/New_York', mode: 'transit', enabled: true }]);
    expect(await getSaved()).toEqual([{ site: 'zillow', id: '1', lat: 39, lon: -77, address: 'x', savedAt: 5 }]);
    expect(await getSettings()).toMatchObject({ shadePlaceId: 'd1', showShading: true, bands: [20, 40, 60], onboarded: true });
    expect(await fakeBrowser.storage.local.get(['destinations', 'shortlist'])).toEqual({});

    // Running it again is a no-op.
    await migrate();
    expect(await getPeople()).toEqual([me]);
  });

  it('leaves a fresh install empty and un-onboarded', async () => {
    await migrate();
    expect(await getPeople()).toEqual([]);
    expect((await getSettings()).onboarded).toBe(false);
    expect((await fakeBrowser.storage.local.get('schema')).schema).toBe(SCHEMA);
  });

  it('takes walking limits from whoever goes to a place', () => {
    const people = [{ id: 'dad', name: 'Dad', color: '#000', walkPace: 'slow' as const, maxWalkMinutes: 8, stepFree: true }];
    const place = { id: 'p', personId: 'dad', label: 'Clinic', address: '', lat: 0, lon: 0, arriveBy: '10:30', day: 'weekday' as const, tz: 'America/Chicago', mode: 'transit' as const, enabled: true };
    expect(walkingFor(place, people)).toEqual({ walkPace: 'slow', maxWalkMinutes: 8, stepFree: true });
    expect(walkingFor({ ...place, personId: 'gone' }, people)).toEqual({ walkPace: 'relaxed', maxWalkMinutes: 15, stepFree: false });
  });

  it('saves and unsaves homes', async () => {
    const home = { site: 'redfin' as const, id: '42', lat: 39, lon: -77, address: '100 Example St' };
    expect(await toggleSaved(home)).toBe(true);
    expect((await getSaved()).map((h) => h.id)).toEqual(['42']);
    expect(await toggleSaved(home)).toBe(false);
    expect(await getSaved()).toEqual([]);
  });

  it('round-trips an export and rejects files that are not ours', async () => {
    await fakeBrowser.storage.local.set({ people: [{ id: 'me', name: 'Me' }], places: [], saved: [] });
    const file = await exportData();
    await resetAll();
    expect(await getPeople()).toEqual([]);
    await importData(JSON.parse(JSON.stringify(file)));
    expect(await getPeople()).toEqual([{ id: 'me', name: 'Me' }]);
    expect((await getSettings()).onboarded).toBe(true);
    await expect(importData({ hello: 'world' })).rejects.toThrow(/isn't a RailtyMaps export/);
    await expect(importData({ ...file, schema: SCHEMA + 1 })).rejects.toThrow(/newer version/);
  });
});

describe('schema 3', () => {
  beforeEach(() => fakeBrowser.reset());

  it('gives places saved by 1.0 the Eastern time zone they were planned in', async () => {
    const place = { id: 'p1', personId: 'me', label: 'Work', address: 'x', lat: 38.9, lon: -77, arriveBy: '09:00', day: 'weekday', enabled: true };
    await fakeBrowser.storage.local.set({ schema: 2, places: [place], settings: { shadePlaceId: 'p1', onboarded: true } });
    await migrate();
    expect(await getPlaces()).toEqual([{ ...place, tz: 'America/New_York', mode: 'transit' }]);
    expect(await getSettings()).toMatchObject({ showShading: true, shadePlaceId: 'p1' });
  });

  it('keeps time zones that are already there, and fills them in on import', async () => {
    const la = { id: 'p2', personId: 'me', label: 'Studio', address: 'x', lat: 34, lon: -118.2, arriveBy: '09:00', day: 'weekday', tz: 'America/Los_Angeles', enabled: true };
    await fakeBrowser.storage.local.set({ schema: 2, places: [la] });
    await migrate();
    expect((await getPlaces())[0].tz).toBe('America/Los_Angeles');

    const { tz: _drop, ...noTz } = la;
    await importData({ app: 'railtymaps', schema: 2, people: [], places: [noTz], saved: [] });
    expect((await getPlaces())[0].tz).toBe('America/New_York');
  });
});

describe('schema 4', () => {
  beforeEach(() => fakeBrowser.reset());

  it('makes every existing place a transit place and keeps the ones that already have a mode', async () => {
    const old = { id: 'p1', personId: 'me', label: 'Work', address: 'x', lat: 38.9, lon: -77, arriveBy: '09:00', day: 'weekday', tz: 'America/New_York', enabled: true };
    const walk = { ...old, id: 'p2', mode: 'walk' };
    await fakeBrowser.storage.local.set({ schema: 3, places: [old, walk] });
    await migrate();
    expect((await getPlaces()).map((p) => p.mode)).toEqual(['transit', 'walk']);
  });
});
