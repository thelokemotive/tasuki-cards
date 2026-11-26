// The paper Gym Log sheet (spec §8): who is on it, in what order, how it splits into pages, and the legend.
// Pure. Nothing on the sheet shows ratings, streaks or freeze history.
import type { Athlete, ISODate, ISOWeek } from '../types';
import { YEAR_GROUPS } from '../types';
import type { Config } from './config';
import { addDays, formatShortDate, isoWeek, weekMonday } from './dates';
import { inWinterProgramme, seasonWeeks, whiteWeekKind } from './white';

/** Athletes on one A4 landscape page (two halves of 20). */
export const GYM_SHEET_PER_PAGE = 40;
export const GYM_SHEET_PER_HALF = 20;

export interface GymSheetRow {
  athleteId: string;
  yearGroup: Athlete['yearGroup'];
  /** "Aiko T. ▲" */
  label: string;
}

/** "Aiko T." plus ▲ for a Summit pass holder. */
export function gymSheetLabel(a: Athlete): string {
  const initial = a.familyName.trim() ? ` ${[...a.familyName.trim()][0].toUpperCase()}.` : '';
  return `${a.preferredName.trim() || a.givenName}${initial}${a.summitPass ? ' ▲' : ''}`;
}

/** Winter-programme athletes, Y7 → Y13 then Staff, by preferred name. */
export function gymSheetRows(athletes: Athlete[]): GymSheetRow[] {
  return athletes
    .filter(inWinterProgramme)
    .sort((a, b) => YEAR_GROUPS.indexOf(a.yearGroup) - YEAR_GROUPS.indexOf(b.yearGroup) || (a.preferredName || a.givenName).localeCompare(b.preferredName || b.givenName) || a.familyName.localeCompare(b.familyName))
    .map((a) => ({ athleteId: a.id, yearGroup: a.yearGroup, label: gymSheetLabel(a) }));
}

/** Pages of at most 40 rows, each split into a left and right half of at most 20 (filled left first). */
export function gymSheetPages<T>(rows: T[], perPage = GYM_SHEET_PER_PAGE, perHalf = GYM_SHEET_PER_HALF): T[][][] {
  const pages: T[][][] = [];
  for (let i = 0; i < rows.length; i += perPage) {
    const page = rows.slice(i, i + perPage);
    const halves = [page.slice(0, perHalf), page.slice(perHalf)].filter((h) => h.length);
    pages.push(halves);
  }
  return pages.length ? pages : [[[]]];
}

/** The counted (term) weeks from one Monday to another; holiday weeks are skipped. */
export function gymSheetWeeks(config: Config, from: ISODate, to: ISODate): ISOWeek[] {
  const a = isoWeek(from);
  const b = isoWeek(to);
  return seasonWeeks(config.winter.season).filter((w) => w >= a && w <= b && whiteWeekKind(w, config.winter.season) === 'term');
}

/** The seven days of a week: "Mon 11 Jan". */
export function gymSheetDays(week: ISOWeek): { day: string; date: ISODate; label: string }[] {
  const mon = weekMonday(week);
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => {
    const date = addDays(mon, i);
    return { day, date, label: formatShortDate(date) };
  });
}

/** "Runners' Gym Log · week of Mon 11 Jan 2027" */
export function gymSheetTitle(week: ISOWeek): string {
  const mon = weekMonday(week);
  return `Runners' Gym Log · week of Mon ${formatShortDate(mon)} ${mon.slice(0, 4)}`;
}

/** "E Engine · A Armour · S Ski Fix · X Express · 1 Base · 2 Mid · 3 Summit (▲ only) · ! something hurt · RF recovery week" */
export function gymSheetLegend(config: Config): { legend: string; example: string } {
  const w = config.winter;
  // The term sheet lists the term cards (not the holiday-only card).
  const cards = w.cards.filter((c) => !c.tierless && !/holiday/i.test(c.name));
  const tiers = w.tierNames.map((t, i) => `${i + 1} ${t}${i === 2 ? ' (▲ only)' : ''}`);
  const legend = [...cards.map((c) => `${c.code} ${c.name}`), ...tiers, '! something hurt', 'RF recovery week'].join(' · ');
  const ex = cards.find((c) => c.code === 'A') ?? cards[0];
  const example = ex && w.tierNames[1] ? `${ex.code}2 = ${ex.name}, ${w.tierNames[1]}` : '';
  return { legend, example };
}

export const GYM_SHEET_FOOTER = 'Write your code in today’s box. Keep this sheet in the folder.';
