// Personal bests (spec 7), In-Form (spec 3.10) and course records (spec 3.13 / 6).
// Only live, verified performances count. PBs and records are raw measurements, never ratings.
import type { Athlete, Course, ISODate, Performance, PerfKind } from '../types';
import type { Config } from './config';
import type { CourseRecord, InFormEntry, PerfScore, PersonalBest, RatingKey } from './types';
import { YEAR_BANDS } from './types';
import { daysBetween } from './dates';
import { yearBand, yearGroupOn } from './display';
import { formatDelta, formatKm } from './format';
import { byDate, counts, resolveContext, type Lookup } from './perf';

/** Kinds whose time on a course is a raw course result. Relay legs and NAV runs are excluded. */
const COURSE_TIME_KINDS: PerfKind[] = ['race', 'parkrun', 'long_run', 'circuit', 'climb', 'descent'];
/** Kinds that get a distance PB ('dist:<km>') when not run on a course. */
const DISTANCE_KINDS: PerfKind[] = ['race', 'parkrun', 'long_run'];
/** A performance's own distance within this of the course distance still counts as that course. */
const SAME_COURSE_KM = 0.005;

const ARM_MEASURES = [
  { key: 'arm:ankle', field: 'ankleCm', label: 'Ankle (knee-to-wall)', unit: ['cm', 'cm'] },
  { key: 'arm:calf', field: 'calfReps', label: 'Calf raises', unit: ['rep', 'reps'] },
  { key: 'arm:stork', field: 'storkSec', label: 'Stork balance', unit: ['s', 's'] },
] as const;

const STAT_NAMES: Record<RatingKey, string> = {
  RACE: 'Race',
  SPD: 'Speed',
  END: 'Endurance',
  CLB: 'Climb',
  DSC: 'Descent',
  NAV: 'Navigation',
  ARM: 'Armour',
};

/**
 * The course whose raw time this performance sets, if any: a counted run of a course-time kind with a
 * time, resolved to a known course, not a failed clean run, and not over a different distance from the
 * course (a long run of several laps is not a course time).
 */
export function courseTimeOf(p: Performance, lookup: Lookup): { course: Course; timeSec: number } | undefined {
  if (!counts(p) || !COURSE_TIME_KINDS.includes(p.kind) || p.cleanRun === false) return undefined;
  if (!(p.timeSec != null && Number.isFinite(p.timeSec) && p.timeSec > 0)) return undefined;
  const course = resolveContext(p, lookup).course;
  if (!course) return undefined;
  if (p.distanceKm != null && Math.abs(p.distanceKm - course.distanceKm) > SAME_COURSE_KM) return undefined;
  return { course, timeSec: p.timeSec };
}

interface PbEntry {
  key: string;
  label: string;
  measure: 'time' | 'count';
  value: number;
  /** For ordering the current list: courses, distances, bleep, ARM. */
  sort: [number, number | string];
}

/** The PB keys a single performance contributes to (an ARM test can set up to three). */
function pbEntries(p: Performance, lookup: Lookup): PbEntry[] {
  if (!counts(p) || p.kind === 'relay_leg' || p.kind === 'nav' || p.cleanRun === false) return [];
  if (p.kind === 'bleep') {
    const laps = p.bleepLaps;
    return laps != null && Number.isFinite(laps) && laps > 0 ? [{ key: 'bleep', label: 'Bleep test', measure: 'count', value: laps, sort: [2, 0] }] : [];
  }
  if (p.kind === 'arm') {
    const out: PbEntry[] = [];
    ARM_MEASURES.forEach((m, i) => {
      const v = p.arm?.[m.field];
      if (v != null && Number.isFinite(v) && v >= 0) out.push({ key: m.key, label: m.label, measure: 'count', value: v, sort: [3, i] });
    });
    return out;
  }
  const ct = courseTimeOf(p, lookup);
  if (ct) return [{ key: `course:${ct.course.id}`, label: ct.course.name, measure: 'time', value: ct.timeSec, sort: [0, ct.course.name] }];
  if (!DISTANCE_KINDS.includes(p.kind) || !(p.timeSec != null && Number.isFinite(p.timeSec) && p.timeSec > 0)) return [];
  const km = resolveContext(p, lookup).distanceKm;
  if (km == null || !(km > 0)) return [];
  return [{ key: `dist:${km.toFixed(2)}`, label: formatKm(km), measure: 'time', value: p.timeSec, sort: [1, Math.round(km * 100)] }];
}

function tidy(x: number): number {
  return Math.round(x * 1000) / 1000;
}

/**
 * Personal bests for one athlete. Keys: 'course:<courseId>' (time), 'dist:<km to 2 dp>' for races,
 * parkruns and long runs off-course (time), 'bleep' (laps), 'arm:ankle' (cm), 'arm:calf' (reps),
 * 'arm:stork' (s). Times: lower is better; counts: higher is better. Equalling a best is not a PB.
 * `history` lists every PB-setting result oldest first (the first result on a key has no previousBest);
 * `current` is the standing PB on each key.
 */
export function computePersonalBests(perfs: Performance[], lookup: Lookup): { current: PersonalBest[]; history: PersonalBest[] } {
  const history: PersonalBest[] = [];
  const best = new Map<string, { pb: PersonalBest; sort: PbEntry['sort'] }>();
  for (const p of [...perfs].sort(byDate)) {
    for (const e of pbEntries(p, lookup)) {
      const prev = best.get(e.key)?.pb;
      const better = !prev || (e.measure === 'time' ? e.value < prev.value : e.value > prev.value);
      if (!better) continue;
      const pb: PersonalBest = { key: e.key, label: e.label, athleteId: p.athleteId, perfId: p.id, date: p.date, measure: e.measure, value: e.value };
      if (prev) {
        pb.previousBest = prev.value;
        pb.previousPerfId = prev.perfId;
        pb.improvement = tidy(e.measure === 'time' ? prev.value - e.value : e.value - prev.value);
      }
      history.push(pb);
      best.set(e.key, { pb, sort: e.sort });
    }
  }
  const current = [...best.values()]
    .sort((a, b) => a.sort[0] - b.sort[0] || (a.sort[1] < b.sort[1] ? -1 : a.sort[1] > b.sort[1] ? 1 : 0) || (a.pb.key < b.pb.key ? -1 : 1))
    .map((x) => x.pb);
  return { current, history };
}

function countText(key: string, improvement: number): string {
  const n = Number.isInteger(improvement) ? String(improvement) : improvement.toFixed(1);
  const unit = key === 'bleep' ? ['lap', 'laps'] : (ARM_MEASURES.find((m) => m.key === key)?.unit ?? ['', '']);
  return `+${n} ${improvement === 1 ? unit[0] : unit[1]}`.trimEnd();
}

/**
 * In-Form (spec 3.10): PBs in the last config.inForm.days days up to and including asOf
 * (asOf − days + 1 … asOf).
 * (a) 'raw': a raw PB that beats a previous best on the same key ('PB −12 s', '+3 laps').
 * (b) 'score': a new best unpenalised score for a stat (perfScores[].feeds / .score) beating the
 *     athlete's previous best score for that stat ('SPD 71 → 74').
 * A first-ever result on a key or stat is not In-Form. Raw entries come first, then score entries;
 * each newest first, so entries[0] is the card's headline.
 */
export function computeInForm(input: {
  athleteId: string;
  perfs: Performance[];
  perfScores: PerfScore[];
  lookup: Lookup;
  config: Config;
  asOf: ISODate;
}): InFormEntry[] {
  const { athleteId, lookup, config, asOf } = input;
  const inWindow = (d: ISODate) => {
    const n = daysBetween(d, asOf);
    return n >= 0 && n < config.inForm.days;
  };
  const mine = input.perfs.filter((p) => p.athleteId === athleteId && p.date <= asOf).sort(byDate);

  const raw: InFormEntry[] = computePersonalBests(mine, lookup)
    .history.filter((pb) => pb.previousBest != null && pb.improvement != null && inWindow(pb.date))
    .map((pb) => ({
      athleteId,
      perfId: pb.perfId,
      date: pb.date,
      type: 'raw',
      label: pb.label,
      text: pb.measure === 'time' ? `PB ${formatDelta(-(pb.improvement as number))}` : countText(pb.key, pb.improvement as number),
      improvement: pb.improvement,
    }));

  const order = new Map(mine.map((p, i) => [p.id, i]));
  const scorable = new Set(mine.filter((p) => counts(p) && p.cleanRun !== false).map((p) => p.id));
  const scores = input.perfScores
    .filter((s) => s.athleteId === athleteId && s.score != null && !s.unscoredReason && scorable.has(s.perfId))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (order.get(a.perfId) as number) - (order.get(b.perfId) as number)));
  const bestByStat = new Map<RatingKey, number>();
  const scored: InFormEntry[] = [];
  for (const s of scores) {
    const score = s.score as number;
    for (const stat of new Set(s.feeds)) {
      const prev = bestByStat.get(stat);
      if (prev != null && score <= prev) continue;
      if (prev != null && inWindow(s.date)) {
        scored.push({ athleteId, perfId: s.perfId, date: s.date, type: 'score', label: STAT_NAMES[stat], text: `${stat} ${prev} → ${score}`, improvement: score - prev, stat });
      }
      bestByStat.set(stat, score);
    }
  }

  const newestFirst = (a: InFormEntry, b: InFormEntry) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
  return [...raw.sort(newestFirst), ...scored.sort(newestFirst)];
}

/**
 * Course records (spec 3.13 / 6): the raw best time on each course for each sex × year band
 * (Y7–8, Y9–11, Y12–13, Staff), using the athlete's year group at the time of the run. Counted runs only;
 * descents with cleanRun === false, relay legs and NAV runs are excluded. A tie keeps the earlier holder.
 * Sorted by course id, sex (F, M) and band.
 */
export function computeCourseRecords(input: { athletes: Athlete[]; perfs: Performance[]; lookup: Lookup; config: Config; asOf: ISODate }): CourseRecord[] {
  const { lookup, config, asOf } = input;
  const athletes = new Map(input.athletes.map((a) => [a.id, a]));
  const best = new Map<string, CourseRecord>();
  for (const p of input.perfs.filter((q) => q.date <= asOf).sort(byDate)) {
    const ct = courseTimeOf(p, lookup);
    const a = athletes.get(p.athleteId);
    if (!ct || !a) continue;
    const yearGroupAtTime = yearGroupOn(a, p.date, config, asOf);
    const band = yearBand(yearGroupAtTime);
    const k = `${ct.course.id}|${a.sex}|${band}`;
    const cur = best.get(k);
    if (cur && cur.timeSec <= ct.timeSec) continue;
    best.set(k, { courseId: ct.course.id, sex: a.sex, band, athleteId: a.id, perfId: p.id, timeSec: ct.timeSec, date: p.date, yearGroupAtTime });
  }
  return [...best.values()].sort(
    (a, b) =>
      (a.courseId < b.courseId ? -1 : a.courseId > b.courseId ? 1 : 0) ||
      (a.sex < b.sex ? -1 : a.sex > b.sex ? 1 : 0) ||
      YEAR_BANDS.indexOf(a.band) - YEAR_BANDS.indexOf(b.band),
  );
}
