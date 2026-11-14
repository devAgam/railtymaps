import type { WalkPace } from './types';

// Meters per second. Typical adult walking speed is about 1.3 m/s; studies of
// older pedestrians put many of them between 0.9 and 1.1.
export const WALK_SPEED: Record<WalkPace, number> = {
  slow: 0.9,
  relaxed: 1.1,
  brisk: 1.3,
};

export const WALK_PACE_LABEL: Record<WalkPace, string> = {
  slow: 'Slow',
  relaxed: 'Relaxed',
  brisk: 'Brisk',
};

export const WALK_PACE_HINT: Record<WalkPace, string> = {
  slow: 'about 2 mph',
  relaxed: 'about 2.5 mph',
  brisk: 'about 3 mph',
};

// Streets don't run in straight lines. A 1.3 detour factor is the usual rule of
// thumb for a street grid, and it matched Transitous' own walk times well enough
// in testing.
export const DETOUR = 1.3;

const EARTH_RADIUS_M = 6371008.8;
const RAD = Math.PI / 180;

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * RAD;
  const dLon = (lon2 - lon1) * RAD;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Estimated walking minutes for a straight-line distance. */
export function walkMinutes(straightMeters: number, speed: number): number {
  return (straightMeters * DETOUR) / speed / 60;
}

/** Straight-line meters someone can cover in `minutes` of walking. */
export function walkRadiusMeters(minutes: number, speed: number): number {
  return (minutes * 60 * speed) / DETOUR;
}

/**
 * Decode a Google-style encoded polyline of any precision
 * (MOTIS uses 7 digits, Google uses 5). Arithmetic instead of bit
 * operations keeps 7-digit longitudes from overflowing 32 bits.
 */
export function decodePolyline(encoded: string, precision = 5): [number, number][] {
  const factor = 10 ** precision;
  const out: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;
  while (index < encoded.length) {
    for (let axis = 0; axis < 2; axis++) {
      let result = 0;
      let scale = 1;
      let b: number;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result += (b & 0x1f) * scale;
        scale *= 32;
      } while (b >= 0x20 && index < encoded.length);
      const delta = result % 2 === 1 ? -(result + 1) / 2 : result / 2;
      if (axis === 0) lat += delta;
      else lon += delta;
    }
    out.push([lat / factor, lon / factor]);
  }
  return out;
}

/** Buckets points into roughly 1 km cells for fast "stops near this home" lookups. */
export class GridIndex {
  private cells = new Map<string, number[]>();

  constructor(
    private readonly lat: number[],
    private readonly lon: number[],
    private readonly cellDeg = 0.01,
  ) {
    for (let i = 0; i < lat.length; i++) {
      const key = this.cellKey(Math.floor(lat[i] / cellDeg), Math.floor(lon[i] / cellDeg));
      let bucket = this.cells.get(key);
      if (!bucket) this.cells.set(key, (bucket = []));
      bucket.push(i);
    }
  }

  private cellKey(i: number, j: number): string {
    return `${i}:${j}`;
  }

  /** Indices of points within `meters` (straight line) of the given point. */
  near(la: number, lo: number, meters: number): number[] {
    const dLat = meters / 111_320;
    const dLon = meters / (111_320 * Math.max(0.01, Math.cos(la * RAD)));
    const i0 = Math.floor((la - dLat) / this.cellDeg);
    const i1 = Math.floor((la + dLat) / this.cellDeg);
    const j0 = Math.floor((lo - dLon) / this.cellDeg);
    const j1 = Math.floor((lo + dLon) / this.cellDeg);
    const out: number[] = [];
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const bucket = this.cells.get(this.cellKey(i, j));
        if (!bucket) continue;
        for (const idx of bucket) {
          if (haversineMeters(la, lo, this.lat[idx], this.lon[idx]) <= meters) out.push(idx);
        }
      }
    }
    return out;
  }
}
