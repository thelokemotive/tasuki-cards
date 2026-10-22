// Weekly streaks (spec 3.11). Weeks run Monday–Sunday; all dates are already Tokyo calendar dates.
import type { Calendar, HalfTerm, ISODate, ISOWeek, Participation, Performance } from '../types';
import type { Config } from './config';
import type { StreakResult, StreakWeek, StreakWeekState } from './types';
import { isoWeek, weekMonday, weeksInRange } from './dates';
import { counts, resolveContext, type Lookup } from './perf';

/** A Circuit run: performance kind 'circuit', or any performance on a course of kind 'circuit'. */
export function isCircuitPerf(p: Performance, lookup: Lookup): boolean {
  if (p.kind === 'circuit') return true;
  return resolveContext(p, lookup).course?.kind === 'circuit';
}

/** The half-term containing the Monday of `week` (undefined if no configured half-term contains it). */
export function halfTermOfWeek(week: ISOWeek, halfTerms: HalfTerm[]): HalfTerm | undefined {
  const monday = weekMonday(week);
  return halfTerms.find((h) => h.start <= monday && monday <= h.end);
}

/**
 * Streak for one athlete as of `asOf`.
 * - A week counts if it has a verified, live Circuit performance or a stored 'saturday_run' participation.
 * - Holiday weeks (calendar.holidayWeeks) neither count nor break; a verified parkrun or long run in one
 *   sets holidayBonus (a flame) without changing the count.
 * - A 'freeze' participation holds an otherwise-missed week (state 'frozen'). Only
 *   config.streak.freezesPerHalfTerm freezes are honoured per half-term (the half-term containing the
 *   week's Monday), in week order; further freezes are ignored and the week is missed. A freeze on a week
 *   that already counts, or on a holiday week, is not needed and uses none of the allowance.
 * - The week containing asOf with no activity yet is 'current' (in progress, not missed).
 * `weeks` runs oldest first, from the athlete's first relevant week to the current week.
 */
export function computeStreak(input: {
  athleteId: string;
  perfs: Performance[];
  participation: Participation[];
  calendar: Calendar;
  config: Config;
  asOf: ISODate;
  lookup: Lookup;
}): StreakResult {
  const { athleteId, calendar, config, asOf, lookup } = input;
  const currentWeek = isoWeek(asOf);
  const holidays = new Set(calendar.holidayWeeks);

  const mine = input.perfs.filter((p) => p.athleteId === athleteId && counts(p) && p.date <= asOf);
  const activeWeeks = new Set<ISOWeek>();
  const bonusWeeks = new Set<ISOWeek>();
  for (const p of mine) {
    if (isCircuitPerf(p, lookup)) activeWeeks.add(isoWeek(p.date));
    if (p.kind === 'parkrun' || p.kind === 'long_run') bonusWeeks.add(isoWeek(p.date));
  }
  const freezeWeeks = new Set<ISOWeek>();
  for (const q of input.participation) {
    if (q.athleteId !== athleteId) continue;
    // Stored 'circuit' participation is ignored: Circuit participation is derived from performances.
    if (q.type === 'saturday_run' && q.date <= asOf) activeWeeks.add(q.isoWeek);
    if (q.type === 'freeze' && q.isoWeek <= currentWeek) freezeWeeks.add(q.isoWeek);
  }

  const relevant = [...activeWeeks, ...freezeWeeks, ...[...bonusWeeks].filter((w) => holidays.has(w))].filter((w) => w <= currentWeek);
  if (relevant.length === 0) {
    return { athleteId, currentStreak: 0, bestStreak: 0, status: 'none', holidayBonusFlames: 0, weeks: [] };
  }
  const first = relevant.reduce((a, b) => (b < a ? b : a));

  const freezesUsed = new Map<string, number>();
  const weeks: StreakWeek[] = weeksInRange(first, currentWeek).map((week) => {
    let state: StreakWeekState;
    if (holidays.has(week)) state = 'holiday';
    else if (activeWeeks.has(week)) state = 'counted';
    else if (freezeWeeks.has(week) && takeFreeze(week)) state = 'frozen';
    else state = week === currentWeek ? 'current' : 'missed';
    return { week, state, holidayBonus: state === 'holiday' && bonusWeeks.has(week) };
  });

  function takeFreeze(week: ISOWeek): boolean {
    const ht = halfTermOfWeek(week, calendar.halfTerms);
    if (!ht) return false;
    const used = freezesUsed.get(ht.id) ?? 0;
    if (used >= config.streak.freezesPerHalfTerm) return false;
    freezesUsed.set(ht.id, used + 1);
    return true;
  }

  // Best: longest run of counted weeks, where holiday, frozen and current weeks neither add nor break.
  let run = 0;
  let bestStreak = 0;
  for (const w of weeks) {
    if (w.state === 'counted') bestStreak = Math.max(bestStreak, ++run);
    else if (w.state === 'missed') run = 0;
  }

  // Current: walk back from the current week (skipped while in progress) to the first missed week.
  let currentStreak = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    const s = weeks[i].state;
    if (s === 'missed') break;
    if (s === 'counted') currentStreak++;
  }

  const lastDecided = [...weeks].reverse().find((w) => w.state !== 'holiday' && w.state !== 'current');
  let status: StreakResult['status'];
  if (currentStreak > 0) status = lastDecided?.state === 'frozen' ? 'frozen' : 'active';
  else status = bestStreak > 0 ? 'broken' : 'none';

  return {
    athleteId,
    currentStreak,
    bestStreak,
    status,
    holidayBonusFlames: weeks.filter((w) => w.holidayBonus).length,
    weeks,
  };
}
