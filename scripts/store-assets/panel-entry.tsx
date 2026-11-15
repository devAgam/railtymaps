// The real side panel, running as a normal page with fake extension APIs and
// a sample household. Query params pick the state:
//   ?state=onboarding   first run, nothing stored
//   (default)           a household with three places and saved homes
//   ?modes=mixed        same, but Me drives to work and Dad walks to church
//   &home=39.02,-77.22  open a made-up listing at that point instead of a saved one
import { handleRequest } from '../../lib/handlers';
import type { Request } from '../../lib/messages';
import { SCHEMA } from '../../lib/storage';
import { browser, setDispatch } from './fake-browser';
import { people, places, saved } from './sample-data';

setDispatch((msg) => handleRequest(msg as Request, 1));

const params = new URLSearchParams(location.search);
if (params.get('state') !== 'onboarding') {
  const mixed = params.get('modes') === 'mixed';
  void browser.storage.local.set({
    schema: SCHEMA,
    people,
    places: mixed ? places.map((p) => ({ ...p, mode: p.id === 'work' ? 'drive' : p.id === 'church' ? 'walk' : p.mode })) : places,
    saved,
    settings: { onboarded: true, shadePlaceId: 'work' },
  });
  const at = params.get('home')?.split(',').map(Number);
  const current = at?.length === 2 ? { ...saved[0], id: 'preview', address: `Preview home, ${at[0]}, ${at[1]}`, lat: at[0], lon: at[1] } : saved[0];
  void browser.storage.session.set({ 'current:1': current });
}

// Imported after seeding so the panel's first read sees the data.
void import('../../entrypoints/sidepanel/main');
