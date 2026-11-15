import { haversineMeters } from './geo';
import { motisGet, type MotisMatch } from './motis';
import type { GeocodeResult } from './types';
import { prettyName } from './util';

// Two geocoders, because neither is good at everything. The Census Bureau's is
// exact for US street addresses but knows nothing about named places. The
// router's own geocoder (built from OpenStreetMap) finds "Union Station" or
// "NIH Clinical Center" but is spottier on house numbers, and it knows each
// result's time zone.

export interface Near {
  lat: number;
  lon: number;
}

async function censusGeocode(text: string): Promise<GeocodeResult[]> {
  if (!/\d/.test(text)) return []; // it only matches street addresses
  const url =
    'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?' +
    new URLSearchParams({ address: text, benchmark: 'Public_AR_Current', format: 'json' });
  const res = await fetch(url);
  if (!res.ok) return [];
  const body = (await res.json()) as {
    result?: { addressMatches?: { matchedAddress: string; coordinates: { x: number; y: number } }[] };
  };
  return (body.result?.addressMatches ?? []).map((m) => {
    const [street, ...rest] = m.matchedAddress.split(',');
    return {
      label: prettyName(street.trim()),
      detail: prettyName(rest.join(',').trim()),
      lat: m.coordinates.y,
      lon: m.coordinates.x,
      source: 'census' as const,
    };
  });
}

function describe(m: MotisMatch): GeocodeResult {
  const areas = (m.areas ?? [])
    .map((a) => a.name)
    .filter((n) => n && n !== 'United States')
    .reverse()
    .slice(0, 2)
    .join(', ');
  const label =
    m.type === 'ADDRESS' && m.houseNumber && m.street ? `${m.houseNumber} ${m.street}` : m.name || m.street || 'Place';
  const kind = m.type === 'STOP' ? 'Transit stop' : m.type === 'PLACE' ? 'Place' : 'Address';
  return {
    label: prettyName(label),
    detail: [kind, areas].filter(Boolean).join(' · '),
    lat: m.lat,
    lon: m.lon,
    source: 'router',
    tz: m.tz,
  };
}

// Transitous covers the world, but this extension is US-only (Census geocoder,
// US holidays), so "Union Station" shouldn't offer one in Toronto. A server
// that doesn't say which country a match is in gets the benefit of the doubt.
const inUS = (m: MotisMatch) => !m.country || m.country === 'US';

async function routerGeocode(text: string, routerUrl: string, near?: Near): Promise<GeocodeResult[]> {
  // Ask for extra, since some get filtered out below.
  const params = new URLSearchParams({ text, numResults: '12' });
  // Lean toward where the person is already looking, but don't exclude the
  // rest of the country: people search for homes in a city they're moving to.
  if (near) {
    params.set('place', `${near.lat},${near.lon}`);
    params.set('placeBias', '3');
  }
  const matches = await motisGet<MotisMatch[]>(routerUrl, '/api/v1/geocode', params, { heavy: false, timeoutMs: 15_000 });
  return (matches ?? []).filter(inUS).map(describe);
}

export async function geocode(text: string, routerUrl: string, near?: Near): Promise<GeocodeResult[]> {
  const q = text.trim();
  if (q.length < 3) return [];
  const [census, router] = await Promise.allSettled([censusGeocode(q), routerGeocode(q, routerUrl, near)]);
  const all = [...(census.status === 'fulfilled' ? census.value : []), ...(router.status === 'fulfilled' ? router.value : [])];

  // The two often agree on a location; keep the first (Census) one, but take
  // the router's time zone for it.
  const out: GeocodeResult[] = [];
  for (const r of all) {
    const same = out.find((o) => haversineMeters(o.lat, o.lon, r.lat, r.lon) < 40);
    if (same) same.tz ??= r.tz;
    else out.push(r);
  }
  if (!out.length && census.status === 'rejected' && router.status === 'rejected') {
    throw new Error('Address search is unavailable right now. Check your connection and try again.');
  }
  return out.slice(0, 8);
}

/**
 * Suggestions while someone types. Only the router's geocoder: it's built for
 * half-typed text and answers fast, while the Census one needs a whole address.
 */
export async function suggest(text: string, routerUrl: string, near?: Near): Promise<GeocodeResult[]> {
  const q = text.trim();
  if (q.length < 3) return [];
  return (await routerGeocode(q, routerUrl, near)).slice(0, 6);
}

/** The time zone at a point, from the router's reverse geocoder. Null if it can't tell. */
export async function timeZoneAt(lat: number, lon: number, routerUrl: string): Promise<string | null> {
  const params = new URLSearchParams({ place: `${lat},${lon}`, numResults: '3' });
  const matches = await motisGet<MotisMatch[]>(routerUrl, '/api/v1/reverse-geocode', params, { heavy: false, timeoutMs: 15_000 });
  return matches?.find((m) => m.tz)?.tz ?? null;
}
