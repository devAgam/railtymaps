import { haversineMeters } from './geo';
import { motisGet, type MotisMatch } from './motis';
import type { GeocodeResult } from './types';
import { prettyName } from './util';

// Two geocoders, because neither is good at everything. The Census Bureau's is
// exact for US street addresses but knows nothing about named places. The
// router's own geocoder (built from OpenStreetMap) finds "Union Station" or
// "NIH Clinical Center" but is spottier on house numbers.

// v1 covers the DC region; results farther than this from downtown are dropped
// so "Union Station" doesn't offer the one in Tacoma.
const REGION_CENTER = { lat: 38.9, lon: -77.03 };
const REGION_RADIUS_M = 160_000;

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
  return { label: prettyName(label), detail: [kind, areas].filter(Boolean).join(' · '), lat: m.lat, lon: m.lon, source: 'router' };
}

async function routerGeocode(text: string, routerUrl: string): Promise<GeocodeResult[]> {
  const params = new URLSearchParams({
    text,
    place: `${REGION_CENTER.lat},${REGION_CENTER.lon}`,
    placeBias: '3',
    numResults: '8',
  });
  const matches = await motisGet<MotisMatch[]>(routerUrl, '/api/v1/geocode', params, { heavy: false, timeoutMs: 15_000 });
  return (matches ?? []).map(describe);
}

export async function geocode(text: string, routerUrl: string): Promise<GeocodeResult[]> {
  const q = text.trim();
  if (q.length < 3) return [];
  const [census, router] = await Promise.allSettled([censusGeocode(q), routerGeocode(q, routerUrl)]);
  const all = [
    ...(census.status === 'fulfilled' ? census.value : []),
    ...(router.status === 'fulfilled' ? router.value : []),
  ].filter((r) => haversineMeters(r.lat, r.lon, REGION_CENTER.lat, REGION_CENTER.lon) <= REGION_RADIUS_M);

  // The two often agree on a location; keep the first (Census) version.
  const out: GeocodeResult[] = [];
  for (const r of all) {
    if (!out.some((o) => haversineMeters(o.lat, o.lon, r.lat, r.lon) < 40)) out.push(r);
  }
  if (!out.length && census.status === 'rejected' && router.status === 'rejected') {
    throw new Error('Address search is unavailable right now. Check your connection and try again.');
  }
  return out.slice(0, 8);
}
