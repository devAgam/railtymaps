import { browser } from 'wxt/browser';
import { DAILY_ROUTING_LIMIT, userAgent } from './app';

// Requests to a MOTIS 2 server. Transitous is the public instance; a MOTIS you
// run yourself has the same API, so only the base URL changes. Only the
// background script calls this (it has the host permissions).

// Amtrak, intercity coaches and planes aren't anyone's daily commute, and
// leaving them in produced "fastest" trips via an Amtrak train that costs $30.
export const LOCAL_TRANSIT_MODES = 'BUS,TRAM,SUBWAY,METRO,FERRY,REGIONAL_RAIL,REGIONAL_FAST_RAIL,SUBURBAN';

export class RouterError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'RouterError';
  }
}

const DAY_MS = 24 * 3600 * 1000;
let usageChain: Promise<unknown> = Promise.resolve();

async function readUsage(): Promise<number[]> {
  const { usage } = await browser.storage.local.get('usage');
  const now = Date.now();
  return ((usage as number[]) ?? []).filter((t) => now - t < DAY_MS);
}

/** Trip searches sent in the last 24 hours. */
export async function usageLast24h(): Promise<number> {
  return (await readUsage()).length;
}

/** Usage plus, when the limit is hit, the moment the oldest search ages out. */
export async function usageInfo(): Promise<{ count: number; limit: number; resetsAt: number | null }> {
  const list = await readUsage();
  const resetsAt = list.length >= DAILY_ROUTING_LIMIT ? Math.min(...list) + DAY_MS : null;
  return { count: list.length, limit: DAILY_ROUTING_LIMIT, resetsAt };
}

// The daily cap exists for Transitous' sake. Someone running their own MOTIS
// server can search as much as they like.
const isTransitous = (baseUrl: string) => /(^|\/\/)api\.transitous\.org/.test(baseUrl);

function recordUsage(): Promise<unknown> {
  // Serialize read-modify-write so parallel requests don't lose counts.
  usageChain = usageChain.then(async () => {
    const list = await readUsage();
    list.push(Date.now());
    await browser.storage.local.set({ usage: list });
  });
  return usageChain;
}

interface GetOptions {
  /** Counts toward the daily budget (plan / one-to-all). */
  heavy: boolean;
  timeoutMs?: number;
}

export async function motisGet<T>(baseUrl: string, path: string, params: URLSearchParams, opts: GetOptions): Promise<T> {
  if (opts.heavy && isTransitous(baseUrl)) {
    const used = await usageLast24h();
    if (used >= DAILY_ROUTING_LIMIT) {
      throw new RouterError(
        `New trip searches are paused: ${used} in the last 24 hours is as many as RailtyMaps sends to the free routing service. Saved results still show.`,
        429,
      );
    }
  }
  const url = `${baseUrl.replace(/\/+$/, '')}${path}?${params.toString()}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 45_000);
  try {
    // Chrome ignores User-Agent here; a declarativeNetRequest rule sets it instead
    // (see installUserAgentRule). Firefox honors it directly.
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json', 'User-Agent': userAgent() },
    });
    if (opts.heavy) void recordUsage();
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = (await res.json()) as { error?: string };
        if (body?.error) detail = body.error;
      } catch {
        /* not JSON */
      }
      throw new RouterError(`Routing server said ${res.status}: ${detail}`, res.status);
    }
    return (await res.json()) as T;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new RouterError('The routing server took too long to answer.');
    if (e instanceof RouterError) throw e;
    throw new RouterError(`Could not reach the routing server (${(e as Error).message}).`);
  } finally {
    clearTimeout(timer);
  }
}

const UA_RULE_ID = 1;

/**
 * Chrome silently drops a User-Agent passed to fetch(), so a session-scoped
 * declarativeNetRequest rule sets it instead. tabIds: [-1] limits the rule to
 * requests that don't come from a tab, i.e. ours; pages that call Transitous
 * themselves are left alone. Session rules don't survive a browser restart,
 * which is why the background reinstalls this on startup.
 */
export async function installUserAgentRule(): Promise<void> {
  const dnr = browser.declarativeNetRequest;
  if (!dnr?.updateSessionRules) return;
  await dnr.updateSessionRules({
    removeRuleIds: [UA_RULE_ID],
    addRules: [
      {
        id: UA_RULE_ID,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [{ header: 'User-Agent', operation: 'set', value: userAgent() }],
        },
        condition: {
          requestDomains: ['api.transitous.org'],
          tabIds: [-1],
          resourceTypes: ['xmlhttprequest', 'other'],
        },
      },
    ] as never,
  });
}

// ---- Response shapes (only the fields we use) ----

export interface MotisPlace {
  name: string;
  stopId?: string;
  lat: number;
  lon: number;
  modes?: string[];
}

export interface MotisReachable {
  one: MotisPlace;
  all: { place: MotisPlace; duration: number; k: number }[];
}

export interface MotisLeg {
  mode: string;
  from: MotisPlace;
  to: MotisPlace;
  startTime: string;
  endTime: string;
  duration: number;
  distance?: number;
  routeShortName?: string;
  routeLongName?: string;
  displayName?: string;
  agencyName?: string;
  headsign?: string;
  routeColor?: string;
  routeTextColor?: string;
  intermediateStops?: unknown[];
  legGeometry?: { points: string; precision: number; length: number };
}

export interface MotisItinerary {
  duration: number;
  startTime: string;
  endTime: string;
  transfers: number;
  legs: MotisLeg[];
}

export interface MotisPlan {
  itineraries: MotisItinerary[];
  direct?: MotisItinerary[];
}

export interface MotisMatch {
  type: 'ADDRESS' | 'PLACE' | 'STOP';
  name: string;
  lat: number;
  lon: number;
  street?: string;
  houseNumber?: string;
  zip?: string;
  /** ISO country code, e.g. "US". */
  country?: string;
  tz?: string;
  areas?: { name: string; adminLevel?: number; default?: boolean }[];
}
