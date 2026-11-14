import { browser } from 'wxt/browser';
import type { Listing, PageStatus, Person, Place, SavedHome, Settings, Walking } from './types';
import { newId } from './util';

// Everything the user enters lives in chrome.storage.local:
//   schema    number, bumped when the shape below changes
//   people    Person[]
//   places    Place[]
//   saved     SavedHome[]
//   settings  Settings
// plus caches the background owns: reach:<placeId>, plan:<hash>, usage.
// Per-tab state (the home being looked at, page status) is in storage.session.

export const SCHEMA = 2;
export const TRANSITOUS_URL = 'https://api.transitous.org';

export const DEFAULT_SETTINGS: Settings = {
  showTransitLines: true,
  showPins: true,
  shadePlaceId: null,
  bands: [30, 45, 60],
  routerUrl: TRANSITOUS_URL,
  onboarded: false,
};

export const DEFAULT_WALKING: Walking = { walkPace: 'relaxed', maxWalkMinutes: 15, stepFree: false };

// Dark enough for white initials to pass 4.5:1, and far enough apart in hue to
// tell people apart on a map.
export const PERSON_COLORS = ['#1d4ed8', '#a21caf', '#0f766e', '#c2410c', '#6d28d9', '#475569'];

export function nextPersonColor(people: Person[]): string {
  const used = new Set(people.map((p) => p.color));
  return PERSON_COLORS.find((c) => !used.has(c)) ?? PERSON_COLORS[people.length % PERSON_COLORS.length];
}

export function newPerson(name: string, people: Person[]): Person {
  return { id: newId(), name, color: nextPersonColor(people), ...DEFAULT_WALKING };
}

async function get<T>(key: string, fallback: T): Promise<T> {
  const result = await browser.storage.local.get(key);
  return (result[key] as T | undefined) ?? fallback;
}

export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await get<Partial<Settings>>('settings', {})) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await browser.storage.local.set({ settings: next });
  return next;
}

export const getPeople = () => get<Person[]>('people', []);
export const getPlaces = () => get<Place[]>('places', []);
export const getSaved = () => get<SavedHome[]>('saved', []);

export const savePeople = (people: Person[]) => browser.storage.local.set({ people });
export const savePlaces = (places: Place[]) => browser.storage.local.set({ places });
export const saveSaved = (saved: SavedHome[]) => browser.storage.local.set({ saved });

/** Walking limits for a place come from whoever goes there. */
export function walkingFor(place: Place, people: Person[]): Walking {
  const person = people.find((p) => p.id === place.personId);
  return person ? { walkPace: person.walkPace, maxWalkMinutes: person.maxWalkMinutes, stepFree: person.stepFree } : DEFAULT_WALKING;
}

export function listingKey(l: Pick<Listing, 'site' | 'id'>): string {
  return `${l.site}:${l.id}`;
}

/** Saves the home if it isn't saved, unsaves it if it is. Returns the new state. */
export async function toggleSaved(listing: Listing): Promise<boolean> {
  const saved = await getSaved();
  const key = listingKey(listing);
  const i = saved.findIndex((h) => listingKey(h) === key);
  if (i >= 0) {
    saved.splice(i, 1);
    await saveSaved(saved);
    return false;
  }
  saved.unshift({ ...listing, savedAt: Date.now() });
  await saveSaved(saved);
  return true;
}

export const currentListingKey = (tabId: number) => `current:${tabId}`;
export const pageStatusKey = (tabId: number) => `status:${tabId}`;

export type { PageStatus };

// ---------------------------------------------------------------- export / import

export interface ExportFile {
  app: 'railtymaps';
  schema: number;
  exportedAt: string;
  people: Person[];
  places: Place[];
  saved: SavedHome[];
  settings: Settings;
}

export async function exportData(): Promise<ExportFile> {
  const [people, places, saved, settings] = await Promise.all([getPeople(), getPlaces(), getSaved(), getSettings()]);
  return { app: 'railtymaps', schema: SCHEMA, exportedAt: new Date().toISOString(), people, places, saved, settings };
}

/** Replaces people, places, saved homes and settings. Throws on a file that isn't ours. */
export async function importData(raw: unknown): Promise<void> {
  const file = raw as Partial<ExportFile>;
  if (file?.app !== 'railtymaps' || !Array.isArray(file.people) || !Array.isArray(file.places)) {
    throw new Error("That file isn't a RailtyMaps export.");
  }
  if ((file.schema ?? 0) > SCHEMA) throw new Error('That export is from a newer version of RailtyMaps. Update first.');
  await browser.storage.local.set({
    schema: SCHEMA,
    people: file.people,
    places: file.places,
    saved: Array.isArray(file.saved) ? file.saved : [],
    settings: { ...DEFAULT_SETTINGS, ...(file.settings ?? {}), onboarded: true },
  });
}

/** Deletes everything, caches included. */
export async function resetAll(): Promise<void> {
  await browser.storage.local.clear();
  await browser.storage.local.set({ schema: SCHEMA });
}

// ---------------------------------------------------------------- migrations

interface V1Destination {
  id: string;
  label: string;
  address: string;
  lat: number;
  lon: number;
  arriveBy: string;
  day: Place['day'];
  enabled: boolean;
}

/**
 * 0.1 kept one set of walking settings and a flat list of "destinations".
 * Turn that into a single person who owns all the places.
 */
export async function migrate(): Promise<void> {
  const stored = await browser.storage.local.get(['schema', 'destinations', 'shortlist', 'settings']);
  if ((stored.schema as number | undefined) === SCHEMA) return;

  const old = (stored.settings ?? {}) as Record<string, unknown>;
  const destinations = (stored.destinations as V1Destination[] | undefined) ?? [];
  const pace = old.walkPace === 'average' ? 'brisk' : ((old.walkPace as Person['walkPace']) ?? 'relaxed');
  const me: Person = {
    id: newId(),
    name: 'Me',
    color: PERSON_COLORS[0],
    walkPace: pace,
    maxWalkMinutes: (old.maxWalkMinutes as number) ?? 15,
    stepFree: !!old.stepFree,
  };
  const places: Place[] = destinations.map((d) => ({
    id: d.id,
    personId: me.id,
    label: d.label,
    address: d.address,
    lat: d.lat,
    lon: d.lon,
    arriveBy: d.arriveBy,
    day: d.day,
    enabled: d.enabled,
  }));
  const shortlist = (stored.shortlist as (Listing & { addedAt?: number })[] | undefined) ?? [];

  const update: Record<string, unknown> = { schema: SCHEMA };
  if (destinations.length) {
    update.people = [me];
    update.places = places;
    update.settings = {
      ...DEFAULT_SETTINGS,
      showTransitLines: old.showTransitLines ?? true,
      shadePlaceId: (old.mapDestinationId as string | null) ?? null,
      bands: (old.bands as Settings['bands']) ?? DEFAULT_SETTINGS.bands,
      routerUrl: (old.routerUrl as string) ?? TRANSITOUS_URL,
      onboarded: true,
    };
  }
  if (shortlist.length) {
    update.saved = shortlist.map(({ addedAt, ...home }) => ({ ...home, savedAt: addedAt ?? Date.now() }));
  }
  await browser.storage.local.set(update);
  await browser.storage.local.remove(['destinations', 'shortlist']);
}
