import { describe, expect, it } from 'vitest';
import { formatClock, formatHhmm, formatMinutes, nextServiceTime, tzOffsetMinutes, zonedToUtc } from '../lib/time';

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

describe('other time zones', () => {
  // Saturday Nov 14 2026, so the next weekday slot is Tuesday Nov 17.
  const saturday = new Date('2026-11-14T21:00:00Z');

  it('plans each place in its own zone', () => {
    expect(nextServiceTime('weekday', '09:00', saturday, 'America/Chicago').toISOString()).toBe('2026-11-17T15:00:00.000Z');
    expect(nextServiceTime('weekday', '09:00', saturday, 'America/Los_Angeles').toISOString()).toBe('2026-11-17T17:00:00.000Z');
    expect(nextServiceTime('weekday', '09:00', saturday, 'Pacific/Honolulu').toISOString()).toBe('2026-11-17T19:00:00.000Z');
  });

  it('handles Arizona, which skips daylight time', () => {
    // July: Phoenix stays at UTC-7 while Denver moves to UTC-6.
    const july = new Date('2027-07-10T18:00:00Z');
    expect(nextServiceTime('weekday', '09:00', july, 'America/Phoenix').toISOString()).toBe('2027-07-13T16:00:00.000Z');
    expect(nextServiceTime('weekday', '09:00', july, 'America/Denver').toISOString()).toBe('2027-07-13T15:00:00.000Z');
  });

  it('uses the local calendar date, not UTC, to pick tomorrow', () => {
    // 10 PM Monday in Los Angeles is already Tuesday in UTC; the next slot is still Tuesday (tomorrow) there.
    const lateMonday = new Date('2026-11-17T06:00:00Z');
    expect(nextServiceTime('weekday', '09:00', lateMonday, 'America/Los_Angeles').toISOString()).toBe('2026-11-17T17:00:00.000Z');
  });

  it("formats times in the place's zone", () => {
    expect(formatClock('2026-11-17T17:00:00.000Z', 'America/Los_Angeles')).toBe('9:00 AM');
    expect(formatClock('2026-11-17T17:00:00.000Z', 'America/New_York')).toBe('12:00 PM');
  });
});
