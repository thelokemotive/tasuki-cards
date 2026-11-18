// Treadmill sessions: what a logged run is, how it is checked, and the pupil's own treadmill numbers.
// A treadmill session is mostly habit: it keeps the weekly streak going (config.streak.treadmillCounts), fills
// the treadmill log and earns km club badges. Only a long one (at least end.longRunMinKmEff of effort, incline
// counted as climb) feeds a rating, END, age-graded like a long run (config.treadmill.feedsEnd). It never feeds
// SPD or CLB: belts differ and the rails can be held, which matters far more over a fast or steep effort.
import type { ISODate, Performance } from '../../types';
import type { Config } from '../config';
import { addDays, isISODate } from '../dates';
import { formatTime } from '../format';
import type { Badge } from '../types';

export interface TreadmillValues {
  distanceKm?: number;
  timeSec?: number;
  inclinePct?: number;
  speedKmh?: number;
  /** How hard it felt, 1–10. */
  effort?: number;
}

/** Climb from the incline: 5 km at 1% is 50 m (distance × incline). */
export function treadmillClimbM(distanceKm: number, inclinePct = 0): number {
  return Math.round(distanceKm * 1000 * (Math.max(0, inclinePct) / 100));
}

/** Average speed over the session, km/h. */
export function averageKmh(distanceKm: number, timeSec: number): number {
  return (distanceKm / timeSec) * 3600;
}

export interface TreadmillCheck {
  /** Reasons the log cannot be sent (missing or impossible values). */
  errors: string[];
  /** Reasons the coach should look twice (sent, and shown on the inbox card). */
  flags: string[];
}

/**
 * Check a log before it is sent. Errors block it; flags go to the coach with it.
 * `today` is the pupil's date; logs dated in the future or more than treadmill.maxDaysOld ago are refused.
 */
export function checkTreadmillRun(v: TreadmillValues, date: ISODate, today: ISODate, config: Config): TreadmillCheck {
  const t = config.treadmill;
  const errors: string[] = [];
  const flags: string[] = [];
  if (!isISODate(date)) errors.push('Choose the date of the run.');
  else if (date > today) errors.push('The date is in the future.');
  else if (date < addDays(today, -t.maxDaysOld)) errors.push(`Runs older than ${t.maxDaysOld} days cannot be logged here: tell your coach.`);
  if (!(v.distanceKm != null && v.distanceKm > 0)) errors.push('Enter the distance.');
  if (!(v.timeSec != null && v.timeSec > 0)) errors.push('Enter the time.');
  if (v.effort != null && !(Number.isInteger(v.effort) && v.effort >= 1 && v.effort <= 10)) errors.push('How hard it felt is a number from 1 to 10.');
  if (errors.length) return { errors, flags };
  const d = v.distanceKm!;
  const s = v.timeSec!;
  const avg = averageKmh(d, s);
  if (avg > t.maxSpeedKmh) errors.push(`${d} km in ${formatTime(s)} is ${avg.toFixed(1)} km/h on average: check the distance and the time.`);
  if (d > 50) errors.push('Check the distance: more than 50 km.');
  if (errors.length) return { errors, flags };
  if (d < t.minKm) flags.push(`short: under ${t.minKm} km`);
  if (v.inclinePct != null && v.inclinePct > t.maxInclinePct) flags.push(`incline ${v.inclinePct}% is steeper than the treadmill goes`);
  if (v.speedKmh != null && v.speedKmh > t.maxSpeedKmh) flags.push(`speed on the display ${v.speedKmh} km/h`);
  // The display shows the speed at the end; well above the average it was a sprint finish, well below a
  // cool-down. Far apart from both is worth a look (another runner's time, or a misread).
  if (v.speedKmh != null && v.speedKmh > 0 && (avg > v.speedKmh * 2.2 || avg < v.speedKmh / 3)) flags.push(`average ${avg.toFixed(1)} km/h vs ${v.speedKmh} km/h on the display`);
  return { errors, flags };
}

/** One line for the record: "Treadmill 5.000 km in 25:30 at 1.0% (12.0 km/h at the end), effort 6/10". */
export function treadmillRawInput(v: TreadmillValues, how: string): string {
  const parts = [`Treadmill ${v.distanceKm?.toFixed(3)} km in ${v.timeSec != null ? formatTime(v.timeSec) : '?'}`];
  if (v.inclinePct != null) parts.push(`at ${v.inclinePct.toFixed(1)}%`);
  if (v.speedKmh != null) parts.push(`(${v.speedKmh.toFixed(1)} km/h at the end)`);
  if (v.effort != null) parts.push(`effort ${v.effort}/10`);
  return `${parts.join(' ')}; ${how}`;
}

export interface TreadmillSummary {
  sessions: number;
  totalKm: number;
  /** Since `since` (e.g. the start of the half-term). */
  sessionsSince: number;
  kmSince: number;
  longestKm?: number;
  /** Fastest average speed over a session of at least 1 km. */
  fastestKmh?: number;
  /** The next km club milestone and how far there is to go. */
  nextMilestone?: { km: number; toGo: number };
  last?: Performance;
}

const live = (p: Performance) => !p.deleted && p.verified;

export function treadmillSummary(perfs: Performance[], athleteId: string, asOf: ISODate, config: Config, since?: ISODate): TreadmillSummary {
  const mine = perfs.filter((p) => p.athleteId === athleteId && p.kind === 'treadmill' && live(p) && p.date <= asOf && p.distanceKm != null).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const km = (xs: Performance[]) => Math.round(xs.reduce((a, p) => a + (p.distanceKm ?? 0), 0) * 1000) / 1000;
  const recent = since ? mine.filter((p) => p.date >= since) : mine;
  const totalKm = km(mine);
  const speeds = mine.filter((p) => (p.distanceKm ?? 0) >= 1 && p.timeSec).map((p) => averageKmh(p.distanceKm!, p.timeSec!));
  const next = [...config.treadmill.kmMilestones].sort((a, b) => a - b).find((m) => m > totalKm);
  return {
    sessions: mine.length,
    totalKm,
    sessionsSince: recent.length,
    kmSince: km(recent),
    longestKm: mine.length ? Math.max(...mine.map((p) => p.distanceKm!)) : undefined,
    fastestKmh: speeds.length ? Math.round(Math.max(...speeds) * 10) / 10 : undefined,
    nextMilestone: next != null ? { km: next, toGo: Math.round((next - totalKm) * 10) / 10 } : undefined,
    last: mine[mine.length - 1],
  };
}

/** Treadmill km club badges: the highest milestone reached by total verified treadmill km. */
export function treadmillBadges(perfs: Performance[], athleteId: string, asOf: ISODate, config: Config): Badge[] {
  const mine = perfs.filter((p) => p.athleteId === athleteId && p.kind === 'treadmill' && live(p) && p.date <= asOf).sort((a, b) => (a.date < b.date ? -1 : 1));
  let total = 0;
  const reached = new Map<number, Performance>();
  const milestones = [...config.treadmill.kmMilestones].sort((a, b) => a - b);
  for (const p of mine) {
    total += p.distanceKm ?? 0;
    for (const m of milestones) if (total >= m - 1e-9 && !reached.has(m)) reached.set(m, p);
  }
  const top = milestones.filter((m) => reached.has(m)).pop();
  if (top == null) return [];
  const p = reached.get(top)!;
  return [{ key: `treadmill-${top}`, kind: 'treadmill', label: `Treadmill ${top} km club`, icon: '👟', date: p.date, perfId: p.id, count: top }];
}
