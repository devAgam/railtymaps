import type { DayType } from './types';

// Fallback for places saved before each place carried its own time zone (they
// were all in the DC area then).
export const DEFAULT_TZ = 'America/New_York';

/** The time zone this browser is set to. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TZ;
  } catch {
    return DEFAULT_TZ;
  }
}

/** Offset of `tz` from UTC at instant `at`, in minutes (EST is -300, EDT is -240). */
export function tzOffsetMinutes(at: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });
  const p = Object.fromEntries(dtf.formatToParts(at).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** The UTC instant for a wall-clock time in `tz`. Handles DST changes. */
export function zonedToUtc(y: number, m: number, d: number, hh: number, mm: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const off = tzOffsetMinutes(new Date(guess), tz);
  let utc = guess - off * 60000;
  const off2 = tzOffsetMinutes(new Date(utc), tz);
  if (off2 !== off) utc = guess - off2 * 60000;
  return new Date(utc);
}

/** Calendar date in `tz` for an instant. */
export function zonedDate(at: Date, tz: string): { y: number; m: number; d: number } {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric' });
  const p = Object.fromEntries(dtf.formatToParts(at).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day };
}

// Federal holidays that can land on a Tuesday or Wednesday. Floating holidays
// (MLK, Presidents, Memorial, Labor, Columbus, Thanksgiving) never do.
const MIDWEEK_HOLIDAYS = new Set(['06-19', '07-04', '11-11']);

/** Late December and New Year's week run on holiday schedules. */
function inHolidaySeason(m: number, d: number): boolean {
  return (m === 12 && d >= 22) || (m === 1 && d <= 2);
}

/**
 * The concrete date and time to plan a place's trips for. Weekdays use the
 * next ordinary Tuesday or Wednesday: Mondays and Fridays catch most federal
 * holidays, and a few agencies run lighter Friday service. It never returns
 * today, because a deadline earlier today would already be in the past.
 */
export function nextServiceTime(day: DayType, hhmm: string, now: Date = new Date(), tz: string = DEFAULT_TZ): Date {
  const [hh, mm] = hhmm.split(':').map(Number);
  const today = zonedDate(now, tz);
  for (let i = 1; i <= 28; i++) {
    const c = new Date(Date.UTC(today.y, today.m - 1, today.d + i));
    const y = c.getUTCFullYear();
    const m = c.getUTCMonth() + 1;
    const d = c.getUTCDate();
    const wd = c.getUTCDay();
    if (inHolidaySeason(m, d)) continue;
    const mmdd = `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const ok =
      day === 'weekday'
        ? (wd === 2 || wd === 3) && !MIDWEEK_HOLIDAYS.has(mmdd)
        : day === 'saturday'
          ? wd === 6
          : wd === 0;
    if (ok) return zonedToUtc(y, m, d, hh, mm, tz);
  }
  throw new Error(`No service day found for ${day}`);
}

/** "8:12 AM" in the given time zone. */
export function formatClock(iso: string, tz: string = DEFAULT_TZ): string {
  return new Date(iso).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
}

/** "9:00 AM" from "09:00". */
export function formatHhmm(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export const DAY_LABEL: Record<DayType, string> = {
  weekday: 'weekdays',
  saturday: 'Saturdays',
  sunday: 'Sundays',
};

/** "1 hr 5 min", "45 min". */
export function formatMinutes(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} hr ${rest} min` : `${h} hr`;
}
