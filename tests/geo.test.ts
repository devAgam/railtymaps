import { describe, expect, it } from 'vitest';
import { decodePolyline, GridIndex, haversineMeters, walkMinutes, walkRadiusMeters } from '../lib/geo';
import fixture from './fixtures/plan-silver-spring-to-union-station.json';

/** Reference encoder (Google's algorithm, any precision) to round-trip against. */
function encode(points: [number, number][], precision: number): string {
  const factor = 10 ** precision;
  let out = '';
  let prevLat = 0;
  let prevLon = 0;
  const enc = (v: number) => {
    let n = v < 0 ? -2 * v - 1 : 2 * v;
    let s = '';
    while (n >= 32) {
      s += String.fromCharCode((32 | n % 32) + 63);
      n = Math.floor(n / 32);
    }
    return s + String.fromCharCode(n + 63);
  };
  for (const [la, lo] of points) {
    const lat = Math.round(la * factor);
    const lon = Math.round(lo * factor);
    out += enc(lat - prevLat) + enc(lon - prevLon);
    prevLat = lat;
    prevLon = lon;
  }
  return out;
}

describe('distances', () => {
  it('measures Silver Spring to Union Station at about 10.9 km', () => {
    const m = haversineMeters(38.99369, -77.03118, 38.897488, -77.00746);
    expect(m).toBeGreaterThan(10_600);
    expect(m).toBeLessThan(11_200);
  });

  it('turns walking minutes into a straight-line radius and back', () => {
    const r = walkRadiusMeters(15, 1.1);
    expect(walkMinutes(r, 1.1)).toBeCloseTo(15, 6);
  });
});

describe('decodePolyline', () => {
  it("decodes Google's documented example", () => {
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 5)).toEqual([
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ]);
  });

  it('round-trips 7-digit precision without overflowing', () => {
    const pts: [number, number][] = [
      [38.9936912, -77.0311834],
      [38.8974881, -77.0074612],
      [-33.8688197, 151.2092955],
      [64.1265, -179.9999999],
    ];
    const back = decodePolyline(encode(pts, 7), 7);
    back.forEach(([la, lo], i) => {
      expect(la).toBeCloseTo(pts[i][0], 7);
      expect(lo).toBeCloseTo(pts[i][1], 7);
    });
  });

  it('decodes a real Red Line leg from Silver Spring', () => {
    const leg = fixture.itineraries[0].legs[1];
    const path = decodePolyline(leg.legGeometry!.points, leg.legGeometry!.precision);
    expect(path.length).toBeGreaterThan(5);
    expect(haversineMeters(path[0][0], path[0][1], 38.99369, -77.03118)).toBeLessThan(200);
    const last = path[path.length - 1];
    expect(haversineMeters(last[0], last[1], 38.897488, -77.00746)).toBeLessThan(200);
  });
});

describe('GridIndex', () => {
  it('finds exactly the points within the radius', () => {
    const lat = [38.9, 38.9045, 38.91, 38.95];
    const lon = [-77.0, -77.0, -77.0, -77.0];
    const grid = new GridIndex(lat, lon);
    // ~0.5 km and ~1.1 km north of the first point
    expect(grid.near(38.9, -77.0, 600).sort()).toEqual([0, 1]);
    expect(grid.near(38.9, -77.0, 1200).sort()).toEqual([0, 1, 2]);
    expect(grid.near(38.9, -77.0, 100)).toEqual([0]);
  });
});
