import type { Listing, Site } from '../types';

/** What the content script needs to know about one listing site. */
export interface SiteAdapter {
  site: Site;
  /** Selector for one search-result card. */
  cards: string;
  parseCard(card: Element, doc: Document): Listing | null;
  /**
   * Where the badge row goes inside a card. `overlay` floats it over the bottom
   * of the given element (the photo) for sites whose cards have a fixed height,
   * where an extra row would push the site's own text out of view.
   */
  badgeSlot(card: Element): BadgeSlot;
  /** The listing id when the URL is a single home's page, else null. */
  detailId(url: URL): string | null;
  detailLatLng(id: string, doc: Document): [number, number] | null;
  detailAddress(doc: Document): string;
  /** True for search-results URLs, where finding zero cards means something broke. */
  isSearchPage(url: URL): boolean;
}

export type BadgeSlot = { after: Element } | { appendTo: Element } | { overlay: Element };

export function isCoord(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n !== 0;
}

/** Pulls the first number out of "3 bds", "2.5 baths", "4 beds". */
export function leadingNumber(text: string | null | undefined): number | undefined {
  const m = text?.match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : undefined;
}
