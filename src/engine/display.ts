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
