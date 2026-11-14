// Messages between the content script (isolated world) and the map script
// (page world, where the site's Google Map lives). They go over
// window.postMessage, so everything here has to be plain JSON.

export const TO_MAP = 'railtymaps:to-map';
export const FROM_MAP = 'railtymaps:from-map';

export interface ReachLayer {
  lat: number[];
  lon: number[];
  /** Minutes before the deadline you must leave each stop. */
  dur: number[];
  bands: number[];
  /** Walking speed in m/s and the walking limit in minutes, for sizing circles. */
  walkSpeed: number;
  maxWalk: number;
  placeLat: number;
  placeLon: number;
}

export interface MapPin {
  lat: number;
  lon: number;
  label: string;
  color: string;
}

export interface RouteLeg {
  mode: string;
  polyline: string;
  precision: number;
  color?: string;
}

/** The map's corner legend: what's shaded and a switcher for the other places. */
export interface Legend {
  activeId: string | null;
  options: { id: string; label: string }[];
  bands: number[];
}

export interface MapState {
  transitLines: boolean;
  reach: ReachLayer | null;
  pins: MapPin[];
  route: { legs: RouteLeg[] } | null;
  legend: Legend | null;
}

export type MapPatch = Partial<MapState>;

export type FromMap =
  | { channel: typeof FROM_MAP; type: 'ready' }
  | { channel: typeof FROM_MAP; type: 'status'; mapFound: boolean }
  | { channel: typeof FROM_MAP; type: 'shade'; placeId: string | null };

/** Fills for the short / medium / long bands; lightness rises with time so they read in grayscale. */
export const BAND_FILLS = ['#047857', '#ca8a04', '#fdba74'];
