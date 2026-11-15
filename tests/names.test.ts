import { describe, expect, it } from 'vitest';
import { chipLabel, lineName, shortAgency } from '../components/ui';
import type { SimpleLeg } from '../lib/types';
import { personRef, possessive, prettyName } from '../lib/util';

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

describe('line names outside DC', () => {
  it('keeps NYC subway letters and names the line in sentences', () => {
    const a = leg({ mode: 'SUBWAY', agency: 'MTA New York City Transit', route: 'A', routeLong: '8 Avenue Express' });
    expect(chipLabel(a)).toBe('A');
    expect(lineName(a)).toBe('A train (8 Avenue Express)');
  });

  it('uses names that already say "Line"', () => {
    const red = leg({ mode: 'SUBWAY', agency: 'Massachusetts Bay Transportation Authority', route: '', routeLong: 'Red Line' });
    expect(chipLabel(red)).toBe('Red Line');
    expect(lineName(red)).toBe('Red Line');
    expect(lineName(leg({ mode: 'REGIONAL_RAIL', routeLong: 'Babylon Branch' }))).toBe('Babylon Branch');
  });

  it('shortens agency names riders know by initials', () => {
    expect(shortAgency('Southeastern Pennsylvania Transportation Authority')).toBe('SEPTA');
    expect(shortAgency('Chicago Transit Authority')).toBe('CTA');
    expect(shortAgency('Tri-County Metropolitan Transportation District of Oregon')).toBe('TriMet');
    expect(shortAgency('Maryland Transit Administration')).toBe('MTA Maryland');
    expect(shortAgency('Capital Area Transit (CAT)')).toBe('CAT');
    expect(shortAgency('Some County Transit')).toBe('Some County Transit');
  });

  it('prefixes bus routes only where it helps', () => {
    expect(chipLabel(leg({ agency: 'Chicago Transit Authority', route: '66' }))).toBe('66');
    expect(chipLabel(leg({ agency: 'Alameda-Contra Costa Transit District', route: '51A' }))).toBe('AC Transit 51A');
    // Too long to fit a chip: the route alone, the full name stays in the step-by-step text.
    expect(chipLabel(leg({ agency: 'Some Very Long County Transit Authority', route: '7' }))).toBe('7');
  });
});

describe('cars', () => {
  it('labels a driving leg plainly', () => {
    const drive = leg({ mode: 'CAR' });
    expect(chipLabel(drive)).toBe('Drive');
    expect(lineName(drive)).toBe('Drive');
  });
});

describe('talking about people', () => {
  it('says "your" and "you" for the person called Me', () => {
    expect([possessive('Mom'), possessive('Me'), possessive(' me ')]).toEqual(["Mom's", 'your', 'your']);
    expect([personRef('Dad'), personRef('Me')]).toEqual(['Dad', 'you']);
  });
});
