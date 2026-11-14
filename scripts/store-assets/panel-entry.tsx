// The real side panel, running as a normal page with fake extension APIs and
// a sample household. Query params pick the state:
//   ?state=onboarding   first run, nothing stored
//   (default)           a household with three places and saved homes
import { handleRequest } from '../../lib/handlers';
import type { Request } from '../../lib/messages';
import { SCHEMA } from '../../lib/storage';
import { browser, setDispatch } from './fake-browser';
import { people, places, saved } from './sample-data';

setDispatch((msg) => handleRequest(msg as Request, 1));

const params = new URLSearchParams(location.search);
if (params.get('state') !== 'onboarding') {
  void browser.storage.local.set({
    schema: SCHEMA,
    people,
    places,
    saved,
    settings: { onboarded: true, shadePlaceId: 'work' },
  });
  void browser.storage.session.set({ 'current:1': saved[0] });
}

// Imported after seeding so the panel's first read sees the data.
void import('../../entrypoints/sidepanel/main');
