export type DayType = 'weekday' | 'saturday' | 'sunday';

export type WalkPace = 'slow' | 'relaxed' | 'brisk';

/** Someone in the household. Walking limits are per person because they really differ. */
export interface Person {
  id: string;
  name: string;
  color: string;
  walkPace: WalkPace;
  /** Longest walk to or from a stop, in minutes. */
  maxWalkMinutes: number;
  /** Ask the router for step-free paths and transfers. */
  stepFree: boolean;
}

/** The parts of a person that change a route. */
export type Walking = Pick<Person, 'walkPace' | 'maxWalkMinutes' | 'stepFree'>;

/** Somewhere a person needs to get to regularly. */
export interface Place {
  id: string;
  personId: string;
  label: string;
  address: string;
  lat: number;
  lon: number;
  /** Local wall-clock deadline, "HH:MM" in 24-hour time. */
  arriveBy: string;
  day: DayType;
  /** Hidden places keep their routes but drop off the listing badges. */
  enabled: boolean;
}

export interface Settings {
  showTransitLines: boolean;
  showPins: boolean;
  /** Place whose reachable area is shaded on the listing map. */
  shadePlaceId: string | null;
  /** Upper bounds, in minutes, of the short / medium / long color bands. */
  bands: [number, number, number];
  /** MOTIS 2 server. Transitous is the free public one. */
  routerUrl: string;
  onboarded: boolean;
}

export type Site = 'zillow' | 'redfin';

export interface Listing {
  site: Site;
  /** The site's own id: Zillow's zpid, Redfin's property id. */
  id: string;
  lat: number;
  lon: number;
  address: string;
  url?: string;
  price?: number;
  beds?: number;
  baths?: number;
}

export type ListingPoint = Pick<Listing, 'id' | 'lat' | 'lon'>;

export interface SavedHome extends Listing {
  savedAt: number;
}

/**
 * Every stop that can still reach a place by its deadline, as parallel arrays
 * so a cache entry for ~17k stops stays under a megabyte.
 */
export interface CompactReach {
  v: 1;
  key: string;
  placeId: string;
  fetchedAt: number;
  /** The concrete trip time used for the query, e.g. next Tuesday 9:00 local. */
  arriveAtIso: string;
  maxTravelMinutes: number;
  lat: number[];
  lon: number[];
  /** Minutes before the deadline you must leave this stop. */
  dur: number[];
  /** Vehicles used, i.e. transfers + 1. */
  k: number[];
  name: string[];
  /** Comma-joined transit modes served at the stop. */
  modes: string[];
}

/** One listing's time to one place. */
export interface Estimate {
  placeId: string;
  /** Minutes before the deadline you must leave home; null when nothing gets there in time. */
  minutes: number | null;
  walkMinutes?: number;
  stopName?: string;
  transfers?: number;
  modes?: string;
  walkOnly?: boolean;
  /** Set once a full trip plan has replaced the quick estimate. */
  exact?: boolean;
  /** Why there's no number (server down, daily limit...). */
  error?: string;
}

export interface SimpleLeg {
  mode: string;
  /** Short line label, e.g. "R", "70", "Brunswick". */
  route?: string;
  routeLong?: string;
  agency?: string;
  headsign?: string;
  color?: string;
  textColor?: string;
  from: string;
  to: string;
  startIso: string;
  endIso: string;
  minutes: number;
  meters?: number;
  stops?: number;
  polyline?: string;
  precision?: number;
}

export interface SimpleItinerary {
  /** Vehicles in order, e.g. "BUS:70>SUBWAY:R". Same signature = same trip at another time. */
  signature: string;
  departIso: string;
  arriveIso: string;
  rideMinutes: number;
  /** Minutes before the deadline you must leave home. */
  leadMinutes: number;
  transfers: number;
  walkMinutes: number;
  walkMeters: number;
  /** Longest single walk, to check against the person's limit. */
  longestWalkMinutes: number;
  legs: SimpleLeg[];
  /** Other departures in the search window that use the same vehicles. */
  alsoDepartsIso: string[];
}

export interface PlanResult {
  key: string;
  placeId: string;
  fetchedAt: number;
  deadlineIso: string;
  itineraries: SimpleItinerary[];
}

export interface GeocodeResult {
  label: string;
  detail: string;
  lat: number;
  lon: number;
  source: 'census' | 'router';
}

/** What the content script last saw on a tab, so the panel can explain problems. */
export interface PageStatus {
  site: Site;
  url: string;
  searchPage: boolean;
  cards: number;
  checkedAt: number;
}
