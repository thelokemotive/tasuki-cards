import { describe, expect, it } from 'vitest';
import type { Athlete, Course, Performance } from '../types';
import { DEFAULT_CONFIG, cloneConfig, type Config } from './config';
import { makeLookup, resolveContext } from './perf';
import { standardTime } from './standards';
import { armLevelsFromTest } from './arm';
import {
  armComplete,
  armScoreClamped,
  bleepPercentile,
  bleepRating,
  clampScore,
  fixedAgeAdjustment,
  fixedBenchmarkScore,
  freshness,
  navEfficiency,
  navScoreFromEfficiency,
  perfFeeds,
  runScoreFromAG,
  scorePerformance,
  UNSCORED,
} from './scoring';

const cfg = DEFAULT_CONFIG;
const AS_OF = '2026-10-22';

function athlete(over: Partial<Athlete> = {}): Athlete {
  return {
    id: 'a-coach',
    givenName: 'Coach',
    familyName: 'Example',
    preferredName: 'Coach',
    aliases: [],
    sex: 'M',
    yearGroup: 'Staff', // no dob → age 30 exactly (config.age.staffDefaultAge)
    displayMode: 'full',
    absoluteBoardOptOut: false,
    avatar: { seed: 1, skinTone: 0, hairStyle: 0, hairColour: 0, kitColour: 'academy-navy', accessory: 'none' },
    active: true,
    ...over,
  };
}

/** Y9 boy, year group for 2026–27: on 2026-09-01 his estimated age is 13 + 0.5 + 0 = 13.5. */
const ben = athlete({ id: 'a-ben', givenName: 'Ben', familyName: 'Sampleton', preferredName: 'Ben', yearGroup: 'Y9', yearGroupYear: 2026 });

let n = 0;
function perf(over: Partial<Performance>): Performance {
  n += 1;
  return { id: `p${n}`, athleteId: 'a-coach', date: '2026-10-01', kind: 'circuit', verified: true, source: 'coach', rawInput: '', history: [], ...over };
}

const circuit: Course = { id: 'c-circuit', name: 'Campus Circuit', kind: 'circuit', distanceKm: 1.3, climbM: 0, terrainFactor: 1, benchmarkMode: 'age_grade', version: 1 };
const slope: Course = { id: 'c-desc', name: 'Test Slope Descent', kind: 'descent', distanceKm: 1.0, climbM: 0, terrainFactor: 1, benchmarkMode: 'fixed', t99OpenM: 180, version: 1 };
const lookup = makeLookup([circuit, slope], []);

function score(p: Performance, a: Athlete = athlete(), config: Config = cfg, refs: { navRefPaceSecPerKm?: number } = {}) {
  return scorePerformance(resolveContext(p, lookup), a, config, AS_OF, refs);
}

describe('RunScore (spec 3.5)', () => {
  it('clamps and rounds to 40–99', () => {
    expect(clampScore(76.5, cfg)).toBe(77);
    expect(clampScore(12, cfg)).toBe(40);
    expect(clampScore(140, cfg)).toBe(99);
  });

  it('maps AG% with anchor 0.80 = 99', () => {
    expect(runScoreFromAG(0.8, cfg)).toBe(99); // 99 × 0.80 / 0.80
    expect(runScoreFromAG(0.6, cfg)).toBe(74); // 99 × 0.60 / 0.80 = 74.25 → 74
    expect(runScoreFromAG(0.3, cfg)).toBe(40); // 37.125 → clamp 40
    expect(runScoreFromAG(0.95, cfg)).toBe(99); // 117.6 → clamp 99
  });

  it('worked example: Coach Example (M, 30), Campus Circuit 1.30 km in 4:52', () => {
    // Std(30, M, 1.3) extrapolates below 1 mile along the 1 mile (228 s) – 5 km (769 s) slope:
    //   slope = ln(769/228) / ln(5/1.609344) = 1.072453; Std = 228 × (1.3/1.609344)^1.072453 = 181.35 s
    // AG = 181.35 / 292 = 0.62105; RunScore = 99 × 0.62105 / 0.80 = 76.86 → 77
    const ps = score(perf({ courseId: 'c-circuit', timeSec: 292 }));
    expect(ps.standardSec).toBeCloseTo(181.348, 2);
    expect(ps.ageGrade).toBeCloseTo(0.62105, 4);
    expect(ps.score).toBe(77);
    expect(ps.fresh).toBe(77);
    expect(ps.feeds).toEqual(['SPD']);
    expect(ps.dEff).toBe(1.3);
    expect(ps.age).toBe(30);
    expect(ps.ageEstimated).toBe(true);
    expect(ps.provisional).toBe(false);
    expect(ps.configVersion).toBe(cfg.version);
  });

  it('uses the provisional fallback table when selected, and marks the score provisional', () => {
    const fb = cloneConfig(cfg);
    fb.ageGrade.table = 'fallback_provisional';
    // Std = 769 × (1.3/5)^1.10 / AF(30) = 769 × 0.227233 / 1.000 = 174.74 s
    // 260 s: AG = 0.67208; RunScore = 99 × 0.67208 / 0.80 = 83.17 → 83
    const ps = score(perf({ courseId: 'c-circuit', timeSec: 260 }), athlete(), fb);
    expect(ps.standardSec).toBeCloseTo(174.742, 2);
    expect(ps.score).toBe(83);
    expect(ps.provisional).toBe(true);
  });
});

describe('fixed-benchmark courses (spec 3.6)', () => {
  it('worked example: Ben Sampleton (Y9 boy, 13.5) on a descent with t99OpenM = 180 s', () => {
    // ageAdj = Std(13.5, M, 5) / Std(25, M, 5) = ((817 + 800) / 2) / 769 = 808.5 / 769 = 1.051365
    // Score = 99 × (180 × 1.051365) / 240 = 99 × 189.2457 / 240 = 78.06 → 78
    expect(fixedAgeAdjustment(13.5, 'M', cfg)).toBeCloseTo(808.5 / 769, 9);
    expect(fixedBenchmarkScore(240, 13.5, 'M', 180, cfg)).toBe(78);
    const ps = score(perf({ athleteId: 'a-ben', kind: 'descent', courseId: 'c-desc', date: '2026-09-01', timeSec: 240, cleanRun: true }), ben);
    expect(ps.age).toBe(13.5);
    expect(ps.score).toBe(78);
    expect(ps.feeds).toEqual(['DSC']);
    expect(ps.ageGrade).toBeUndefined();
  });

  it('an open-age athlete has ageAdj 1', () => {
    // Std(30, M, 5) = 769 = Std(25, M, 5) → ageAdj 1; 99 × 180 / 240 = 74.25 → 74
    expect(fixedAgeAdjustment(30, 'M', cfg)).toBe(1);
    expect(fixedBenchmarkScore(240, 30, 'M', 180, cfg)).toBe(74);
  });

  it("is unscored with the Settings message when the course has no benchmark for the athlete's sex", () => {
    const aiko = athlete({ id: 'a-aiko', givenName: 'Aiko', familyName: 'Testfield', preferredName: 'Aiko', sex: 'F', yearGroup: 'Y10' });
    const ps = score(perf({ athleteId: 'a-aiko', kind: 'descent', courseId: 'c-desc', timeSec: 240 }), aiko);
    expect(ps.unscoredReason).toBe("set this course's benchmark in Settings");
    expect(ps.score).toBeUndefined();
    expect(ps.feeds).toEqual([]);
  });

  it('a descent that was not a clean run is stored but never scored', () => {
    const ps = score(perf({ kind: 'descent', courseId: 'c-desc', timeSec: 200, cleanRun: false }));
    expect(ps.unscoredReason).toBe('not a clean run');
    expect(ps.score).toBeUndefined();
  });
});

describe('freshness (spec 3.7)', () => {
  it('3 months: no penalty', () => {
    expect(freshness(80, '2026-07-22', AS_OF, cfg)).toEqual({ fresh: 80, penalty: 0, monthsOld: 3, expired: false });
  });

  it('12 months: (12 − 6) × 1 = 6 points off', () => {
    expect(freshness(80, '2025-10-22', AS_OF, cfg)).toEqual({ fresh: 74, penalty: 6, monthsOld: 12, expired: false });
  });

  it('30 months: expired (excluded from current ratings)', () => {
    const f = freshness(80, '2024-04-22', AS_OF, cfg);
    expect(f.expired).toBe(true);
    expect(f.fresh).toBeUndefined();
    expect(f.monthsOld).toBe(30);
  });

  it('boundaries: 6 months free, 7 months −1, 24 months −18, 25 months expired; never below 40', () => {
    expect(freshness(80, '2026-04-22', AS_OF, cfg).fresh).toBe(80);
    expect(freshness(80, '2026-03-22', AS_OF, cfg).fresh).toBe(79);
    expect(freshness(80, '2024-10-22', AS_OF, cfg).fresh).toBe(62);
    expect(freshness(80, '2024-09-22', AS_OF, cfg).expired).toBe(true);
    expect(freshness(45, '2025-02-22', AS_OF, cfg).fresh).toBe(40); // 20 months: 45 − 14 = 31 → 40
  });

  it('is applied by scorePerformance (bleep results too)', () => {
    // Boys 18+ (Staff, 30): 52 laps = P40 → 40 + 0.59 × 40 = 63.6 → 64; 9 months old → −3 → 61
    const ps = score(perf({ kind: 'bleep', bleepLaps: 52, date: '2026-01-22' }));
    expect(ps.score).toBe(64);
    expect(ps.monthsOld).toBe(9);
    expect(ps.penalty).toBe(3);
    expect(ps.fresh).toBe(61);
  });
});

describe('bleep rating (spec 3.9)', () => {
  // Boys 13: P5 11, P10 18, P20 26, P30 33, P40 39, P50 44, P60 50, P70 56, P80 64, P90 75, P95 84
  it('interpolates between percentile points', () => {
    // 60 laps: 70 + (60 − 56) / (64 − 56) × 10 = P75 → 40 + 0.59 × 75 = 84.25 → 84
    expect(bleepPercentile(60, 'M', 13.5, cfg)).toBe(75);
    expect(bleepRating(60, 'M', 13.5, cfg)).toBe(84);
  });

  it('below P5 interpolates from 0 laps = P0', () => {
    // 5 laps: 5 × 5 / 11 = P2.27 → 40 + 0.59 × 2.27 = 41.34 → 41
    expect(bleepPercentile(5, 'M', 13.5, cfg)).toBeCloseTo(25 / 11, 9);
    expect(bleepRating(5, 'M', 13.5, cfg)).toBe(41);
    expect(bleepRating(0, 'M', 13.5, cfg)).toBe(40);
  });

  it('P95 = 96; above P95 linear to 99 at 1.20 × L_P95; capped at 99', () => {
    expect(bleepRating(84, 'M', 13.5, cfg)).toBe(96); // 40 + 0.59 × 95 = 96.05 → 96
    // 92 laps: 96 + 3 × (92 − 84) / (0.20 × 84 = 16.8) = 97.43 → 97
    expect(bleepRating(92, 'M', 13.5, cfg)).toBe(97);
    // 101 laps: 96 + 3 × 17 / 16.8 = 99.04 → 99 (cap)
    expect(bleepRating(101, 'M', 13.5, cfg)).toBe(99);
    expect(bleepRating(150, 'M', 13.5, cfg)).toBe(99);
    expect(bleepPercentile(150, 'M', 13.5, cfg)).toBe(95);
  });

  it('uses floor(age); under 11 uses 11; 18+ uses 18', () => {
    expect(bleepRating(60, 'M', 13.99, cfg)).toBe(84); // still the age-13 row
    // Boys 11 row at age 10.2: 36 laps = P50 → 40 + 29.5 = 69.5 → 70
    expect(bleepRating(36, 'M', 10.2, cfg)).toBe(70);
    // Boys 18+ at age 45: 60 laps = P50 → 70
    expect(bleepRating(60, 'M', 45, cfg)).toBe(70);
  });

  it('uses the girls table for F', () => {
    // Girls 12: P50 = 28 laps → 70; P95 = 54 → 96
    expect(bleepRating(28, 'F', 12.4, cfg)).toBe(70);
    expect(bleepRating(54, 'F', 12.4, cfg)).toBe(96);
  });
});

describe('NAV score (spec 3.9)', () => {
  it('worked example: refPace 200 s/km, 3.0 km route, 690 s with 1 error', () => {
    // predicted = 3.0 × 200 × 1.15 = 690 s; eff = 690 / (690 + 120 × 1) = 0.85185
    // NAV = 40 + 59 × (0.85185 − 0.5) / 0.5 = 81.52 → 82
    const { predictedSec, eff } = navEfficiency(3.0, 200, 690, 1, cfg);
    expect(predictedSec).toBeCloseTo(690, 9);
    expect(eff).toBeCloseTo(690 / 810, 9);
    expect(navScoreFromEfficiency(eff, 1, cfg)).toBe(82);
  });

  it('eff 1.0 → 99, eff 0.5 → 40, 3+ errors → 40', () => {
    expect(navScoreFromEfficiency(1, 0, cfg)).toBe(99);
    expect(navScoreFromEfficiency(0.5, 0, cfg)).toBe(40);
    expect(navScoreFromEfficiency(1.3, 0, cfg)).toBe(99);
    expect(navScoreFromEfficiency(0.95, 3, cfg)).toBe(40);
  });

  it('scorePerformance needs a reference pace and a route distance', () => {
    const p = perf({ kind: 'nav', timeSec: 690, navErrors: 1, routeKmEff: 3.0 });
    expect(score(p).unscoredReason).toBe(UNSCORED.noRefPace);
    const ps = score(p, athlete(), cfg, { navRefPaceSecPerKm: 200 });
    expect(ps.score).toBe(82);
    expect(ps.dEff).toBe(3);
    expect(ps.provisional).toBe(false);
    expect(score(perf({ kind: 'nav', timeSec: 690 }), athlete(), cfg, { navRefPaceSecPerKm: 200 }).unscoredReason).toBe(UNSCORED.noRoute);
  });
});

describe('ARM per test', () => {
  it('scores a test that measured all three domains', () => {
    // ankle 11 cm → L3; calf 18 → L2; stork 22 s → L3 (hop-and-stick only matters at L4)
    // ARM = round(40 + (8 − 3) × 59 / 12) = round(64.58) = 65
    const ps = score(perf({ kind: 'arm', arm: { ankleCm: 11, calfReps: 18, storkSec: 22, hopStickBothLegs: true } }));
    expect(ps.score).toBe(65);
    expect(ps.penalty).toBe(0);
    expect(ps.feeds).toEqual(['ARM']);
    expect(ps.provisional).toBe(false);
  });

  it('formula ends: all L1 → 40, all L5 → 99, all L3 → 69.5 → 70', () => {
    // 40 + (3 − 3) × 59 / 12 = 40; 40 + (15 − 3) × 59 / 12 = 99; 40 + (9 − 3) × 59 / 12 = 69.5 → 70
    expect(armScoreClamped({ ankle: 1, calf: 1, balance: 1 }, cfg)).toBe(40);
    expect(armScoreClamped({ ankle: 5, calf: 5, balance: 5 }, cfg)).toBe(99);
    expect(armScoreClamped({ ankle: 3, calf: 3, balance: 3 }, cfg)).toBe(70);
    expect(armComplete({ ankle: 1, calf: 1, balance: 1 })).toBe(true);
    expect(armComplete({ ankle: 0, calf: 1, balance: 1 })).toBe(false);
    expect(armComplete({ calf: 1, balance: 1 })).toBe(false);
  });

  it('the 40 and 59 come from the 40–99 scale in config', () => {
    // runScore.min 30, max 99: 30 + (9 − 3) × 69 / 12 = 64.5 → 65
    const c = cloneConfig(cfg);
    c.runScore.min = 30;
    expect(armScoreClamped({ ankle: 3, calf: 3, balance: 3 }, c)).toBe(65);
  });

  it('a test with a domain below level 1 has no ARM score (levels run 1–5; nothing is manufactured)', () => {
    // ankle 4 cm → below L1 (5 cm), calf 18 → L2, stork 22 → L3
    const ps = score(perf({ kind: 'arm', arm: { ankleCm: 4, calfReps: 18, storkSec: 22 } }));
    expect(ps.score).toBeUndefined();
    expect(ps.fresh).toBeUndefined();
    expect(ps.feeds).toEqual(['ARM']);
    expect(ps.unscoredReason).toBeUndefined();
  });

  it('a partial test counts toward ARM but has no score of its own', () => {
    const ps = score(perf({ kind: 'arm', arm: { ankleCm: 11 } }));
    expect(ps.score).toBeUndefined();
    expect(ps.unscoredReason).toBeUndefined();
    expect(ps.feeds).toEqual(['ARM']);
    expect(score(perf({ kind: 'arm', arm: {} })).unscoredReason).toBe(UNSCORED.noArm);
  });
});

describe('which performances are scored', () => {
  it('unverified, deleted and future results are listed but unscored', () => {
    const base = { courseId: 'c-circuit', timeSec: 292 };
    expect(score(perf({ ...base, verified: false })).unscoredReason).toBe('unverified');
    expect(score(perf({ ...base, deleted: true })).unscoredReason).toBe('deleted');
    expect(score(perf({ ...base, date: '2026-10-23' })).unscoredReason).toBe('after the as-of date');
    expect(score(perf({ ...base, verified: false })).score).toBeUndefined();
  });

  it('a race needs a time and a distance', () => {
    expect(score(perf({ kind: 'race', distanceKm: 5 })).unscoredReason).toBe(UNSCORED.noTime);
    expect(score(perf({ kind: 'race', timeSec: 1190 })).unscoredReason).toBe(UNSCORED.noDistance);
  });

  it('races feed RACE, and END too when D_eff ≥ 5 km', () => {
    const ctx = (p: Performance) => resolveContext(p, lookup);
    expect(perfFeeds(ctx(perf({ kind: 'race', distanceKm: 4 })), cfg)).toEqual(['RACE']);
    expect(perfFeeds(ctx(perf({ kind: 'parkrun', distanceKm: 5 })), cfg)).toEqual(['RACE', 'END']);
    // 4 km + 100 m climb: D_eff = 4 + 100/100 = 5.0 km
    expect(perfFeeds(ctx(perf({ kind: 'relay_leg', distanceKm: 4, climbM: 100 })), cfg)).toEqual(['RACE', 'END']);
    expect(perfFeeds(ctx(perf({ kind: 'long_run', distanceKm: 4 })), cfg)).toEqual([]);
    expect(perfFeeds(ctx(perf({ kind: 'long_run', distanceKm: 12 })), cfg)).toEqual(['END']);
    const noLong = cloneConfig(cfg);
    noLong.end.allowLongRuns = false;
    expect(perfFeeds(ctx(perf({ kind: 'race', distanceKm: 10 })), noLong)).toEqual(['RACE']);
  });

  it('worked example: 10 km race, Coach Example in 42:00', () => {
    // Std(30, M, 10) = 1584 s; AG = 1584 / 2520 = 0.62857; 99 × 0.62857 / 0.80 = 77.79 → 78
    const ps = score(perf({ kind: 'race', distanceKm: 10, timeSec: 2520 }));
    expect(ps.score).toBe(78);
    expect(ps.feeds).toEqual(['RACE', 'END']);
  });
});

describe('ARM levels per domain (spec 3.9 thresholds, weaker side)', () => {
  const lv = (arm: Parameters<typeof armLevelsFromTest>[0]) => armLevelsFromTest(arm, cfg);

  it('ankle (knee-to-wall cm): L1 ≥ 5, L2 ≥ 8, L3 ≥ 10, L4 ≥ 12, L5 ≥ 14; below 5 = no level (0)', () => {
    expect([4.9, 5, 7.9, 8, 9.9, 10, 11.9, 12, 13.9, 14, 20].map((ankleCm) => lv({ ankleCm }).ankle)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });

  it('calf (single-leg heel raises): L1 ≥ 10, L2 ≥ 15, L3 ≥ 20, L4 ≥ 25, L5 ≥ 30', () => {
    expect([9, 10, 14, 15, 19, 20, 24, 25, 29, 30, 50].map((calfReps) => lv({ calfReps }).calf)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });

  it('balance (eyes-closed stance s): L1 ≥ 5, L2 ≥ 10, L3 ≥ 20, L4 ≥ 30; L5 = L4 and hop-and-stick on both legs', () => {
    expect([4, 5, 9, 10, 19, 20, 29.9, 30, 60].map((storkSec) => lv({ storkSec }).balance)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
    expect(lv({ storkSec: 30, hopStickBothLegs: true }).balance).toBe(5);
    expect(lv({ storkSec: 29, hopStickBothLegs: true }).balance).toBe(3); // hop-and-stick only lifts L4 to L5
    expect(lv({ storkSec: 45, hopStickBothLegs: false }).balance).toBe(4);
    expect(lv({ storkSec: 45 }).balance).toBe(4);
    expect(lv({ hopStickBothLegs: true })).toEqual({}); // no stance time: balance not measured
  });

  it('only the measured domains appear', () => {
    expect(lv({ ankleCm: 11 })).toEqual({ ankle: 3 });
    expect(lv(undefined)).toEqual({});
  });
});

describe('scoring edge cases', () => {
  const climbCourse: Course = { id: 'c-climb', name: 'Test Hill Climb', kind: 'climb', distanceKm: 5, climbM: 100, terrainFactor: 1, benchmarkMode: 'age_grade', version: 1 };
  const descAg: Course = { id: 'c-desc-ag', name: 'Test Gully (age-graded)', kind: 'descent', distanceKm: 1, climbM: 0, terrainFactor: 1, benchmarkMode: 'age_grade', version: 1 };
  const climbFixed: Course = { id: 'c-climb-fixed', name: 'Test Steps', kind: 'climb', distanceKm: 1, climbM: 200, terrainFactor: 1, benchmarkMode: 'fixed', t99OpenM: 600, version: 1 };
  const girlsDesc: Course = { id: 'c-desc-f', name: 'Test Scree', kind: 'descent', distanceKm: 1, climbM: 0, terrainFactor: 1, benchmarkMode: 'fixed', t99OpenM: 180, t99OpenF: 200, version: 1 };
  const lk = makeLookup([circuit, slope, climbCourse, descAg, climbFixed, girlsDesc], []);
  const sc = (p: Performance, a: Athlete = athlete(), config: Config = cfg) => scorePerformance(resolveContext(p, lk), a, config, AS_OF);

  it('a terrain factor of 0 or a large negative climb leaves no distance: unscored, never a crash', () => {
    expect(sc(perf({ kind: 'race', distanceKm: 5, terrainFactor: 0, timeSec: 1200 })).unscoredReason).toBe(UNSCORED.noDistance);
    // D_eff = 1 + (−200 / 100) = −1 km
    expect(sc(perf({ kind: 'race', distanceKm: 1, climbM: -200, timeSec: 300 })).unscoredReason).toBe(UNSCORED.noDistance);
  });

  it("the performance's terrain factor overrides the course's", () => {
    // D_eff = (5 + 100 / 100) × 1.2 = 7.2 km
    const ps = sc(perf({ kind: 'climb', courseId: 'c-climb', terrainFactor: 1.2, timeSec: 1800 }));
    expect(ps.dEff).toBeCloseTo(7.2, 9);
    expect(ps.standardSec).toBeCloseTo(standardTime(30, 'M', 7.2, cfg), 9);
    expect(ps.score).toBe(runScoreFromAG(standardTime(30, 'M', 7.2, cfg) / 1800, cfg));
  });

  it('a climb course in fixed mode uses its benchmark', () => {
    // Coach (30): ageAdj 1; 99 × 600 / 660 = 90 → 90
    expect(sc(perf({ kind: 'climb', courseId: 'c-climb-fixed', timeSec: 660 })).score).toBe(90);
  });

  it('a descent with cleanRun not recorded is scored (only cleanRun = false is never scored)', () => {
    // 99 × 180 / 240 = 74.25 → 74
    expect(sc(perf({ kind: 'descent', courseId: 'c-desc', timeSec: 240 })).score).toBe(74);
  });

  it('a descent course the coach set to age_grade is age-graded; a descent with no course cannot be scored', () => {
    const ps = sc(perf({ kind: 'descent', courseId: 'c-desc-ag', timeSec: 200, cleanRun: true }));
    expect(ps.standardSec).toBeCloseTo(standardTime(30, 'M', 1, cfg), 9);
    expect(ps.score).toBe(runScoreFromAG(standardTime(30, 'M', 1, cfg) / 200, cfg));
    expect(sc(perf({ kind: 'descent', distanceKm: 1, timeSec: 200 })).unscoredReason).toBe(UNSCORED.noCourse);
  });

  it("worked example: girls' fixed benchmark, Hana Mockridge (Y9 girl, 13.5 on 1 Sept 2026)", () => {
    // ageAdj = Std(13.5, F, 5) / Std(25, F, 5) = ((922 + 902) / 2) / 834 = 912 / 834 = 1.093525
    // Score = 99 × (200 × 1.093525) / 250 = 86.61 → 87
    const hana = athlete({ id: 'a-hana', givenName: 'Hana', familyName: 'Mockridge', preferredName: 'Hana', sex: 'F', yearGroup: 'Y9', yearGroupYear: 2026 });
    expect(fixedAgeAdjustment(13.5, 'F', cfg)).toBeCloseTo(912 / 834, 9);
    const ps = sc(perf({ athleteId: 'a-hana', kind: 'descent', courseId: 'c-desc-f', timeSec: 250, date: '2026-09-01' }), hana);
    expect(ps.age).toBe(13.5);
    expect(ps.score).toBe(87);
  });

  it('fixed-benchmark scores rest on the age table, so the fallback table marks them provisional', () => {
    const fb = cloneConfig(cfg);
    fb.ageGrade.table = 'fallback_provisional';
    // Fallback ageAdj(14, M) = AF(25) / AF(14) = 1 / 0.94
    expect(fixedAgeAdjustment(14, 'M', fb)).toBeCloseTo(1 / 0.94, 9);
    expect(sc(perf({ kind: 'descent', courseId: 'c-desc', timeSec: 240 }), athlete(), fb).provisional).toBe(true);
    expect(sc(perf({ kind: 'descent', courseId: 'c-desc', timeSec: 240 })).provisional).toBe(false);
  });

  it('END pathway boundary: D_eff exactly 5.0 km (4.5 km + 50 m) counts', () => {
    expect(perfFeeds(resolveContext(perf({ kind: 'long_run', distanceKm: 4.5, climbM: 50 }), lk), cfg)).toEqual(['END']);
    expect(perfFeeds(resolveContext(perf({ kind: 'long_run', distanceKm: 4.5, climbM: 49 }), lk), cfg)).toEqual([]);
  });

  it('an unverified ARM test is unscored and feeds nothing', () => {
    const ps = sc(perf({ kind: 'arm', verified: false, arm: { ankleCm: 14, calfReps: 30, storkSec: 30, hopStickBothLegs: true } }));
    expect(ps).toMatchObject({ unscoredReason: 'unverified', feeds: [] });
    expect(ps.score).toBeUndefined();
  });
});

describe('freshness boundaries (whole calendar months)', () => {
  it('6 months 29 days old is still 6 whole months: no penalty', () => {
    // 2026-03-23 → 2026-10-22: 7 calendar months, but the 22nd is before the 23rd → 6 whole months
    expect(freshness(80, '2026-03-23', AS_OF, cfg)).toEqual({ fresh: 80, penalty: 0, monthsOld: 6, expired: false });
  });

  it('24 months 29 days old still counts (−18); 25 whole months is expired', () => {
    expect(freshness(80, '2024-09-23', AS_OF, cfg)).toEqual({ fresh: 62, penalty: 18, monthsOld: 24, expired: false });
    expect(freshness(80, '2024-09-22', AS_OF, cfg)).toMatchObject({ monthsOld: 25, expired: true });
  });

  it('every constant comes from config', () => {
    // grace 3, 2 points a month, expire after 12: 9 months → (9 − 3) × 2 = 12 → 68; 13 months → expired
    const c = cloneConfig(cfg);
    c.freshness = { decayGraceMonths: 3, decayPointsPerMonth: 2, expireMonths: 12 };
    expect(freshness(80, '2026-01-22', AS_OF, c)).toEqual({ fresh: 68, penalty: 12, monthsOld: 9, expired: false });
    expect(freshness(80, '2025-09-22', AS_OF, c).expired).toBe(true);
  });

  it('a 99 decays to 99 − penalty, and a 40 stays 40', () => {
    expect(freshness(99, '2025-04-22', AS_OF, cfg).fresh).toBe(87); // 18 months: 99 − 12
    expect(freshness(40, '2025-04-22', AS_OF, cfg).fresh).toBe(40);
  });
});

describe('bleep rating: more boundaries', () => {
  it('above P95 reaches exactly 99 at 1.20 × L_P95 (Boys 13: 1.2 × 84 = 100.8 laps)', () => {
    expect(bleepRating(100.8, 'M', 13.5, cfg)).toBe(99); // 96 + 3 × 16.8 / 16.8 = 99
    expect(bleepRating(97, 'M', 13.5, cfg)).toBe(98); // 96 + 3 × 13 / 16.8 = 98.32 → 98
    expect(bleepRating(85, 'M', 13.5, cfg)).toBe(96); // 96 + 3 × 1 / 16.8 = 96.18 → 96
  });

  it('just below P95 stays under the cap', () => {
    // Boys 13: 83 laps = 90 + (83 − 75) / (84 − 75) × 5 = P94.44 → 40 + 0.59 × 94.44 = 95.72 → 96
    expect(bleepPercentile(83, 'M', 13.5, cfg)).toBeCloseTo(90 + (8 / 9) * 5, 9);
    expect(bleepRating(83, 'M', 13.5, cfg)).toBe(96);
    // 80 laps = P92.78 → 94.74 → 95
    expect(bleepRating(80, 'M', 13.5, cfg)).toBe(95);
  });

  it('girls above P95 (Girls 13, L_P95 = 56): 60 laps → 96 + 3 × 4 / 11.2 = 97.07 → 97', () => {
    expect(bleepRating(60, 'F', 13.2, cfg)).toBe(97);
  });

  it('girls under 11 use the Girls 11 row; 18+ (staff) use Girls 18+', () => {
    expect(bleepRating(28, 'F', 10.5, cfg)).toBe(70); // Girls 11 P50 = 28 → 40 + 29.5 = 69.5 → 70
    expect(bleepRating(30, 'F', 40, cfg)).toBe(70); // Girls 18+ P50 = 30
  });

  it('floor(age): 11.0 uses 11, 17.99 uses 17, 18.0 uses 18', () => {
    // Boys 17 P50 = 57; Boys 18+: P40 52, P50 60 → 57 laps = 40 + 5 / 8 × 10 = P46.25
    expect(bleepPercentile(57, 'M', 17.99, cfg)).toBe(50);
    expect(bleepPercentile(57, 'M', 18, cfg)).toBeCloseTo(46.25, 9);
    expect(bleepPercentile(36, 'M', 11, cfg)).toBe(50);
  });

  it('exact table points: Boys 18+ P5 = 17 → 42.95 → 43; P90 = 99 → 93.1 → 93', () => {
    expect(bleepRating(17, 'M', 30, cfg)).toBe(43);
    expect(bleepRating(99, 'M', 30, cfg)).toBe(93);
  });

  it('negative or missing laps are unscored; 0 laps is a real result (40)', () => {
    expect(score(perf({ kind: 'bleep', bleepLaps: -1 })).unscoredReason).toBe(UNSCORED.noLaps);
    expect(score(perf({ kind: 'bleep' })).unscoredReason).toBe(UNSCORED.noLaps);
    expect(score(perf({ kind: 'bleep', bleepLaps: 0 })).score).toBe(40);
  });
});

describe('NAV score: more boundaries', () => {
  it('2 errors: eff = 690 / (690 + 240) = 0.74194 → 40 + 59 × 0.24194 / 0.5 = 68.55 → 69', () => {
    const { eff } = navEfficiency(3.0, 200, 690, 2, cfg);
    expect(eff).toBeCloseTo(690 / 930, 9);
    expect(navScoreFromEfficiency(eff, 2, cfg)).toBe(69);
  });

  it('efficiency below 0.5 clamps to 40', () => {
    // 690 / 1500 = 0.46 → 40 + 59 × (−0.04) / 0.5 = 35.28 → 40
    expect(navScoreFromEfficiency(690 / 1500, 0, cfg)).toBe(40);
  });

  it('maxErrors and the penalty come from config', () => {
    const c = cloneConfig(cfg);
    c.nav.maxErrors = 5;
    c.nav.penaltySecPerError = 60;
    // 3 errors no longer auto-40: eff = 690 / (690 + 180) = 0.7931 → 40 + 59 × 0.2931 / 0.5 = 74.59 → 75
    expect(navScoreFromEfficiency(navEfficiency(3, 200, 690, 3, c).eff, 3, c)).toBe(75);
    expect(navScoreFromEfficiency(0.99, 5, c)).toBe(40);
  });

  it('NAV results decay like any other: 82, 9 months old → 79', () => {
    const ps = score(perf({ kind: 'nav', timeSec: 690, navErrors: 1, routeKmEff: 3, date: '2026-01-22' }), athlete(), cfg, { navRefPaceSecPerKm: 200 });
    expect(ps).toMatchObject({ score: 82, penalty: 3, fresh: 79 });
  });

  it('3 errors score 40 and a decayed 40 stays 40', () => {
    const ps = score(perf({ kind: 'nav', timeSec: 600, navErrors: 3, routeKmEff: 3, date: '2025-10-22' }), athlete(), cfg, { navRefPaceSecPerKm: 200 });
    expect(ps).toMatchObject({ score: 40, fresh: 40 });
  });
});

describe('bad inputs never crash and never manufacture a number', () => {
  it('a time that is not a finite number is "no time" (Infinity used to score 40)', () => {
    // Before the fix: AG = Std / Infinity = 0 → clamp → 40, a number made up from a broken time.
    expect(score(perf({ courseId: 'c-circuit', timeSec: Infinity })).unscoredReason).toBe(UNSCORED.noTime);
    expect(score(perf({ courseId: 'c-circuit', timeSec: Number.NaN })).unscoredReason).toBe(UNSCORED.noTime);
    expect(score(perf({ kind: 'descent', courseId: 'c-desc', timeSec: Infinity })).unscoredReason).toBe(UNSCORED.noTime);
    expect(score(perf({ kind: 'nav', timeSec: Infinity, routeKmEff: 3 }), athlete(), cfg, { navRefPaceSecPerKm: 200 }).unscoredReason).toBe(UNSCORED.noTime);
  });

  it('bleep laps that are not a finite number are "no laps" (Infinity used to score 99)', () => {
    expect(score(perf({ kind: 'bleep', bleepLaps: Infinity })).unscoredReason).toBe(UNSCORED.noLaps);
    expect(score(perf({ kind: 'bleep', bleepLaps: Number.NaN })).unscoredReason).toBe(UNSCORED.noLaps);
  });

  it('a negative, fractional or broken NAV error count is rejected (−2 errors used to lift NAV to 99)', () => {
    // Before the fix: eff = 690 / (690 + 120 × −2) = 690 / 450 = 1.53 → 99.
    const nav = (navErrors: number) => score(perf({ kind: 'nav', timeSec: 690, navErrors, routeKmEff: 3 }), athlete(), cfg, { navRefPaceSecPerKm: 200 });
    expect(nav(-2).unscoredReason).toBe(UNSCORED.badNavErrors);
    expect(nav(1.5).unscoredReason).toBe(UNSCORED.badNavErrors);
    expect(nav(Number.NaN).unscoredReason).toBe(UNSCORED.badNavErrors);
    expect(nav(-2).score).toBeUndefined();
    // A blank count is no errors: eff = 690 / 690 = 1.0 → 99; 0 errors gives the same.
    expect(score(perf({ kind: 'nav', timeSec: 690, routeKmEff: 3 }), athlete(), cfg, { navRefPaceSecPerKm: 200 }).score).toBe(99);
    expect(nav(0).score).toBe(99);
  });

  it('an infinite route or reference pace is not a route or a pace (both used to score 99)', () => {
    expect(score(perf({ kind: 'nav', timeSec: 690, navErrors: 0, routeKmEff: Infinity }), athlete(), cfg, { navRefPaceSecPerKm: 200 }).unscoredReason).toBe(UNSCORED.noRoute);
    expect(score(perf({ kind: 'nav', timeSec: 690, navErrors: 0, routeKmEff: 3 }), athlete(), cfg, { navRefPaceSecPerKm: Infinity }).unscoredReason).toBe(UNSCORED.noRefPace);
  });

  it('a course benchmark that is not a finite number counts as not set', () => {
    const lk = makeLookup([{ ...slope, id: 'c-inf', t99OpenM: Infinity }], []);
    const ps = scorePerformance(resolveContext(perf({ kind: 'descent', courseId: 'c-inf', timeSec: 240 }), lk), athlete(), cfg, AS_OF);
    expect(ps.unscoredReason).toBe(UNSCORED.benchmark);
  });

  it('a result without a valid date is unscored (it used to give a NaN FreshScore)', () => {
    for (const date of ['', 'n/a', '2026-02-30']) {
      const ps = score(perf({ courseId: 'c-circuit', timeSec: 292, date }));
      expect(ps.unscoredReason).toBe(UNSCORED.noDate);
      expect(ps.score).toBeUndefined();
      expect(ps.fresh).toBeUndefined();
    }
  });

  it('an unknown result kind (e.g. from a newer backup) feeds nothing and is unscored', () => {
    const p = perf({ kind: 'session' as never, distanceKm: 5, timeSec: 1200 });
    expect(perfFeeds(resolveContext(p, lookup), cfg)).toEqual([]);
    expect(score(p)).toMatchObject({ unscoredReason: UNSCORED.unknownKind, feeds: [] });
  });

  it('an unknown age (year group not recognised) or sex leaves age-dependent results unscored', () => {
    // Before the fix both of these threw inside the standards table and took every rating down with them.
    const noYear = athlete({ yearGroup: 'Y6' as never });
    const noSex = athlete({ sex: 'X' as never });
    for (const a of [noYear, noSex]) {
      expect(score(perf({ courseId: 'c-circuit', timeSec: 292 }), a).unscoredReason).toBe(UNSCORED.noAge);
      expect(score(perf({ kind: 'bleep', bleepLaps: 52 }), a).unscoredReason).toBe(UNSCORED.noAge);
      expect(score(perf({ kind: 'descent', courseId: 'c-desc', timeSec: 240 }), a).unscoredReason).toBe(UNSCORED.noAge);
      // ARM and NAV do not depend on age or sex, so they are still scored.
      expect(score(perf({ kind: 'arm', arm: { ankleCm: 11, calfReps: 18, storkSec: 22 } }), a).score).toBe(65);
      expect(score(perf({ kind: 'nav', timeSec: 690, navErrors: 1, routeKmEff: 3 }), a, cfg, { navRefPaceSecPerKm: 200 }).score).toBe(82);
    }
  });

  it('a date of birth that is not a real date is ignored and the age is estimated (it used to crash)', () => {
    // Ben (Y9, 2026–27) with dob '12/03/2012': estimate 13.5 on 1 Sept 2026, as if there were no dob.
    const p = perf({ athleteId: 'a-ben', kind: 'descent', courseId: 'c-desc', date: '2026-09-01', timeSec: 240, cleanRun: true });
    const ps = score(p, { ...ben, dob: '12/03/2012' });
    expect(ps).toMatchObject({ age: 13.5, ageEstimated: true, score: 78 });
  });
});

describe('every scoring constant comes from config', () => {
  it('anchorAG: with 0.75, AG 0.75 → 99 and AG 0.60 → 99 × 0.60 / 0.75 = 79.2 → 79', () => {
    const c = cloneConfig(cfg);
    c.runScore.anchorAG = 0.75;
    expect(runScoreFromAG(0.75, c)).toBe(99);
    expect(runScoreFromAG(0.6, c)).toBe(79);
  });

  it('bleep base, slope, P95 cap and top multiplier', () => {
    // Boys 13, 60 laps = P75. Base 30, slope 0.6: 30 + 0.6 × 75 = 75.
    const c = cloneConfig(cfg);
    c.end.bleepBase = 30;
    c.end.bleepSlope = 0.6;
    expect(bleepRating(60, 'M', 13.5, c)).toBe(75);
    // Top multiplier 1.5: 96 + 3 × (92 − 84) / (0.5 × 84 = 42) = 96.57 → 97; 110 laps → 96 + 3 × 26 / 42 = 97.86 → 98
    const d = cloneConfig(cfg);
    d.end.bleepTopMultiplier = 1.5;
    expect(bleepRating(92, 'M', 13.5, d)).toBe(97);
    expect(bleepRating(110, 'M', 13.5, d)).toBe(98);
    expect(bleepRating(126, 'M', 13.5, d)).toBe(99); // 1.5 × 84
  });

  it('bleep table rows come from config (a coach-corrected row is used at once)', () => {
    const c = cloneConfig(cfg);
    c.end.bleepTable.M[13] = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110];
    // 65 laps: P50 60 → P60 70: 50 + 5 / 10 × 10 = P55 → 40 + 0.59 × 55 = 72.45 → 72
    expect(bleepPercentile(65, 'M', 13.5, c)).toBe(55);
    expect(bleepRating(65, 'M', 13.5, c)).toBe(72);
  });

  it('NAV allowance and penalty: allowance 1.30 → predicted = 3 × 200 × 1.3 = 780', () => {
    // eff = 780 / (690 + 120) = 0.96296 → 40 + 59 × 0.46296 / 0.5 = 94.63 → 95
    const c = cloneConfig(cfg);
    c.nav.allowance = 1.3;
    const { predictedSec, eff } = navEfficiency(3, 200, 690, 1, c);
    expect(predictedSec).toBeCloseTo(780, 9);
    expect(eff).toBeCloseTo(780 / 810, 9);
    expect(navScoreFromEfficiency(eff, 1, c)).toBe(95);
  });

  it('fixed-benchmark reference age: fallback table, reference age 35 → a 30-year-old gets ageAdj AF(35) / AF(30) = 0.985', () => {
    const c = cloneConfig(cfg);
    c.ageGrade.table = 'fallback_provisional';
    c.age.fixedReferenceAge = 35;
    // ageAdj = (769 / 1.000) / (769 / 0.985) = 0.985; Score = 99 × 180 × 0.985 / 240 = 73.13 → 73
    expect(fixedAgeAdjustment(30, 'M', c)).toBeCloseTo(0.985, 9);
    expect(fixedBenchmarkScore(240, 30, 'M', 180, c)).toBe(73);
  });

  it('END long-run threshold: at 10 km effort a 5 km parkrun no longer feeds END', () => {
    const c = cloneConfig(cfg);
    c.end.longRunMinKmEff = 10;
    const ctx = (p: Performance) => resolveContext(p, lookup);
    expect(perfFeeds(ctx(perf({ kind: 'parkrun', distanceKm: 5 })), c)).toEqual(['RACE']);
    expect(perfFeeds(ctx(perf({ kind: 'race', distanceKm: 10 })), c)).toEqual(['RACE', 'END']);
  });

  it('ARM thresholds: raising ankle L1 to 6 cm turns a 5 cm reading into level 0', () => {
    const c = cloneConfig(cfg);
    c.arm.ankleCm = [6, 8, 10, 12, 14];
    expect(armLevelsFromTest({ ankleCm: 5 }, c).ankle).toBe(0);
    expect(armLevelsFromTest({ ankleCm: 6 }, c).ankle).toBe(1);
    expect(score(perf({ kind: 'arm', arm: { ankleCm: 5, calfReps: 18, storkSec: 22 } }), athlete(), c).score).toBeUndefined();
  });
});

describe('RunScore and freshness: more worked examples', () => {
  it('worked example: Hana Mockridge (F, Y11 on 1 Sept 2026 = 15.5), 5 km parkrun in 22:00', () => {
    // Std(15.5, F, 5) = (F15 + F16) / 2 at 5 km, read from the table; RunScore = 99 × (Std / 1320) / 0.80
    const hana = athlete({ id: 'a-hana', sex: 'F', yearGroup: 'Y11', yearGroupYear: 2026 });
    const std = (standardTime(15, 'F', 5, cfg) + standardTime(16, 'F', 5, cfg)) / 2;
    const ps = score(perf({ athleteId: 'a-hana', kind: 'parkrun', distanceKm: 5, timeSec: 1320, date: '2026-09-01' }), hana);
    expect(ps.age).toBe(15.5);
    expect(ps.standardSec).toBeCloseTo(std, 9);
    expect(ps.score).toBe(Math.round((99 * std) / 1320 / 0.8));
    expect(ps.feeds).toEqual(['RACE', 'END']);
  });

  it('RunScore floor and ceiling: AG 0.3232 → 39.99 → 40; AG 0.80 → 99; AG 0.7959 → 98.49 → 98', () => {
    expect(runScoreFromAG(0.3232, cfg)).toBe(40);
    expect(runScoreFromAG(0.8, cfg)).toBe(99);
    expect(runScoreFromAG(0.7959, cfg)).toBe(98);
  });

  it('freshness: 13 months → −7; 23 months → −17; a 41 at 23 months stays at 40', () => {
    expect(freshness(80, '2025-09-22', AS_OF, cfg)).toEqual({ fresh: 73, penalty: 7, monthsOld: 13, expired: false });
    expect(freshness(80, '2024-11-22', AS_OF, cfg)).toEqual({ fresh: 63, penalty: 17, monthsOld: 23, expired: false });
    expect(freshness(41, '2024-11-22', AS_OF, cfg).fresh).toBe(40);
  });

  it('a result dated on the as-of date is 0 months old and counts', () => {
    const ps = score(perf({ courseId: 'c-circuit', timeSec: 292, date: AS_OF }));
    expect(ps).toMatchObject({ score: 77, fresh: 77, monthsOld: 0, penalty: 0, expired: false });
  });

  it('expired results keep their unpenalised score for the Career Vault', () => {
    // 30 months: the penalty (30 − 6) × 1 = 24 is reported, but there is no FreshScore
    const ps = score(perf({ courseId: 'c-circuit', timeSec: 292, date: '2024-04-22' }));
    expect(ps).toMatchObject({ score: 77, penalty: 24, monthsOld: 30, expired: true, feeds: ['SPD'] });
    expect(ps.fresh).toBeUndefined();
  });
});
