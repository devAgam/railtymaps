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
    expect(places).toEqual([{ id: 'd1', personId: me.id, label: 'Work', address: 'Union Station', lat: 38.9, lon: -77, arriveBy: '09:00', day: 'weekday', enabled: true }]);
    expect(await getSaved()).toEqual([{ site: 'zillow', id: '1', lat: 39, lon: -77, address: 'x', savedAt: 5 }]);
    expect(await getSettings()).toMatchObject({ shadePlaceId: 'd1', bands: [20, 40, 60], onboarded: true });
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
    const place = { id: 'p', personId: 'dad', label: 'Clinic', address: '', lat: 0, lon: 0, arriveBy: '10:30', day: 'weekday' as const, enabled: true };
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
