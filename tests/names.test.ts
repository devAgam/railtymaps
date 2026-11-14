import { describe, expect, it } from 'vitest';
import { chipLabel, lineName, shortAgency } from '../components/ui';
import type { SimpleLeg } from '../lib/types';
import { prettyName } from '../lib/util';

const leg = (patch: Partial<SimpleLeg>): SimpleLeg => ({ mode: 'BUS', from: 'a', to: 'b', startIso: '', endIso: '', minutes: 1, ...patch });

describe('prettyName', () => {
  it('fixes all-caps stop names and leaves the rest alone', () => {
    expect(prettyName('COLESVILLE RD & NOYES DR')).toBe('Colesville Rd & Noyes Dr');
    expect(prettyName('SILVER SPRING STATION & BAY 227')).toBe('Silver Spring Station & Bay 227');
    expect(prettyName("ST. MARY'S CHURCH")).toBe("St. Mary's Church");
    expect(prettyName('16TH ST NW & U ST NW')).toBe('16th St NW & U St NW');
    expect(prettyName('Union Station')).toBe('Union Station');
    expect(prettyName('BWI')).toBe('BWI');
  });
});

describe('line names', () => {
  it('uses the names riders know', () => {
    expect(shortAgency('Montgomery County MD Ride On')).toBe('Ride On');
    expect(lineName(leg({ agency: 'Montgomery County MD Ride On', route: '14' }))).toBe('Ride On 14');
    expect(lineName(leg({ agency: 'WMATA', route: '70' }))).toBe('Metrobus 70');
    const red = leg({ mode: 'SUBWAY', agency: 'WMATA', route: 'R', routeLong: 'Red' });
    expect(lineName(red)).toBe('Red Line');
    expect(chipLabel(red)).toBe('Red');
    expect(chipLabel(leg({ agency: 'Montgomery County MD Ride On', route: '14' }))).toBe('Ride On 14');
    expect(chipLabel(leg({ agency: 'WMATA', route: 'M70' }))).toBe('M70');
  });
});
