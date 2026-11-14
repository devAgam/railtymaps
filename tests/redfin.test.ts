import { describe, expect, it } from 'vitest';
import { redfin } from '../lib/sites/redfin';

// Shape copied from a real Redfin search card (Nov 2026), address changed.
const cardLd = [
  {
    '@context': 'http://schema.org',
    name: '100 Example St, Silver Spring, MD 20910',
    url: 'https://www.redfin.com/MD/Silver-Spring/100-Example-St-20910/home/10966868',
    address: { '@type': 'PostalAddress', streetAddress: '100 Example St', addressLocality: 'Silver Spring', addressRegion: 'MD', postalCode: '20910' },
    geo: { '@type': 'GeoCoordinates', latitude: 39.0008709, longitude: -77.0219265 },
    numberOfRooms: 4,
    '@type': 'SingleFamilyResidence',
  },
  { '@context': 'http://schema.org', '@type': 'Product', name: '100 Example St', offers: { '@type': 'Offer', price: '829000', priceCurrency: 'USD' } },
];

function fakeCard(ld: unknown, text: Record<string, string> = {}) {
  return {
    querySelectorAll: (sel: string) => (sel.includes('ld+json') ? [{ textContent: JSON.stringify(ld) }] : []),
    querySelector: (sel: string) => {
      const key = Object.keys(text).find((k) => sel.includes(k));
      return key ? { textContent: text[key] } : null;
    },
  } as unknown as Element;
}

describe('Redfin search cards', () => {
  it('reads the JSON-LD inside each card', () => {
    const card = fakeCard(cardLd, { 'Stats--beds': '4 beds', 'Stats--baths': '2.5 baths' });
    expect(redfin.parseCard(card, {} as Document)).toEqual({
      site: 'redfin',
      id: '10966868',
      lat: 39.0008709,
      lon: -77.0219265,
      address: '100 Example St, Silver Spring, MD 20910',
      url: 'https://www.redfin.com/MD/Silver-Spring/100-Example-St-20910/home/10966868',
      price: 829000,
      beds: 4,
      baths: 2.5,
    });
  });

  it('skips cards without coordinates', () => {
    expect(redfin.parseCard(fakeCard([{ ...cardLd[0], geo: undefined }]), {} as Document)).toBeNull();
    expect(redfin.parseCard(fakeCard('not an object'), {} as Document)).toBeNull();
  });
});

describe('Redfin pages', () => {
  it('tells home pages and search pages apart', () => {
    const u = (s: string) => new URL(s, 'https://www.redfin.com');
    expect(redfin.detailId(u('/MD/Silver-Spring/8603-Mayfair-Pl-20910/home/10966868'))).toBe('10966868');
    expect(redfin.detailId(u('/zipcode/20910'))).toBeNull();
    expect(redfin.isSearchPage(u('/zipcode/20910'))).toBe(true);
    expect(redfin.isSearchPage(u('/city/12839/DC/Washington-DC'))).toBe(true);
    expect(redfin.isSearchPage(u('/MD/Silver-Spring/x/home/1'))).toBe(false);
  });

  it('reads coordinates from the geo.position meta tag', () => {
    const doc = {
      querySelector: (sel: string) => (sel.includes('geo.position') ? { getAttribute: () => '39.0008709;-77.0219265' } : null),
      querySelectorAll: () => [],
    } as unknown as Document;
    expect(redfin.detailLatLng('10966868', doc)).toEqual([39.0008709, -77.0219265]);
  });

  it('falls back to the JSON-LD node for this home, ignoring nearby homes', () => {
    const nearby = { ...cardLd[0], url: 'https://www.redfin.com/MD/x/home/1', geo: { latitude: 38.5, longitude: -76.5 } };
    const doc = {
      querySelector: () => null,
      querySelectorAll: () => [{ textContent: JSON.stringify([nearby, cardLd[0]]) }],
    } as unknown as Document;
    expect(redfin.detailLatLng('10966868', doc)).toEqual([39.0008709, -77.0219265]);
  });
});
