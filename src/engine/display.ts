// Public display of athletes (cards and boards). DOB is never part of anything here.
import type { Athlete, ISODate, YearGroup } from '../types';
import type { Config } from './config';
import type { YearBand } from './types';
import { academicYearOf } from './dates';

/** Name per displayMode: full = 'Aiko Tanaka'; first_initial = 'Aiko T.'; alias = publicAlias (else first_initial). */
export function displayName(a: Pick<Athlete, 'preferredName' | 'givenName' | 'familyName' | 'displayMode' | 'publicAlias'>): string {
  const first = (a.preferredName || a.givenName || '').trim();
  const fam = (a.familyName || '').trim();
  const initial = fam ? `${[...fam][0].toUpperCase()}.` : '';
  const firstInitial = [first, initial].filter(Boolean).join(' ');
  switch (a.displayMode) {
    case 'full':
      return [first, fam].filter(Boolean).join(' ');
    case 'alias':
      return a.publicAlias?.trim() || firstInitial;
    default:
      return firstInitial;
  }
}

/** Coach-view name (always full). */
export function fullName(a: Pick<Athlete, 'preferredName' | 'givenName' | 'familyName'>): string {
  return [(a.preferredName || a.givenName || '').trim(), (a.familyName || '').trim()].filter(Boolean).join(' ');
}

export function yearBand(y: YearGroup): YearBand {
  if (y === 'Staff') return 'Staff';
  const n = Number(y.slice(1));
  if (n <= 8) return 'Y7-8';
  if (n <= 11) return 'Y9-11';
  return 'Y12-13';
}

/**
 * The athlete's year group on a past (or future) date, by shifting their recorded year group by the
 * number of academic years between athlete.yearGroupYear (default: academic year of asOf) and the date.
 * Clamped to Y7..Y13. Staff stay Staff.
 */
export function yearGroupOn(athlete: Pick<Athlete, 'yearGroup' | 'yearGroupYear'>, date: ISODate, config: Config, asOf: ISODate): YearGroup {
  if (athlete.yearGroup === 'Staff') return 'Staff';
  const { academicYearStartMonth: sm, academicYearStartDay: sd } = config.age;
  const ref = athlete.yearGroupYear ?? academicYearOf(asOf, sm, sd);
  const shift = academicYearOf(date, sm, sd) - ref;
  const n = Math.min(13, Math.max(7, Number(athlete.yearGroup.slice(1)) + shift));
  return `Y${n}` as YearGroup;
}

/**
 * The September rollover. An athlete whose year group was recorded for an earlier academic year (a Y9 in the
 * 2025 Long Ducker workbook, or last year's roster) is moved up to the year group they are in on `today`,
 * and the record is restamped with today's academic year. Estimated ages are unchanged: Y9 for 2025 and Y10
 * for 2026 are the same pupil. Returns only the athletes that change.
 * Left alone: Staff; records with no year stamp (they already mean "this year"); records stamped for a later
 * year. Leavers (anyone who would now be past Y13) keep the year group and year they had, so their old
 * results are still aged correctly, and are made inactive.
 */
export function yearRollover(athletes: Athlete[], today: ISODate, config: Config): Athlete[] {
  const { academicYearStartMonth: sm, academicYearStartDay: sd } = config.age;
  const now = academicYearOf(today, sm, sd);
  const out: Athlete[] = [];
  for (const a of athletes) {
    if (a.yearGroup === 'Staff' || a.yearGroupYear == null || !(a.yearGroupYear < now)) continue;
    const n = Number(a.yearGroup.slice(1)) + (now - a.yearGroupYear);
    if (n > 13) {
      // A leaver: off the boards, to-do lists and print runs; results and record kept.
      if (a.active) out.push({ ...a, active: false });
      continue;
    }
    if (n < 7) continue;
    out.push({ ...a, yearGroup: `Y${n}` as YearGroup, yearGroupYear: now });
  }
  return out;
}

/** Year groups recorded a year out (a workbook dated to the wrong year): move them by `delta` years, Y7–Y13. */
export function shiftYearGroups(athletes: Athlete[], delta: number): Athlete[] {
  return athletes.flatMap((a) => {
    if (a.yearGroup === 'Staff') return [];
    const n = Number(a.yearGroup.slice(1)) + delta;
    return n >= 7 && n <= 13 ? [{ ...a, yearGroup: `Y${n}` as YearGroup }] : [];
  });
}

/** True for a pupil whose recorded year group, moved up to `today`, is past Y13: they have left the school. */
export function hasLeft(a: Pick<Athlete, 'yearGroup' | 'yearGroupYear'>, today: ISODate, config: Config): boolean {
  if (a.yearGroup === 'Staff' || a.yearGroupYear == null) return false;
  const { academicYearStartMonth: sm, academicYearStartDay: sd } = config.age;
  return Number(a.yearGroup.slice(1)) + (academicYearOf(today, sm, sd) - a.yearGroupYear) > 13;
}
