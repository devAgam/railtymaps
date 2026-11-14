import { describe, expect, it } from 'vitest';
import { formatHhmm, formatMinutes, nextServiceTime, tzOffsetMinutes, zonedToUtc } from '../lib/time';

const NY = 'America/New_York';

describe('time zones', () => {
  it('knows Eastern standard and daylight offsets', () => {
    expect(tzOffsetMinutes(new Date('2026-11-17T14:00:00Z'), NY)).toBe(-300);
    expect(tzOffsetMinutes(new Date('2026-07-14T14:00:00Z'), NY)).toBe(-240);
  });

  it('converts local wall-clock time to UTC on both sides of DST', () => {
    expect(zonedToUtc(2026, 11, 17, 9, 0, NY).toISOString()).toBe('2026-11-17T14:00:00.000Z');
    expect(zonedToUtc(2027, 3, 16, 9, 0, NY).toISOString()).toBe('2027-03-16T13:00:00.000Z');
  });
});

describe('nextServiceTime', () => {
  it('picks the next Tuesday or Wednesday for weekdays', () => {
    // Saturday, Nov 14 2026
    expect(nextServiceTime('weekday', '09:00', new Date('2026-11-14T21:00:00Z')).toISOString()).toBe(
      '2026-11-17T14:00:00.000Z',
    );
  });

  it('skips Veterans Day', () => {
    // Tuesday Nov 10 2026; Wednesday Nov 11 is a federal holiday.
    expect(nextServiceTime('weekday', '09:00', new Date('2026-11-10T15:00:00Z')).toISOString()).toBe(
      '2026-11-17T14:00:00.000Z',
    );
  });

  it('skips the holiday season', () => {
    // Sunday Dec 20 2026 → first ordinary Tuesday is Jan 5 2027.
    expect(nextServiceTime('weekday', '09:00', new Date('2026-12-20T17:00:00Z')).toISOString()).toBe(
      '2027-01-05T14:00:00.000Z',
    );
  });

  it('handles the switch to daylight time', () => {
    // Friday Mar 12 2027; DST starts Sunday Mar 14.
    expect(nextServiceTime('weekday', '09:00', new Date('2027-03-12T12:00:00Z')).toISOString()).toBe(
      '2027-03-16T13:00:00.000Z',
    );
  });

  it('never returns today, even for a later time today', () => {
    // Saturday 8:00 AM Eastern asking for Saturday 10:00 → next week.
    expect(nextServiceTime('saturday', '10:00', new Date('2026-11-14T13:00:00Z')).toISOString()).toBe(
      '2026-11-21T15:00:00.000Z',
    );
  });

  it('finds Sundays', () => {
    expect(nextServiceTime('sunday', '10:30', new Date('2026-11-14T13:00:00Z')).toISOString()).toBe(
      '2026-11-15T15:30:00.000Z',
    );
  });
});

describe('formatting', () => {
  it('formats clock times and durations', () => {
    expect(formatHhmm('09:00')).toBe('9:00 AM');
    expect(formatHhmm('13:30')).toBe('1:30 PM');
    expect(formatHhmm('00:15')).toBe('12:15 AM');
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(65)).toBe('1 hr 5 min');
    expect(formatMinutes(120)).toBe('2 hr');
  });
});
