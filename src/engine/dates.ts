// Calendar-date helpers. All dates are ISO 'YYYY-MM-DD' calendar dates in Asia/Tokyo; arithmetic is
// done on day numbers so no time-zone or DST drift can creep in.
import type { ISODate, ISOWeek } from '../types';

const DAY_MS = 86_400_000;

export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export function parts(iso: ISODate): { y: number; m: number; d: number } {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return { y, m, d };
}

/** Days since 1970-01-01 for a calendar date. */
export function dayNumber(iso: ISODate): number {
  const { y, m, d } = parts(iso);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function fromDayNumber(n: number): ISODate {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(iso: ISODate, n: number): ISODate {
  return fromDayNumber(dayNumber(iso) + n);
}

/** b − a in days. */
export function daysBetween(a: ISODate, b: ISODate): number {
  return dayNumber(b) - dayNumber(a);
}

/** Today's calendar date in Asia/Tokyo. */
export function todayTokyo(now: Date = new Date()): ISODate {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' });
  return f.format(now);
}

/**
 * Whole calendar months elapsed from `from` to `to` (0 if `to` is before `from`).
 * 2026-01-15 → 2026-07-14 = 5; → 2026-07-15 = 6.
 */
export function monthsBetween(from: ISODate, to: ISODate): number {
  const a = parts(from);
  const b = parts(to);
  let m = (b.y - a.y) * 12 + (b.m - a.m);
  if (b.d < a.d) m -= 1;
  return Math.max(0, m);
}

/** Subtract whole months, clamping the day to the end of the month. */
export function addMonths(iso: ISODate, months: number): ISODate {
  const { y, m, d } = parts(iso);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return fromDayNumber(Math.round(Date.UTC(ny, nm, Math.min(d, last)) / DAY_MS));
}

/** ISO-8601 week id (Monday–Sunday), e.g. '2026-W45'. */
export function isoWeek(iso: ISODate): ISOWeek {
  const n = dayNumber(iso);
  const dow = (new Date(n * DAY_MS).getUTCDay() + 6) % 7; // 0 = Monday
  const thursday = n - dow + 3;
  const ty = new Date(thursday * DAY_MS).getUTCFullYear();
  const jan4 = Math.round(Date.UTC(ty, 0, 4) / DAY_MS);
  const jan4dow = (new Date(jan4 * DAY_MS).getUTCDay() + 6) % 7;
  const week1Monday = jan4 - jan4dow;
  const week = Math.floor((n - dow - week1Monday) / 7) + 1;
  return `${ty}-W${String(week).padStart(2, '0')}`;
}

/** Monday of an ISO week. */
export function weekMonday(week: ISOWeek): ISODate {
  const m = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!m) throw new Error(`bad ISO week ${week}`);
  const y = Number(m[1]);
  const w = Number(m[2]);
  const jan4 = Math.round(Date.UTC(y, 0, 4) / DAY_MS);
  const jan4dow = (new Date(jan4 * DAY_MS).getUTCDay() + 6) % 7;
  return fromDayNumber(jan4 - jan4dow + (w - 1) * 7);
}

export function weekSunday(week: ISOWeek): ISODate {
  return addDays(weekMonday(week), 6);
}

export function addWeeks(week: ISOWeek, n: number): ISOWeek {
  return isoWeek(addDays(weekMonday(week), n * 7));
}

/** Inclusive list of ISO weeks from a to b. */
export function weeksInRange(a: ISOWeek, b: ISOWeek): ISOWeek[] {
  const out: ISOWeek[] = [];
  let n = dayNumber(weekMonday(a));
  const end = dayNumber(weekMonday(b));
  while (n <= end) {
    out.push(isoWeek(fromDayNumber(n)));
    n += 7;
  }
  return out;
}

/** Start year of the academic year containing `iso` (start month/day from config, default 1 Sept). */
export function academicYearOf(iso: ISODate, startMonth = 9, startDay = 1): number {
  const { y, m, d } = parts(iso);
  return m > startMonth || (m === startMonth && d >= startDay) ? y : y - 1;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '10 Nov' */
export function formatShortDate(iso: ISODate): string {
  const { m, d } = parts(iso);
  return `${d} ${MONTHS[m - 1]}`;
}

/** '10 Nov 2026' */
export function formatLongDate(iso: ISODate): string {
  const { y, m, d } = parts(iso);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
