// Scoring of single performances (spec 3.5–3.7 and the per-performance parts of 3.9).
// Pure functions: every constant comes from config, and "today" is always the asOf parameter.
// Raw performances are never modified; a PerfScore is derived and reproducible from inputs + config.
import type { Athlete, ISODate, Sex } from '../types';
import type { Config } from './config';
import { BLEEP_PERCENTILES } from './config';
import type { PerfScore, RatingKey } from './types';
import { ageOnDate } from './age';
import { armLevelsFromTest, type ArmDomain } from './arm';
import { isISODate, monthsBetween } from './dates';
import type { PerfContext } from './perf';
import { isAgeGradeProvisional, standardTime } from './standards';

/**
 * Reference distance (km) of the fixed-benchmark age adjustment, Std(age, sex, 5) / Std(25, sex, 5)
 * (spec 3.6). Config has no key for it yet; a later config version may add `age.fixedReferenceKm`.
 */
export const FIXED_REFERENCE_KM_DEFAULT = 5;

/**
 * NAV efficiency that maps to the minimum score (spec 3.9: 40 + 59 × (eff − 0.5) / 0.5, so eff 0.5 → 40
 * and eff 1.0 → 99). Config has no key for it yet; a later config version may add `nav.effAtMin`.
 */
export const NAV_EFF_AT_MIN_DEFAULT = 0.5;

/** Why a performance is listed but not scored. Shown in the Career Vault and used for lock messages. */
export const UNSCORED = {
  deleted: 'deleted',
  unverified: 'unverified',
  future: 'after the as-of date',
  noTime: 'no time',
  noDistance: 'no distance',
  noLaps: 'no laps',
  noCourse: 'no course set (descents are scored against a course benchmark)',
  benchmark: "set this course's benchmark in Settings",
  notClean: 'not a clean run',
  noRefPace: 'no reference pace yet (run the Circuit first)',
  noRoute: 'no route distance',
  noArm: 'no ARM measurements',
  noDate: 'no valid date',
  noAge: "age or sex unknown (check the athlete's year group, date of birth and sex)",
  badNavErrors: 'nav errors must be a whole number of 0 or more',
  unknownKind: 'unknown result kind',
} as const;

/** A usable measurement: a finite number above zero (rejects NaN, Infinity and blanks). */
function positive(x: number | undefined): x is number {
  return x != null && Number.isFinite(x) && x > 0;
}

/** Round, ignoring floating-point noise (76.49999999999999 → 77, as the exact 76.5 would). */
export function roundScore(x: number): number {
  return Math.round(Number(x.toFixed(6)));
}

/** clamp(round(x), runScore.min, runScore.max): every 40–99 number goes through here. */
export function clampScore(x: number, config: Config): number {
  const { min, max } = config.runScore;
  return Math.min(max, Math.max(min, roundScore(x)));
}

/** RunScore = clamp(round(99 × AG% / anchorAG), 40, 99) (spec 3.5). AG 0.80 → 99; AG 0.60 → 74. */
export function runScoreFromAG(ag: number, config: Config): number {
  return clampScore((config.runScore.max * ag) / config.runScore.anchorAG, config);
}

function fixedReferenceKm(config: Config): number {
  const km = (config.age as Config['age'] & { fixedReferenceKm?: number }).fixedReferenceKm;
  return km != null && km > 0 ? km : FIXED_REFERENCE_KM_DEFAULT;
}

function navEffAtMin(config: Config): number {
  const e = (config.nav as Config['nav'] & { effAtMin?: number }).effAtMin;
  return e != null && e < 1 ? e : NAV_EFF_AT_MIN_DEFAULT;
}

/** ageAdj = Std(age, sex, 5) / Std(fixedReferenceAge, sex, 5): ≥ 1 for juniors and older staff (spec 3.6). */
export function fixedAgeAdjustment(age: number, sex: Sex, config: Config): number {
  const km = fixedReferenceKm(config);
  return standardTime(age, sex, km, config) / standardTime(config.age.fixedReferenceAge, sex, km, config);
}

/** Fixed-benchmark score = clamp(round(99 × (t99Open(sex) × ageAdj) / timeSec), 40, 99) (spec 3.6). */
export function fixedBenchmarkScore(timeSec: number, age: number, sex: Sex, t99OpenSec: number, config: Config): number {
  return clampScore((config.runScore.max * t99OpenSec * fixedAgeAdjustment(age, sex, config)) / timeSec, config);
}

export interface Freshness {
  /** clamp(Score − penalty); undefined once expired. */
  fresh?: number;
  penalty: number;
  /** Whole calendar months from the performance date to asOf. */
  monthsOld: number;
  /** monthsOld > expireMonths: excluded from current ratings, kept in the Career Vault. */
  expired: boolean;
}

/**
 * Freshness, "the Ronaldo rule" (spec 3.7). monthsOld ≤ grace: no penalty; then
 * (monthsOld − grace) × decayPointsPerMonth; monthsOld > expireMonths: expired.
 * Defaults: 3 months → −0; 12 months → −6; 30 months → expired.
 */
export function freshness(score: number, perfDate: ISODate, asOf: ISODate, config: Config): Freshness {
  const { decayGraceMonths, decayPointsPerMonth, expireMonths } = config.freshness;
  const monthsOld = monthsBetween(perfDate, asOf);
  const penalty = Math.max(0, monthsOld - decayGraceMonths) * decayPointsPerMonth;
  const expired = monthsOld > expireMonths;
  return { fresh: expired ? undefined : clampScore(score - penalty, config), penalty, monthsOld, expired };
}

/** Bleep table row (laps at P5…P95) for floor(age), clamped to the table's ages (under 11 → 11, 18+ → 18). */
export function bleepRow(sex: Sex, age: number, config: Config): number[] {
  const { bleepMinAge, bleepMaxAge, bleepTable } = config.end;
  const a = Math.min(bleepMaxAge, Math.max(bleepMinAge, Math.floor(age + 1e-9)));
  const table = bleepTable[sex];
  if (table[a]) return table[a];
  // A hand-edited table with a missing age: use the nearest age below, else the youngest.
  const keys = Object.keys(table).map(Number).sort((p, q) => p - q);
  const below = keys.filter((k) => k <= a);
  return table[below.length ? below[below.length - 1] : keys[0]];
}

/**
 * Percentile (0–95) for bleep laps: linear between the table's percentile points, from 0 laps = P0 up
 * to L_P95. At or above L_P95 this returns 95 (the rating handles the range above P95).
 * Boys 13 (… P70 56, P80 64 …): 60 laps → 70 + (60 − 56) / (64 − 56) × 10 = P75.
 */
export function bleepPercentile(laps: number, sex: Sex, age: number, config: Config): number {
  if (!(laps > 0)) return 0;
  const row = bleepRow(sex, age, config);
  const pts: [number, number][] = [[0, 0], ...row.map((l, i): [number, number] => [l, BLEEP_PERCENTILES[i] ?? BLEEP_PERCENTILES[BLEEP_PERCENTILES.length - 1]])];
  let i = 0;
  pts.forEach(([l], k) => {
    if (laps >= l) i = k;
  });
  if (i === pts.length - 1) return pts[i][1];
  const [x0, p0] = pts[i];
  const [x1, p1] = pts[i + 1];
  return p0 + ((laps - x0) / (x1 - x0)) * (p1 - p0);
}

/**
 * Bleep rating (spec 3.9): clamp(round(40 + 0.59 × P), 40, 96) up to L_P95; above it, linear from 96 at
 * L_P95 to 99 at 1.20 × L_P95, capped at 99.
 */
export function bleepRating(laps: number, sex: Sex, age: number, config: Config): number {
  const e = config.end;
  const row = bleepRow(sex, age, config);
  const l95 = row[row.length - 1];
  if (!(laps > l95)) {
    const p = bleepPercentile(laps, sex, age, config);
    return Math.min(e.bleepCapAtP95, Math.max(e.bleepBase, roundScore(e.bleepBase + e.bleepSlope * p)));
  }
  const span = (e.bleepTopMultiplier - 1) * l95;
  if (!(span > 0)) return e.bleepTopScore;
  const r = e.bleepCapAtP95 + ((e.bleepTopScore - e.bleepCapAtP95) * (laps - l95)) / span;
  return Math.min(e.bleepTopScore, roundScore(r));
}

/** ARM levels run 1–5 in each of the three domains (spec 3.9). */
const ARM_MIN_LEVEL = 1;
const ARM_MAX_LEVEL = 5;

/** True when every domain has reached at least level 1 (a measurement below L1 is level 0: no level yet). */
export function armComplete(levels: Partial<Record<ArmDomain, number>>): levels is Record<ArmDomain, number> {
  return [levels.ankle, levels.calf, levels.balance].every((l) => l != null && l >= ARM_MIN_LEVEL);
}

/**
 * ARM = round(40 + (sumOfLevels − 3) × 59 / 12) (spec 3.9), with 40 and 59 taken from the 40–99 scale in
 * config (runScore.min, runScore.max − runScore.min). Call only once every domain has a level (armComplete):
 * all L1 → 40, all L5 → 99. Defaults give the same numbers as armScore() in arm.ts.
 */
export function armScoreClamped(levels: Record<ArmDomain, number>, config: Config): number {
  const { min, max } = config.runScore;
  const domains = 3;
  const sum = levels.ankle + levels.calf + levels.balance;
  const span = domains * (ARM_MAX_LEVEL - ARM_MIN_LEVEL);
  return clampScore(min + ((sum - domains * ARM_MIN_LEVEL) * (max - min)) / span, config);
}

/** NAV efficiency: predicted = routeKmEff × refPace × allowance; eff = predicted / (timeSec + penalty × errors). */
export function navEfficiency(routeKmEff: number, refPaceSecPerKm: number, timeSec: number, navErrors: number, config: Config): { predictedSec: number; eff: number } {
  const predictedSec = routeKmEff * refPaceSecPerKm * config.nav.allowance;
  return { predictedSec, eff: predictedSec / (timeSec + config.nav.penaltySecPerError * navErrors) };
}

/** NAV = clamp(round(40 + 59 × (eff − 0.5) / 0.5), 40, 99); navErrors ≥ maxErrors → 40 (spec 3.9). */
export function navScoreFromEfficiency(eff: number, navErrors: number, config: Config): number {
  const { min, max } = config.runScore;
  if (navErrors >= config.nav.maxErrors) return min;
  const e0 = navEffAtMin(config);
  return clampScore(min + ((max - min) * (eff - e0)) / (1 - e0), config);
}

/**
 * The ratings a performance belongs to, judged by its kind (and D_eff for the END long-run pathway).
 * race / relay_leg / parkrun → RACE (+ END when D_eff ≥ longRunMinKmEff); long_run → END when long
 * enough; circuit → SPD; climb → CLB; descent → DSC; nav → NAV; bleep → END; arm → ARM.
 */
export function perfFeeds(ctx: PerfContext, config: Config): RatingKey[] {
  const longEnough = config.end.allowLongRuns && ctx.dEff != null && ctx.dEff >= config.end.longRunMinKmEff - 1e-9;
  switch (ctx.perf.kind) {
    case 'race':
    case 'relay_leg':
    case 'parkrun':
      return longEnough ? ['RACE', 'END'] : ['RACE'];
    case 'long_run':
      return longEnough ? ['END'] : [];
    case 'circuit':
      return ['SPD'];
    case 'climb':
      return ['CLB'];
    case 'descent':
      return ['DSC'];
    case 'nav':
      return ['NAV'];
    case 'bleep':
      return ['END'];
    case 'arm':
      return ['ARM'];
    default:
      // A kind this version does not know (e.g. from a newer backup) feeds nothing.
      return [];
  }
}

/**
 * Score one performance. Every performance (including deleted and unverified ones) gets a PerfScore so
 * the Career Vault can list it; only live, verified results dated on or before asOf are scored.
 * - Timed runs: RunScore from AG% = Std(age, sex, D_eff) / timeSec, or the fixed benchmark when the
 *   resolved course is in fixed mode (descents default to fixed). Freshness applies.
 * - Bleep: bleepRating (freshness applies). NAV: from refs.navRefPaceSecPerKm (freshness applies).
 * - ARM: no freshness decay (the ARM window replaces it); score only when the test gave all three domains
 *   a level (L1 or better). A domain measured below L1 still feeds ARM (it is listed) but has no level.
 * feeds lists the ratings a scored result belongs to; `fresh` (undefined once expired) says whether it
 * counts today. Broken inputs are unscored with a reason, never turned into a number: a time, route or
 * pace that is not a finite positive number, a negative or infinite lap count, a negative or fractional
 * NAV error count, a date
 * that is not a real ISO date, an unknown kind, or (for age-graded, fixed and bleep scores) an athlete
 * whose age or sex cannot be worked out.
 */
export function scorePerformance(ctx: PerfContext, athlete: Athlete, config: Config, asOf: ISODate, refs: { navRefPaceSecPerKm?: number } = {}): PerfScore {
  const p = ctx.perf;
  const { age, estimated } = ageOnDate(athlete, p.date, config, asOf);
  const monthsOld = monthsBetween(p.date, asOf);
  const base: PerfScore = {
    perfId: p.id,
    athleteId: p.athleteId,
    date: p.date,
    kind: p.kind,
    feeds: [],
    penalty: 0,
    monthsOld,
    expired: monthsOld > config.freshness.expireMonths,
    dEff: ctx.dEff,
    age,
    ageEstimated: estimated,
    provisional: false,
    configVersion: config.version,
  };
  const unscored = (reason: string): PerfScore => ({ ...base, unscoredReason: reason });
  const scored = (score: number, provisional: boolean, extra: Partial<PerfScore> = {}): PerfScore => {
    const f = freshness(score, p.date, asOf, config);
    return { ...base, ...extra, feeds: perfFeeds(ctx, config), score, fresh: f.fresh, penalty: f.penalty, expired: f.expired, provisional };
  };

  if (p.deleted) return unscored(UNSCORED.deleted);
  if (!p.verified) return unscored(UNSCORED.unverified);
  if (!isISODate(p.date)) return unscored(UNSCORED.noDate);
  if (p.date > asOf) return unscored(UNSCORED.future);
  // Age-graded, fixed-benchmark and bleep scores all need a real age and sex: never guess them.
  const ageAndSexKnown = Number.isFinite(age) && (athlete.sex === 'M' || athlete.sex === 'F');

  switch (p.kind) {
    case 'arm': {
      const levels = armLevelsFromTest(p.arm, config);
      if (levels.ankle == null && levels.calf == null && levels.balance == null) return unscored(UNSCORED.noArm);
      const score = armComplete(levels) ? armScoreClamped(levels, config) : undefined;
      return { ...base, feeds: perfFeeds(ctx, config), score, fresh: base.expired ? undefined : score, provisional: config.arm.provisional };
    }
    case 'bleep': {
      if (p.bleepLaps == null || !Number.isFinite(p.bleepLaps) || p.bleepLaps < 0) return unscored(UNSCORED.noLaps);
      if (!ageAndSexKnown) return unscored(UNSCORED.noAge);
      return scored(bleepRating(p.bleepLaps, athlete.sex, age, config), config.end.bleepProvisional);
    }
    case 'nav': {
      if (!positive(p.timeSec)) return unscored(UNSCORED.noTime);
      const route = p.routeKmEff ?? ctx.dEff;
      if (!positive(route)) return unscored(UNSCORED.noRoute);
      const ref = refs.navRefPaceSecPerKm;
      if (!positive(ref)) return unscored(UNSCORED.noRefPace);
      // A blank error count means no errors; a negative or broken count would inflate the score.
      const errors = p.navErrors ?? 0;
      if (!Number.isInteger(errors) || errors < 0) return unscored(UNSCORED.badNavErrors);
      const { eff } = navEfficiency(route, ref, p.timeSec, errors, config);
      return scored(navScoreFromEfficiency(eff, errors, config), config.nav.provisional, { dEff: route });
    }
    case 'race':
    case 'relay_leg':
    case 'parkrun':
    case 'long_run':
    case 'circuit':
    case 'climb':
    case 'descent': {
      if (p.kind === 'descent' && p.cleanRun === false) return unscored(UNSCORED.notClean);
      if (!positive(p.timeSec)) return unscored(UNSCORED.noTime);
      const agProvisional = isAgeGradeProvisional(config);
      const mode = ctx.course?.benchmarkMode ?? (p.kind === 'descent' ? 'fixed' : 'age_grade');
      if (mode === 'fixed') {
        if (!ctx.course) return unscored(UNSCORED.noCourse);
        if (!ageAndSexKnown) return unscored(UNSCORED.noAge);
        const t99 = athlete.sex === 'M' ? ctx.course.t99OpenM : ctx.course.t99OpenF;
        if (!positive(t99)) return unscored(UNSCORED.benchmark);
        return scored(fixedBenchmarkScore(p.timeSec, age, athlete.sex, t99, config), agProvisional);
      }
      if (!(ctx.dEff != null && ctx.dEff > 0)) return unscored(UNSCORED.noDistance);
      if (!ageAndSexKnown) return unscored(UNSCORED.noAge);
      const std = standardTime(age, athlete.sex, ctx.dEff, config);
      const ag = std / p.timeSec;
      return scored(runScoreFromAG(ag, config), agProvisional, { ageGrade: ag, standardSec: std });
    }
    default:
      return unscored(UNSCORED.unknownKind);
  }
}
