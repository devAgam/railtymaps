import type { Listing } from '../types';
import { isCoord, type SiteAdapter } from './types';

// Zillow puts a URL-encoded JSON blob on every search card
// (data-hdp-srp-context) with the zpid, coordinates, price and beds/baths. It's
// been more stable than the class names around it, so it's the primary source.
// Cards that lack it fall back to the server-rendered results in __NEXT_DATA__.

const CARDS = ['article[data-testid="property-card"]', 'article[data-test="property-card"]', 'article[id^="zpid_"]'].join(', ');

export interface ZillowHomeInfo {
  zpid?: number | string;
  streetAddress?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  latitude?: number;
  longitude?: number;
  price?: number;
  bedrooms?: number;
  bathrooms?: number;
}

export function parseSrpContext(attr: string | null | undefined): ZillowHomeInfo | null {
  if (!attr) return null;
  try {
    const obj = JSON.parse(decodeURIComponent(attr)) as { homeInfo?: ZillowHomeInfo };
    return obj?.homeInfo ?? null;
  } catch {
    return null;
  }
}

// __NEXT_DATA__ only changes on full page loads, so index it once per text.
let nextDataText: string | null = null;
let nextDataIndex = new Map<string, [number, number]>();

function nextDataLatLng(zpid: string, doc: Document): [number, number] | null {
  const text = doc.getElementById('__NEXT_DATA__')?.textContent ?? '';
  if (!text) return null;
  if (text !== nextDataText) {
    nextDataText = text;
    nextDataIndex = new Map();
    try {
      const results = JSON.parse(text)?.props?.pageProps?.searchPageState?.cat1?.searchResults ?? {};
      for (const r of [...(results.listResults ?? []), ...(results.mapResults ?? [])]) {
        const lat = r?.latLong?.latitude ?? r?.hdpData?.homeInfo?.latitude;
        const lon = r?.latLong?.longitude ?? r?.hdpData?.homeInfo?.longitude;
        if (r?.zpid && isCoord(lat) && isCoord(lon)) nextDataIndex.set(String(r.zpid), [lat, lon]);
      }
    } catch {
      // Not JSON we understand. Cards without their own coordinates get skipped.
    }
  }
  return nextDataIndex.get(zpid) ?? null;
}

function parseCard(card: Element, doc: Document): Listing | null {
  const info = parseSrpContext(card.getAttribute('data-hdp-srp-context'));
  const zpid = String(info?.zpid ?? card.id.match(/^zpid_(\d+)$/)?.[1] ?? '');
  if (!zpid) return null;

  let lat = info?.latitude;
  let lon = info?.longitude;
  if (!isCoord(lat) || !isCoord(lon)) {
    const ll = nextDataLatLng(zpid, doc);
    if (!ll) return null;
    [lat, lon] = ll;
  }
  const address =
    card.getAttribute('aria-label')?.trim() ||
    card.querySelector('address')?.textContent?.trim() ||
    [info?.streetAddress, info?.city, info?.state].filter(Boolean).join(', ');
  return {
    site: 'zillow',
    id: zpid,
    lat,
    lon,
    address,
    url: card.querySelector<HTMLAnchorElement>('a[href*="/homedetails/"]')?.href,
    price: info?.price,
    beds: info?.bedrooms,
    baths: info?.bathrooms,
  };
}

const LAT_RE = /\\?"latitude\\?"\s*:\s*(-?\d{1,2}\.\d+)/;
const LON_RE = /\\?"longitude\\?"\s*:\s*(-?\d{1,3}\.\d+)/;

/**
 * Coordinates on a home details page, from the JSON Zillow inlines. We look
 * just after the first mention of this zpid; the page also carries nearby
 * homes and comps, and grabbing the first latitude anywhere picks a neighbor.
 */
export function detailPageLatLng(zpid: string, doc: Document): [number, number] | null {
  const zpidRe = new RegExp(`\\\\?"zpid\\\\?"\\s*:\\s*\\\\?"?${zpid}\\b`);
  for (const s of doc.querySelectorAll('script:not([src])')) {
    const text = s.textContent ?? '';
    if (text.length < 100 || !text.includes(zpid)) continue;
    const at = text.search(zpidRe);
    if (at < 0) continue;
    const after = text.slice(at, at + 3000);
    const lat = after.match(LAT_RE);
    const lon = after.match(LON_RE);
    if (lat && lon) return [Number(lat[1]), Number(lon[1])];
  }
  return null;
}

export const zillow: SiteAdapter = {
  site: 'zillow',
  cards: CARDS,
  parseCard,
  badgeSlot(card) {
    // Right under the address. Falls back to the end of the card's text block.
    const area = card.querySelector('address')?.closest('[data-c11n-component="PropertyCard.DataArea"]');
    if (area) return { after: area };
    return { appendTo: card.querySelector('[data-c11n-component="PropertyCard.DataWrapper"]') ?? card };
  },
  detailId: (url) => url.pathname.match(/\/(\d+)_zpid/)?.[1] ?? null,
  detailLatLng: detailPageLatLng,
  detailAddress(doc) {
    const h1 = doc.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim();
    if (h1 && /\d/.test(h1) && h1.includes(',')) return h1;
    return doc.title.split('|')[0].trim();
  },
  isSearchPage(url) {
    if (url.searchParams.has('searchQueryState')) return true;
    // /homes/..., /silver-spring-md/, /washington-dc-20002/, /for_rent/...
    return /^\/(homes|for_sale|for_rent|[a-z0-9-]+-[a-z]{2}(-\d{5})?)(\/|$)/.test(url.pathname);
  },
};
