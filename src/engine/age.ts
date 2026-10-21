// Age on a date (spec 3.2).
import type { Athlete, ISODate } from '../types';
import type { Config } from './config';
import { academicYearOf, daysBetween, parts } from './dates';

export interface AgeOnDate {
  /** Decimal age in years. */
  age: number;
  /** True when estimated from year group (or the staff default) rather than a date of birth. */
  estimated: boolean;
}

/**
 * - With dob: (date − dob) / 365.25 days.
 * - Without dob: age on 1 September of the academic year from the year group (Y7 = 11 … Y13 = 17),
 *   + 0.5 (mid-year birthday) + the fraction of a year elapsed since that 1 September. The year group
 *   refers to athlete.yearGroupYear (default: the academic year containing `asOf`), so results from
 *   earlier years use the age the athlete had then.
 * - Staff without dob: config.age.staffDefaultAge (30).
 */
export function ageOnDate(
  athlete: Pick<Athlete, 'dob' | 'yearGroup' | 'yearGroupYear'>,
  date: ISODate,
  config: Config,
  asOf: ISODate = date,
): AgeOnDate {
  if (athlete.dob) return { age: daysBetween(athlete.dob, date) / 365.25, estimated: false };
  if (athlete.yearGroup === 'Staff') return { age: config.age.staffDefaultAge, estimated: true };
  const { academicYearStartMonth: sm, academicYearStartDay: sd } = config.age;
  const refYear = athlete.yearGroupYear ?? academicYearOf(asOf, sm, sd);
  const sept1 = `${refYear}-${String(sm).padStart(2, '0')}-${String(sd).padStart(2, '0')}`;
  const base = config.age.yearGroupAgeOnSept1[athlete.yearGroup];
  return { age: base + config.age.midYearOffset + daysBetween(sept1, date) / 365.25, estimated: true };
}

/** Whole years, for table lookups that use floor(age). */
export function floorAge(a: AgeOnDate): number {
  return Math.floor(a.age + 1e-9);
}

/** Year of birth is never shown; this helper exists only for the coach-only athlete editor. */
export function isPlausibleDob(dob: ISODate, today: ISODate): boolean {
  const { y } = parts(dob);
  const age = daysBetween(dob, today) / 365.25;
  return y > 1900 && age >= 5 && age <= 100;
}
