import type { Listing } from '../types';
import { isCoord, leadingNumber, type SiteAdapter } from './types';

// Redfin puts schema.org JSON-LD inside every search card: a residence with
// geo coordinates and the listing URL, plus a Product with the asking price.
// Home pages also carry <meta name="geo.position" content="lat;lon">.

interface LdNode {
  '@type'?: string | string[];
  name?: string;
  url?: string;
  geo?: { latitude?: number | string; longitude?: number | string };
  address?: { streetAddress?: string; addressLocality?: string; addressRegion?: string; postalCode?: string };
  offers?: { price?: number | string } | { price?: number | string }[];
  mainEntity?: LdNode;
}

function ldNodes(root: ParentNode): LdNode[] {
  const out: LdNode[] = [];
  for (const s of root.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const parsed = JSON.parse(s.textContent ?? '');
      for (const node of Array.isArray(parsed) ? parsed : [parsed]) {
        if (node && typeof node === 'object') out.push(node, ...(node.mainEntity ? [node.mainEntity] : []));
      }
    } catch {
      // Malformed block; skip it.
    }
  }
  return out;
}

const homeIdFromUrl = (url: string | undefined) => url?.match(/\/home\/(\d+)/)?.[1] ?? null;

function addressOf(node: LdNode): string {
  if (node.name) return node.name;
  const a = node.address;
  return a ? [a.streetAddress, a.addressLocality, [a.addressRegion, a.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '';
}

function priceOf(nodes: LdNode[]): number | undefined {
  for (const n of nodes) {
    const offer = Array.isArray(n.offers) ? n.offers[0] : n.offers;
    const price = Number(offer?.price);
    if (price > 0) return price;
  }
  return undefined;
}

function parseCard(card: Element): Listing | null {
  const nodes = ldNodes(card);
  const home = nodes.find((n) => n.geo && homeIdFromUrl(n.url));
  if (!home) return null;
  const lat = Number(home.geo!.latitude);
  const lon = Number(home.geo!.longitude);
  if (!isCoord(lat) || !isCoord(lon)) return null;
  const url = home.url!;
  return {
    site: 'redfin',
    id: homeIdFromUrl(url)!,
    lat,
    lon,
    address: addressOf(home) || card.querySelector('.bp-Homecard__Address')?.textContent?.trim() || '',
    url: new URL(url, 'https://www.redfin.com').href,
    price: priceOf(nodes),
    beds: leadingNumber(card.querySelector('.bp-Homecard__Stats--beds')?.textContent),
    baths: leadingNumber(card.querySelector('.bp-Homecard__Stats--baths')?.textContent),
  };
}

export const redfin: SiteAdapter = {
  site: 'redfin',
  cards: '.bp-Homecard',
  parseCard,
  badgeSlot(card) {
    // Redfin cards are a fixed 423px with overflow hidden, so a row under the
    // address would hide the card's last line. Float over the photo instead.
    const photo = card.querySelector('.bp-Homecard__PhotoWrapper');
    if (photo) return { overlay: photo };
    return { appendTo: card.querySelector('.bp-Homecard__Content') ?? card };
  },
  detailId: (url) => homeIdFromUrl(url.pathname),
  detailLatLng(id, doc) {
    const meta = doc.querySelector('meta[name="geo.position"]')?.getAttribute('content');
    const [lat, lon] = (meta ?? '').split(/[;,]/).map(Number);
    if (isCoord(lat) && isCoord(lon)) return [lat, lon];
    // The page also lists nearby homes, so match the node to this home's id.
    const node = ldNodes(doc).find((n) => n.geo && homeIdFromUrl(n.url) === id);
    const nLat = Number(node?.geo?.latitude);
    const nLon = Number(node?.geo?.longitude);
    return isCoord(nLat) && isCoord(nLon) ? [nLat, nLon] : null;
  },
  detailAddress(doc) {
    return doc.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim() || doc.title.split('|')[0].trim();
  },
  isSearchPage: (url) => /^\/(city|zipcode|county|neighborhood|state|school)\//.test(url.pathname),
};
