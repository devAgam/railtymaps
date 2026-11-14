import { describe, expect, it } from 'vitest';
import { parseSrpContext, zillow } from '../lib/sites/zillow';

const homeInfo = {
  zpid: 12345,
  streetAddress: '100 Example St',
  city: 'Silver Spring',
  state: 'MD',
  zipcode: '20910',
  latitude: 38.99,
  longitude: -77.03,
  price: 500000,
  bedrooms: 3,
  bathrooms: 2,
};
const encoded = encodeURIComponent(JSON.stringify({ zpid: '12345', statusType: 'FOR_SALE', homeInfo }));

// Just enough of an Element for the parser.
function fakeCard(attrs: Record<string, string>, opts: { id?: string; address?: string; href?: string } = {}) {
  return {
    id: opts.id ?? '',
    getAttribute: (name: string) => attrs[name] ?? null,
    querySelector: (sel: string) => {
      if (sel === 'address') return opts.address ? { textContent: opts.address } : null;
      if (sel.startsWith('a[')) return opts.href ? { href: opts.href } : null;
      return null;
    },
  } as unknown as Element;
}

function fakeDoc(scripts: string[], nextData?: unknown) {
  return {
    getElementById: (id: string) => (id === '__NEXT_DATA__' && nextData ? { textContent: JSON.stringify(nextData) } : null),
    querySelectorAll: () => scripts.map((textContent) => ({ textContent })),
  } as unknown as Document;
}

describe('Zillow search cards', () => {
  it('reads coordinates and details from data-hdp-srp-context', () => {
    expect(parseSrpContext(encoded)).toMatchObject({ latitude: 38.99, longitude: -77.03 });
    const card = fakeCard(
      { 'data-hdp-srp-context': encoded, 'aria-label': '100 Example St, Silver Spring, MD 20910' },
      { id: 'zpid_12345', href: 'https://www.zillow.com/homedetails/100-Example-St/12345_zpid/' },
    );
    expect(zillow.parseCard(card, fakeDoc([]))).toEqual({
      site: 'zillow',
      id: '12345',
      lat: 38.99,
      lon: -77.03,
      address: '100 Example St, Silver Spring, MD 20910',
      url: 'https://www.zillow.com/homedetails/100-Example-St/12345_zpid/',
      price: 500000,
      beds: 3,
      baths: 2,
    });
  });

  it('falls back to the server-rendered results when a card has no coordinates', () => {
    const nextData = {
      props: { pageProps: { searchPageState: { cat1: { searchResults: { listResults: [{ zpid: '777', latLong: { latitude: 38.95, longitude: -77.07 } }] } } } } },
    };
    const card = fakeCard({}, { id: 'zpid_777', address: '1 Other Rd, Bethesda, MD' });
    expect(zillow.parseCard(card, fakeDoc([], nextData))).toMatchObject({ id: '777', lat: 38.95, lon: -77.07, address: '1 Other Rd, Bethesda, MD' });
  });

  it('skips cards it cannot place', () => {
    expect(zillow.parseCard(fakeCard({}, { id: 'zpid_1' }), fakeDoc([]))).toBeNull();
    expect(parseSrpContext('%E0%A4%A')).toBeNull();
  });
});

describe('Zillow pages', () => {
  it('tells home pages and search pages apart', () => {
    const u = (s: string) => new URL(s, 'https://www.zillow.com');
    expect(zillow.detailId(u('/homedetails/13222-Ewood-Ln-Silver-Spring-MD-20906/166712666_zpid/'))).toBe('166712666');
    expect(zillow.detailId(u('/silver-spring-md/'))).toBeNull();
    expect(zillow.isSearchPage(u('/silver-spring-md/'))).toBe(true);
    expect(zillow.isSearchPage(u('/homes/for_sale/?searchQueryState=%7B%7D'))).toBe(true);
    expect(zillow.isSearchPage(u('/homedetails/x/1_zpid/'))).toBe(false);
  });

  it("finds this home's coordinates on its page, not a neighbor's", () => {
    const neighbor = '{"zpid":999,"latitude":38.1,"longitude":-77.9}';
    const escaped = '"{\\"zpid\\":12345,\\"streetAddress\\":\\"100 Example St\\",\\"latitude\\":38.99,\\"longitude\\":-77.03}"';
    const script = `window.x = ${neighbor} + ${escaped};`.padEnd(200, ' ');
    expect(zillow.detailLatLng('12345', fakeDoc([script]))).toEqual([38.99, -77.03]);
  });
});
