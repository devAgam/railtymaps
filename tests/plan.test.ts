import { describe, expect, it } from 'vitest';
import type { MotisItinerary } from '../lib/motis';
import { groupItineraries } from '../lib/plan';
import fixture from './fixtures/plan-silver-spring-to-union-station.json';

// Real answer for Silver Spring Metro → Union Station, arriving by 9:00 AM Tue Nov 17 2026.
const deadline = new Date('2026-11-17T14:00:00Z');
const raw = fixture.itineraries as unknown as MotisItinerary[];

describe('groupItineraries', () => {
  it('collapses repeat departures of the same trip into one option', () => {
    const options = groupItineraries(raw, deadline);
    expect(options).toHaveLength(1);
    const [best] = options;
    expect(best.signature).toBe('SUBWAY:R');
    expect(best.departIso).toBe('2026-11-17T13:41:00Z');
    expect(best.leadMinutes).toBe(19);
    expect(best.transfers).toBe(0);
    expect(best.walkMinutes).toBe(5);
    expect(best.longestWalkMinutes).toBe(4);
    expect(best.alsoDepartsIso).toEqual([
      '2026-11-17T13:24:00Z',
      '2026-11-17T13:28:00Z',
      '2026-11-17T13:32:00Z',
      '2026-11-17T13:36:00Z',
    ]);
    const ride = best.legs[1];
    expect(ride).toMatchObject({ mode: 'SUBWAY', route: 'R', color: '#c80f2d', from: 'Silver Spring', to: 'Union Station' });
    expect(best.legs[0].from).toBe('Home');
    expect(best.legs[2].to).toBe('Destination');
  });

  it('ranks options by how early you must leave, then transfers', () => {
    const slowDirect = { ...raw[0], startTime: '2026-11-17T13:20:00Z' };
    const bus: MotisItinerary = {
      ...raw[0],
      startTime: '2026-11-17T13:30:00Z',
      transfers: 1,
      legs: [
        { ...raw[0].legs[0] },
        { ...raw[0].legs[1], mode: 'BUS', routeShortName: '70' },
        { ...raw[0].legs[1], routeShortName: 'G' },
        { ...raw[0].legs[2] },
      ],
    };
    const options = groupItineraries([slowDirect, bus], deadline);
    expect(options.map((o) => o.signature)).toEqual(['BUS:70>SUBWAY:G', 'SUBWAY:R']);
    expect(options[0].transfers).toBe(1);
  });

  it('with a walking limit, counts walking past it double', () => {
    // Leaves five minutes later than the bus, but starts with a 20 minute walk.
    const longWalk: MotisItinerary = {
      ...raw[0],
      startTime: '2026-11-17T13:30:00Z',
      legs: [{ ...raw[0].legs[0], duration: 20 * 60 }, ...raw[0].legs.slice(1)],
    };
    const bus: MotisItinerary = {
      ...raw[0],
      startTime: '2026-11-17T13:25:00Z',
      legs: [{ ...raw[0].legs[0] }, { ...raw[0].legs[1], mode: 'BUS', routeShortName: '70' }, { ...raw[0].legs[2] }],
    };
    expect(groupItineraries([longWalk, bus], deadline).map((o) => o.signature)).toEqual(['SUBWAY:R', 'BUS:70']);
    // With a 10 minute limit the long walk costs 30 + 10 extra, the bus 35.
    expect(groupItineraries([longWalk, bus], deadline, 4, 10).map((o) => o.signature)).toEqual(['BUS:70', 'SUBWAY:R']);
  });

  it('drops anything that arrives after the deadline', () => {
    const late = { ...raw[0], endTime: '2026-11-17T14:10:00Z' };
    expect(groupItineraries([late], deadline)).toEqual([]);
  });
});
