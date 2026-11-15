import { browser } from 'wxt/browser';
import type { Estimate, GeocodeResult, Listing, ListingPoint, PageStatus, PlanResult, SimpleItinerary } from './types';

/** Requests the background script answers (see lib/handlers.ts). */
export type Request =
  | { type: 'estimate'; homes: ListingPoint[] }
  | { type: 'reachForMap'; placeId: string }
  | { type: 'plan'; home: ListingPoint; placeId: string; allowFetch?: boolean }
  | { type: 'geocode'; text: string; near?: { lat: number; lon: number } }
  | { type: 'suggest'; text: string; near?: { lat: number; lon: number } }
  | { type: 'timezone'; lat: number; lon: number }
  | { type: 'setCurrent'; listing: Listing | null }
  | { type: 'pageStatus'; status: PageStatus }
  | { type: 'openPanel'; listing?: Listing }
  | { type: 'usage' }
  | { type: 'clearCache' };

export interface EstimateResponse {
  /** listing id → one estimate per visible place, in place order */
  results: Record<string, Estimate[]>;
  /** place id → why it couldn't be estimated */
  errors: Record<string, string>;
}

export interface MapReach {
  lat: number[];
  lon: number[];
  dur: number[];
  /** Walking speed (m/s) and limit (minutes) the reach was computed with. */
  walkSpeed: number;
  maxWalk: number;
}

export interface Usage {
  count: number;
  limit: number;
  /** When the oldest search in the window ages out, if the limit is reached. */
  resetsAt: number | null;
}

export interface ResponseMap {
  estimate: EstimateResponse;
  reachForMap: MapReach | null;
  plan: PlanResult | null;
  geocode: GeocodeResult[];
  suggest: GeocodeResult[];
  timezone: string | null;
  setCurrent: null;
  pageStatus: null;
  openPanel: { opened: boolean };
  usage: Usage;
  clearCache: null;
}

type Wrapped<T> = { ok: true; value: T } | { ok: false; error: string };

// chrome.runtime messaging can't carry thrown errors, so the background wraps
// every answer and send() unwraps it back into a resolve/reject.
export async function send<R extends Request>(msg: R): Promise<ResponseMap[R['type']]> {
  const res = (await browser.runtime.sendMessage(msg)) as Wrapped<ResponseMap[R['type']]> | undefined;
  if (!res) throw new Error('RailtyMaps background did not respond.');
  if (!res.ok) throw new Error(res.error);
  return res.value;
}

export const wrapOk = <T>(value: T): Wrapped<T> => ({ ok: true, value });

export const wrapError = (e: unknown): Wrapped<never> => ({
  ok: false,
  error: e instanceof Error ? e.message : String(e),
});

/** Messages the side panel sends to a tab's content script. */
export type TabMessage = { type: 'showRoute'; itinerary: SimpleItinerary } | { type: 'clearRoute' };
