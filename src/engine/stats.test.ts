import { describe, expect, it } from 'vitest';
import type { Athlete, Course, Performance, TasukiEvent } from '../types';
import { DEFAULT_CONFIG, cloneConfig, type Config } from './config';
import { makeLookup } from './perf';
import type { OvrValue, RaceStat } from './types';
import { STAT_KEYS } from './types';
import { computeAthleteRatings, navReferencePace, tierFor } from './stats';

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

const coach = athlete();
/** Y9 boy, year group for 2026–27: on 2026-09-01 his estimated age is 13 + 0.5 + 0 = 13.5. */
const ben = athlete({ id: 'a-ben', givenName: 'Ben', familyName: 'Sampleton', preferredName: 'Ben', yearGroup: 'Y9', yearGroupYear: 2026 });
const hana = athlete({ id: 'a-hana', givenName: 'Hana', familyName: 'Mockridge', preferredName: 'Hana', sex: 'F', yearGroup: 'Y11', yearGroupYear: 2026 });

let n = 0;
function perf(over: Partial<Performance>): Performance {
  n += 1;
  return { id: `p${n}`, athleteId: 'a-coach', date: '2026-10-01', kind: 'circuit', verified: true, source: 'coach', rawInput: '', history: [], ...over };
}

const courses: Course[] = [
  { id: 'c-circuit', name: 'Campus Circuit', kind: 'circuit', distanceKm: 1.3, climbM: 0, terrainFactor: 1, benchmarkMode: 'age_grade', version: 1 },
  { id: 'c-climb', name: 'Test Hill Climb', kind: 'climb', distanceKm: 5, climbM: 100, terrainFactor: 1, benchmarkMode: 'age_grade', version: 1 },
  { id: 'c-desc', name: 'Test Slope Descent', kind: 'descent', distanceKm: 1, climbM: 0, terrainFactor: 1, benchmarkMode: 'fixed', t99OpenM: 180, version: 1 },
  { id: 'c-desc-unset', name: 'New Descent', kind: 'descent', distanceKm: 1, climbM: 0, terrainFactor: 1, benchmarkMode: 'fixed', version: 1 },
  { id: 'c-nav', name: 'Forest Nav', kind: 'nav', distanceKm: 3, climbM: 0, terrainFactor: 1, benchmarkMode: 'age_grade', version: 1 },
  { id: 'c-race-fixed', name: 'Test Ridge Course', kind: 'race_course', distanceKm: 6, climbM: 300, terrainFactor: 1, benchmarkMode: 'fixed', t99OpenM: 1500, version: 1 },
];
const events: TasukiEvent[] = [
  { id: 'e-xc', name: 'Test Valley XC', date: '2026-09-20', kind: 'race', distanceKm: 5, official: true },
  { id: 'e-ridge', name: 'Test Ridge Race', date: '2026-09-27', kind: 'race', courseId: 'c-race-fixed', official: true },
];
const lookup = makeLookup(courses, events);

function rate(a: Athlete, perfs: Performance[], opts: { config?: Config; asOf?: string; streak?: boolean } = {}) {
  return computeAthleteRatings({ athlete: a, perfs, lookup, config: opts.config ?? cfg, asOf: opts.asOf ?? AS_OF, streakActiveOrFrozen: opts.streak ?? false });
}

const words = (s: string | undefined) => (s ?? '').trim().split(/\s+/).filter(Boolean).length;

describe('SPD', () => {
  it('worked example: Campus Circuit 1.30 km in 4:52 → 77', () => {
    // Std(30, M, 1.3) = 228 × (1.3/1.609344)^1.072453 = 181.35 s (extrapolated below 1 mile)
    // AG = 181.35 / 292 = 0.62105; RunScore = 99 × 0.62105 / 0.80 = 76.86 → 77
    const r = rate(coach, [perf({ id: 'spd1', courseId: 'c-circuit', timeSec: 292, date: '2026-10-04' })]);
    expect(r.stats.SPD).toMatchObject({ locked: false, value: 77, current: 77, shielded: false, provisional: false });
    expect(r.stats.SPD.basis).toEqual({ perfIds: ['spd1'], date: '2026-10-04', label: 'from Campus Circuit, 4 Oct' });
  });

  it('takes the best FreshScore of several runs', () => {
    // 260 s: 99 × (181.35 / 260) / 0.80 = 86.31 → 86; 300 s: 74.81 → 75
    const r = rate(coach, [perf({ courseId: 'c-circuit', timeSec: 300 }), perf({ courseId: 'c-circuit', timeSec: 260, date: '2026-09-15' })]);
    expect(r.stats.SPD.value).toBe(86);
  });
});

describe('END', () => {
  it('worked example via bleep: Ben Sampleton (Y9, 13.5), 60 laps → 84', () => {
    // floor(13.5) = 13 → Boys 13 row; 60 laps between P70 (56) and P80 (64): P = 70 + 4/8 × 10 = 75
    // rating = 40 + 0.59 × 75 = 84.25 → 84; 1 month old → no penalty
    const r = rate(ben, [perf({ id: 'b1', athleteId: 'a-ben', kind: 'bleep', bleepLaps: 60, date: '2026-09-01' })]);
    expect(r.stats.END).toMatchObject({ locked: false, value: 84, provisional: true });
    expect(r.stats.END.basis?.label).toBe('from bleep test, 1 Sep');
    expect(r.provisionalAny).toBe(true);
  });

  it('worked example via long run: 10 km race in 42:00 → 78 beats a 52-lap bleep (64)', () => {
    // Race: Std(30, M, 10) = 1584; AG = 1584 / 2520 = 0.62857 → 99 × 0.62857 / 0.80 = 77.79 → 78
    // Bleep: Boys 18+ (age 30), 52 laps = P40 → 40 + 0.59 × 40 = 63.6 → 64
    // END = max(64, 78) = 78
    const r = rate(coach, [
      perf({ id: 'r10', kind: 'race', distanceKm: 10, timeSec: 2520, date: '2026-08-12' }),
      perf({ kind: 'bleep', bleepLaps: 52, date: '2026-10-10' }),
    ]);
    expect(r.stats.END.value).toBe(78);
    expect(r.stats.END.basis?.label).toBe('from 10 km, 12 Aug');
    expect(r.stats.END.basis?.perfIds).toEqual(['r10']);
    expect(r.stats.END.provisional).toBe(false);
  });

  it('a run with D_eff under 5 km does not set END', () => {
    const r = rate(coach, [perf({ kind: 'long_run', distanceKm: 4.5, timeSec: 1100 })]);
    expect(r.stats.END.locked).toBe(true);
    expect(r.stats.END.unlockHint).toBe('Bleep or 5K+');
  });
});

describe('CLB', () => {
  it('worked example: Test Hill Climb 5 km + 100 m (D_eff 6.0 km) in 25:00 → 77', () => {
    // D_eff = 5 + 100/100 = 6.0 km; Std(30, M, 6) = 930 s; AG = 930 / 1500 = 0.62
    // RunScore = 99 × 0.62 / 0.80 = 76.73 → 77
    const r = rate(coach, [perf({ kind: 'climb', courseId: 'c-climb', timeSec: 1500, date: '2026-10-03' })]);
    expect(r.stats.CLB).toMatchObject({ locked: false, value: 77 });
    expect(r.stats.CLB.basis?.label).toBe('from Test Hill Climb, 3 Oct');
  });
});

describe('DSC', () => {
  it('worked example (fixed benchmark): Ben, 4:00 on a 180 s course → 78; a faster unclean run is ignored', () => {
    // ageAdj = Std(13.5, M, 5) / Std(25, M, 5) = 808.5 / 769 = 1.051365
    // Score = 99 × 180 × 1.051365 / 240 = 78.06 → 78
    const r = rate(ben, [
      perf({ athleteId: 'a-ben', kind: 'descent', courseId: 'c-desc', timeSec: 240, cleanRun: true, date: '2026-09-01' }),
      perf({ id: 'unclean', athleteId: 'a-ben', kind: 'descent', courseId: 'c-desc', timeSec: 190, cleanRun: false, date: '2026-09-08' }),
    ]);
    expect(r.stats.DSC.value).toBe(78);
    const unclean = r.perfScores.find((p) => p.perfId === 'unclean');
    expect(unclean?.unscoredReason).toBe('not a clean run');
    expect(unclean?.score).toBeUndefined();
  });

  it('only unclean runs → locked, explaining why', () => {
    const r = rate(coach, [perf({ kind: 'descent', courseId: 'c-desc', timeSec: 190, cleanRun: false })]);
    expect(r.stats.DSC).toMatchObject({ locked: true, unlockHint: 'Clean descent run' });
    expect(r.stats.DSC.value).toBeUndefined();
  });

  it('fixed course without a benchmark → locked with the Settings message', () => {
    const r = rate(coach, [perf({ kind: 'descent', courseId: 'c-desc-unset', timeSec: 240, cleanRun: true })]);
    expect(r.stats.DSC.locked).toBe(true);
    expect(r.stats.DSC.value).toBeUndefined();
    expect(r.stats.DSC.unlockHint).toBe('Benchmark not set');
    expect(r.stats.DSC.unlockHelp).toBe("set this course's benchmark in Settings");
    expect(r.perfScores[0].unscoredReason).toBe("set this course's benchmark in Settings");
  });

  it("a fixed race course without the athlete's sex benchmark locks RACE the same way", () => {
    // Test Ridge Course has t99OpenM only, so Hana's (F) result cannot be scored.
    const r = rate(hana, [perf({ athleteId: 'a-hana', kind: 'race', eventId: 'e-ridge', timeSec: 2400, date: '2026-09-27' })]);
    expect(r.race.locked).toBe(true);
    expect(r.race.value).toBeUndefined();
    expect(r.race.unlockHelp).toBe("set this course's benchmark in Settings");
    expect(r.race.caps).toBe(1); // still a race cap ★
  });

  it('a race on a fixed race course uses the benchmark', () => {
    // Coach (30): ageAdj = 1; 99 × 1500 / 1800 = 82.5 → 83
    const r = rate(coach, [perf({ kind: 'race', eventId: 'e-ridge', timeSec: 1800, date: '2026-09-27' })]);
    expect(r.race.value).toBe(83);
    expect(r.race.bestRaceLine).toBe('Test Ridge Race 6 km · 30:00');
  });
});

describe('NAV', () => {
  const twoCircuits = [
    perf({ id: 'cpb', courseId: 'c-circuit', timeSec: 260, date: '2026-09-01' }), // 260 / 1.3 = 200 s/km (PB)
    perf({ courseId: 'c-circuit', timeSec: 300, date: '2026-10-01' }), // jogged later: 230.8 s/km
  ];

  it('reference pace is the best-ever Circuit pace (a later jog cannot help)', () => {
    expect(navReferencePace(twoCircuits, lookup, cfg, coach)).toEqual({ secPerKm: 200, perfId: 'cpb', source: 'circuit' });
  });

  it('worked example: 3.0 km route in 11:30 with 1 error → 82; 3 errors scores 40', () => {
    // predicted = 3.0 × 200 × 1.15 = 690 s; eff = 690 / (690 + 120 × 1) = 0.85185
    // NAV = 40 + 59 × (0.85185 − 0.5) / 0.5 = 81.52 → 82
    const r = rate(coach, [
      ...twoCircuits,
      perf({ kind: 'nav', courseId: 'c-nav', timeSec: 690, navErrors: 1, date: '2026-10-10' }),
      perf({ kind: 'nav', courseId: 'c-nav', timeSec: 600, navErrors: 3, routeKmEff: 3, date: '2026-10-12' }),
    ]);
    expect(r.stats.NAV).toMatchObject({ locked: false, value: 82, provisional: true });
    expect(r.stats.NAV.basis?.label).toBe('from Forest Nav, 10 Oct');
    expect(r.perfScores.find((p) => p.kind === 'nav' && p.date === '2026-10-12')?.score).toBe(40);
  });

  it('falls back to the best race pace with D_eff ≤ 5 km', () => {
    const perfs = [
      perf({ id: 'r5', kind: 'race', distanceKm: 5, timeSec: 1000 }), // 200 s/km
      perf({ kind: 'race', distanceKm: 10, timeSec: 1900 }), // 190 s/km, but D_eff 10 > 5: not eligible
    ];
    expect(navReferencePace(perfs, lookup, cfg, coach)).toEqual({ secPerKm: 200, perfId: 'r5', source: 'race' });
  });

  it('no Circuit and no short race → NAV locked', () => {
    const r = rate(coach, [perf({ kind: 'nav', courseId: 'c-nav', timeSec: 690, navErrors: 0 })]);
    expect(r.stats.NAV).toMatchObject({ locked: true, unlockHint: 'Run the Circuit' });
    expect(r.stats.NAV.value).toBeUndefined();
  });
});

describe('ARM', () => {
  const t1 = perf({ id: 'arm1', kind: 'arm', date: '2026-09-10', arm: { ankleCm: 11, calfReps: 18, storkSec: 22, hopStickBothLegs: true } });
  const t2 = perf({ id: 'arm2', kind: 'arm', date: '2026-10-10', arm: { ankleCm: 9, calfReps: 26, storkSec: 31, hopStickBothLegs: true } });
  const old = perf({ id: 'arm0', kind: 'arm', date: '2025-09-01', arm: { ankleCm: 15, calfReps: 30, storkSec: 40, hopStickBothLegs: true } });

  it('worked example: best level per domain in the last 12 months → 84', () => {
    // Test 1: ankle 11 → L3, calf 18 → L2, stork 22 → L3
    // Test 2: ankle 9 → L2, calf 26 → L4, stork 31 + hop-and-stick → L5
    // (the all-L5 test from 2025-09-01 is 13 months old: outside the 12-month window)
    // Best: ankle L3 + calf L4 + balance L5 = 12 → ARM = round(40 + (12 − 3) × 59 / 12) = round(84.25) = 84
    const r = rate(coach, [old, t1, t2]);
    expect(r.arm).toEqual({ ankle: 3, calf: 4, balance: 5, missing: [] });
    expect(r.stats.ARM).toMatchObject({ locked: false, value: 84, provisional: true });
    expect(r.stats.ARM.basis).toEqual({ perfIds: ['arm2', 'arm1'], date: '2026-10-10', label: 'from ARM tests, 10 Oct' });
  });

  it('a single test: L3 + L2 + L3 = 8 → round(40 + 5 × 59 / 12) = 65', () => {
    expect(rate(coach, [t1]).stats.ARM.value).toBe(65);
  });

  it('locked until all three domains have a level, naming the missing ones', () => {
    const r = rate(coach, [perf({ kind: 'arm', arm: { ankleCm: 11 } })]);
    expect(r.arm.missing).toEqual(['calf', 'balance']);
    expect(r.stats.ARM.locked).toBe(true);
    expect(r.stats.ARM.value).toBeUndefined();
    expect(r.stats.ARM.unlockHelp).toContain('calf and balance');
    const none = rate(coach, []);
    expect(none.stats.ARM.unlockHint).toBe('Test all three');
  });

  it('a domain measured below level 1 has no level yet: ARM stays locked (no number is manufactured)', () => {
    // ankle 3 cm → below L1 (5 cm), calf 10 → L1, stork 5 → L1. Levels run 1–5, so ankle has no level.
    const r = rate(coach, [perf({ kind: 'arm', date: '2026-09-15', arm: { ankleCm: 3, calfReps: 10, storkSec: 5 } })]);
    expect(r.arm).toEqual({ ankle: 0, calf: 1, balance: 1, missing: ['ankle'] });
    expect(r.stats.ARM).toMatchObject({ locked: true, unlockHint: 'Reach level 1' });
    expect(r.stats.ARM.value).toBeUndefined();
    expect(r.stats.ARM.unlockHelp).toBe('Reach level 1 in ankle (5 cm knee-to-wall) to unlock ARM (tests from the last 12 months count).');
    // A retest reaching 6 cm (L1) completes the set: L1 + L1 + L1 = 3 → 40 + 0 × 59 / 12 = 40
    const later = rate(coach, [perf({ kind: 'arm', date: '2026-09-15', arm: { ankleCm: 3, calfReps: 10, storkSec: 5 } }), perf({ kind: 'arm', date: '2026-10-15', arm: { ankleCm: 6 } })]);
    expect(later.stats.ARM).toMatchObject({ locked: false, value: 40 });
  });

  it('names untested domains and those below level 1 together', () => {
    const r = rate(coach, [perf({ kind: 'arm', arm: { ankleCm: 3 } })]);
    expect(r.arm.missing).toEqual(['ankle', 'calf', 'balance']);
    expect(r.stats.ARM.unlockHint).toBe('Finish ARM tests');
    expect(r.stats.ARM.unlockHelp).toBe('Test calf and balance, and reach level 1 in ankle (5 cm knee-to-wall), to unlock ARM (tests from the last 12 months count).');
  });

  it('tests older than the 12-month window: locked, saying when the last test was', () => {
    const r = rate(coach, [old]); // 2025-09-01: 13 months old
    expect(r.stats.ARM).toMatchObject({ locked: true, unlockHint: 'Retest all three' });
    expect(r.stats.ARM.unlockHelp).toBe('The last ARM test (1 Sep 2025) is over 12 months old: retest ankle, calf and balance to unlock ARM.');
  });

  it('window boundary: a test exactly 12 months old is out; 11 whole months is in', () => {
    // All L5 (ankle 14, calf 30, stork 30 + hop-and-stick): 40 + (15 − 3) × 59 / 12 = 99
    const full = { ankleCm: 14, calfReps: 30, storkSec: 30, hopStickBothLegs: true };
    expect(rate(coach, [perf({ kind: 'arm', date: '2025-10-22', arm: full })]).stats.ARM.locked).toBe(true);
    expect(rate(coach, [perf({ kind: 'arm', date: '2025-10-23', arm: full })]).stats.ARM).toMatchObject({ locked: false, value: 99 });
  });

  it('an unverified test is ignored and the help says it is waiting for verification', () => {
    const r = rate(coach, [perf({ kind: 'arm', verified: false, arm: { ankleCm: 14, calfReps: 30, storkSec: 30 } })]);
    expect(r.stats.ARM.locked).toBe(true);
    expect(r.stats.ARM.unlockHelp).toContain('waiting to be verified');
  });

  it('equal levels: the more recent test is the basis', () => {
    const a = perf({ id: 'armA', kind: 'arm', date: '2026-09-10', arm: { ankleCm: 10, calfReps: 20, storkSec: 20 } });
    const b = perf({ id: 'armB', kind: 'arm', date: '2026-10-10', arm: { ankleCm: 11, calfReps: 21, storkSec: 21 } });
    // Both L3 + L3 + L3 = 9 → 40 + 6 × 59 / 12 = 69.5 → 70
    const r = rate(coach, [a, b]);
    expect(r.stats.ARM.value).toBe(70);
    expect(r.stats.ARM.basis).toEqual({ perfIds: ['armB'], date: '2026-10-10', label: 'from ARM test, 10 Oct' });
  });
});

describe('RACE', () => {
  // Std(30, M, 5) = 769 s, so RunScore = 99 × 769 / (0.80 × t) = 95163.75 / t
  //   1190 s → 79.97 → 80;  1286 s → 74.00 → 74;  1360 s → 69.97 → 70;  1586 s → 60.00 → 60
  const r80 = perf({ id: 'r80', kind: 'race', eventId: 'e-xc', timeSec: 1190, date: '2026-09-20' });
  const r74 = perf({ id: 'r74', kind: 'race', distanceKm: 5, timeSec: 1286, date: '2026-08-30' });
  const r70 = perf({ id: 'r70', kind: 'parkrun', distanceKm: 5, timeSec: 1360, date: '2026-07-04' });
  const r60 = perf({ id: 'r60', kind: 'relay_leg', distanceKm: 5, timeSec: 1586, date: '2026-06-01' });

  it('one race: 1.00 × 80 = 80', () => {
    const r = rate(coach, [r80]);
    expect(r.race).toMatchObject({ locked: false, value: 80, caps: 1, bestRaceLine: 'Test Valley XC 5 km · 19:50', bestRacePerfId: 'r80' });
  });

  it('two races: 0.60 × 80 + 0.40 × 74 = 48 + 29.6 = 77.6 → 78', () => {
    expect(rate(coach, [r80, r74]).race.value).toBe(78);
  });

  it('three races: 0.50 × 80 + 0.30 × 74 + 0.20 × 70 = 40 + 22.2 + 14 = 76.2 → 76', () => {
    const r = rate(coach, [r70, r74, r80]);
    expect(r.race.value).toBe(76);
    expect(r.race.basis?.perfIds).toEqual(['r80', 'r74', 'r70']);
    expect(r.race.caps).toBe(2); // parkrun is not a cap
  });

  it('four races: only the top three count; relay legs are caps', () => {
    const r = rate(coach, [r60, r70, r74, r80]);
    expect(r.race.value).toBe(76);
    expect(r.race.caps).toBe(3);
  });

  it('no race → locked, and RACE is not part of OVR', () => {
    const r = rate(coach, [perf({ courseId: 'c-circuit', timeSec: 292 })]);
    expect(r.race).toMatchObject({ locked: true, unlockHint: 'Race to unlock', caps: 0 });
    expect(r.race.value).toBeUndefined();
    expect(r.race.bestRaceLine).toBeUndefined();
  });
});

describe('freshness inside a stat (3, 12 and 30 months)', () => {
  const at = (date: string) => rate(coach, [perf({ courseId: 'c-circuit', timeSec: 292, date })]).stats.SPD;

  it('3 months old: 77 − 0 = 77', () => {
    expect(at('2026-07-22').value).toBe(77);
  });

  it('12 months old: 77 − (12 − 6) = 71', () => {
    expect(at('2025-10-22').value).toBe(71);
  });

  it('30 months old: expired → locked (no number), still listed with its score', () => {
    const r = rate(coach, [perf({ courseId: 'c-circuit', timeSec: 292, date: '2024-04-22' })]);
    expect(r.stats.SPD.locked).toBe(true);
    expect(r.stats.SPD.value).toBeUndefined();
    expect(r.stats.SPD.unlockHelp).toContain('over 24 months old');
    expect(r.perfScores[0]).toMatchObject({ score: 77, expired: true, monthsOld: 30 });
    expect(r.perfScores[0].fresh).toBeUndefined();
  });
});

describe('Growth Shield (spec 3.8)', () => {
  // Circuit 10 months ago in 260 s: score 86, penalty (10 − 6) = 4 → fresh 82.
  // Circuit this month in 300 s: 75 (a growth-spurt dip). Current SPD = best fresh = 82.
  const perfs = [perf({ id: 'peak', courseId: 'c-circuit', timeSec: 260, date: '2025-12-22' }), perf({ courseId: 'c-circuit', timeSec: 300, date: '2026-10-05' })];

  it('on (streak active): max(82, 86 − 2) = 84', () => {
    const s = rate(coach, perfs, { streak: true }).stats.SPD;
    expect(s).toMatchObject({ value: 84, current: 82, peak12m: 86, shielded: true });
    expect(s.basis?.date).toBe('2025-12-22');
    expect(s.basis?.label).toBe('from Campus Circuit, 22 Dec · Growth Shield');
  });

  it('off (no active or frozen streak): 82', () => {
    expect(rate(coach, perfs, { streak: false }).stats.SPD).toMatchObject({ value: 82, shielded: false });
  });

  it('off (disabled in config): 82', () => {
    const c = cloneConfig(cfg);
    c.growthShield.enabled = false;
    expect(rate(coach, perfs, { streak: true, config: c }).stats.SPD).toMatchObject({ value: 82, shielded: false });
  });

  it('a peak older than 12 months does not shield', () => {
    // 13 months old: 86 − 7 = 79; outside the 12-month window, so no peak
    const s = rate(coach, [perf({ courseId: 'c-circuit', timeSec: 260, date: '2025-09-22' })], { streak: true }).stats.SPD;
    expect(s).toMatchObject({ value: 79, shielded: false });
    expect(s.peak12m).toBeUndefined();
  });

  it('never applies to RACE, and a locked stat stays locked', () => {
    const r = rate(coach, [perf({ kind: 'race', distanceKm: 5, timeSec: 1190, date: '2025-12-22' })], { streak: true });
    // RACE: 80 − (10 − 6) = 76, no shield
    expect(r.race).toMatchObject({ value: 76, shielded: false });
    expect(r.stats.SPD.locked).toBe(true);
    expect(r.stats.SPD.value).toBeUndefined();
  });
});

describe('OVR', () => {
  it('fewer than 2 unlocked stats → "—" and no number', () => {
    const r = rate(coach, [perf({ courseId: 'c-circuit', timeSec: 292 })]);
    expect(r.ovr).toEqual({ unlocked: 1, display: '—' });
    expect(r.tier).toBe('bronze');
  });

  it('mean of the unlocked stats: (SPD 77 + CLB 77 + END 78) / 3 = 77.33 → 77', () => {
    const r = rate(coach, [
      perf({ courseId: 'c-circuit', timeSec: 292 }),
      perf({ kind: 'climb', courseId: 'c-climb', timeSec: 1500 }),
      perf({ kind: 'long_run', distanceKm: 10, timeSec: 2520 }),
    ]);
    expect(r.ovr).toEqual({ value: 77, unlocked: 3, display: '77' });
  });
});

describe('tiers (spec 3.10)', () => {
  const ovr = (value?: number): OvrValue => ({ value, unlocked: value == null ? 1 : 3, display: value == null ? '—' : String(value) });
  const race = (value: number | undefined, caps: number): RaceStat => ({ key: 'RACE', locked: value == null, value, shielded: false, provisional: false, configVersion: 1, caps });

  it('bronze < 65 ≤ silver < 75 ≤ gold (with a race cap)', () => {
    expect(tierFor(ovr(64), race(70, 1), cfg).tier).toBe('bronze');
    expect(tierFor(ovr(65), race(70, 1), cfg).tier).toBe('silver');
    expect(tierFor(ovr(74), race(70, 1), cfg).tier).toBe('silver');
    expect(tierFor(ovr(75), race(70, 1), cfg)).toEqual({ tier: 'gold' });
  });

  it('gold without a race cap is shown as silver, with a note', () => {
    expect(tierFor(ovr(80), race(undefined, 0), cfg)).toEqual({ tier: 'silver', note: 'Gold needs at least 1 race cap' });
  });

  it('icon: 3+ caps and RACE ≥ 85, whatever the OVR', () => {
    expect(tierFor(ovr(60), race(85, 3), cfg).tier).toBe('icon');
    expect(tierFor(ovr(undefined), race(90, 4), cfg).tier).toBe('icon');
    expect(tierFor(ovr(80), race(84, 5), cfg).tier).toBe('gold');
    expect(tierFor(ovr(80), race(90, 2), cfg).tier).toBe('gold');
    expect(tierFor(ovr(undefined), race(70, 1), cfg).tier).toBe('bronze');
  });

  it('end to end: SPD 86 + CLB 77 → OVR 82, Silver until a race cap, then Gold', () => {
    // (86 + 77) / 2 = 81.5 → 82
    const base = [perf({ courseId: 'c-circuit', timeSec: 260 }), perf({ kind: 'climb', courseId: 'c-climb', timeSec: 1500 })];
    const noCap = rate(coach, [...base, perf({ kind: 'parkrun', distanceKm: 4, timeSec: 1100 })]); // parkrun: not a cap
    expect(noCap.ovr.value).toBe(82);
    expect(noCap.tier).toBe('silver');
    expect(noCap.tierNote).toBe('Gold needs at least 1 race cap');
    const capped = rate(coach, [...base, perf({ kind: 'race', distanceKm: 4, timeSec: 1100 })]);
    expect(capped.tier).toBe('gold');
    expect(capped.tierNote).toBeUndefined();
  });

  it('end to end: three 5 km races in 18:20 → RACE 87 with 3 caps → Icon', () => {
    // 95163.75 / 1100 = 86.51 → 87 each; 0.5 × 87 + 0.3 × 87 + 0.2 × 87 = 87
    const r = rate(coach, ['2026-08-01', '2026-09-01', '2026-10-01'].map((date) => perf({ kind: 'race', distanceKm: 5, timeSec: 1100, date })));
    expect(r.race).toMatchObject({ value: 87, caps: 3 });
    expect(r.tier).toBe('icon');
  });
});

describe('locked stats never show numbers', () => {
  it('a new athlete: every rating locked, with a ≤ 3-word hint and a one-line help', () => {
    const r = rate(hana, []);
    for (const s of [...STAT_KEYS.map((k) => r.stats[k]), r.race]) {
      expect(s.locked).toBe(true);
      expect(s.value).toBeUndefined();
      expect(s.current).toBeUndefined();
      expect(s.peak12m).toBeUndefined();
      expect(s.basis).toBeUndefined();
      expect(words(s.unlockHint)).toBeGreaterThan(0);
      expect(words(s.unlockHint)).toBeLessThanOrEqual(3);
      expect(s.unlockHelp).toMatch(/\S/);
      expect(s.unlockHelp).not.toContain('\n');
    }
    expect(r.ovr).toEqual({ unlocked: 0, display: '—' });
    expect(r.tier).toBe('bronze');
    expect(r.provisionalAny).toBe(false);
  });
});

describe('unverified and deleted results are ignored', () => {
  it('only the verified, live result counts; all three are listed', () => {
    const r = rate(coach, [
      perf({ id: 'unv', courseId: 'c-circuit', timeSec: 250, verified: false }),
      perf({ id: 'del', courseId: 'c-circuit', timeSec: 240, deleted: true }),
      perf({ id: 'ok', courseId: 'c-circuit', timeSec: 300 }),
    ]);
    expect(r.stats.SPD.value).toBe(75); // 99 × (181.35 / 300) / 0.80 = 74.81 → 75
    expect(r.perfScores.map((p) => [p.perfId, p.unscoredReason])).toEqual([
      ['del', 'deleted'],
      ['ok', undefined],
      ['unv', 'unverified'],
    ]);
  });

  it('an unverified race is not a cap; a result awaiting verification is named in the help', () => {
    const r = rate(coach, [perf({ kind: 'race', distanceKm: 5, timeSec: 1190, verified: false }), perf({ kind: 'race', distanceKm: 5, timeSec: 1100, deleted: true })]);
    expect(r.race.locked).toBe(true);
    expect(r.race.caps).toBe(0);
    expect(r.race.unlockHelp).toContain('waiting to be verified');
  });

  it("other athletes' results are ignored", () => {
    const r = rate(coach, [perf({ athleteId: 'a-ben', courseId: 'c-circuit', timeSec: 292 })]);
    expect(r.stats.SPD.locked).toBe(true);
    expect(r.perfScores).toEqual([]);
  });

  it('results after the as-of date do not count yet', () => {
    const r = rate(coach, [perf({ courseId: 'c-circuit', timeSec: 292, date: '2026-11-01' })]);
    expect(r.stats.SPD.locked).toBe(true);
    expect(r.perfScores[0].unscoredReason).toBe('after the as-of date');
  });
});

describe('provisional markers and config version', () => {
  it('the provisional fallback table marks age-graded stats provisional', () => {
    const fb = cloneConfig(cfg);
    fb.ageGrade.table = 'fallback_provisional';
    // Fallback: Std(30, M, 1.3) = 769 × (1.3/5)^1.10 = 174.74 s; 260 s → 99 × 0.67208 / 0.80 = 83.17 → 83
    const r = rate(coach, [perf({ courseId: 'c-circuit', timeSec: 260 }), perf({ kind: 'race', distanceKm: 5, timeSec: 1190 })], { config: fb });
    expect(r.stats.SPD).toMatchObject({ value: 83, provisional: true });
    expect(r.race.provisional).toBe(true);
    expect(r.provisionalAny).toBe(true);
  });

  it('with the Alan Jones tables, age-graded stats are not provisional', () => {
    const r = rate(coach, [perf({ courseId: 'c-circuit', timeSec: 260 })]);
    expect(r.stats.SPD).toMatchObject({ value: 86, provisional: false });
    expect(r.provisionalAny).toBe(false);
  });

  it('records the config version on every rating and performance score', () => {
    const c = { ...cloneConfig(cfg), version: 7 };
    const r = rate(coach, [perf({ courseId: 'c-circuit', timeSec: 292 })], { config: c });
    expect(r.configVersion).toBe(7);
    expect(r.race.configVersion).toBe(7);
    for (const k of STAT_KEYS) expect(r.stats[k].configVersion).toBe(7);
    expect(r.perfScores.every((p) => p.configVersion === 7)).toBe(true);
  });

  it('reports the current age (estimated from year group)', () => {
    // Ben on 2026-10-22: 13 + 0.5 + 51 / 365.25 = 13.6396
    const r = rate(ben, []);
    expect(r.ageNow.estimated).toBe(true);
    expect(r.ageNow.age).toBeCloseTo(13.5 + 51 / 365.25, 9);
  });
});

describe('freshness boundaries inside a stat', () => {
  const at = (date: string) => rate(coach, [perf({ courseId: 'c-circuit', timeSec: 292, date })]).stats.SPD;

  it('exactly 6 months old: 77 − 0 = 77; 7 months: 76', () => {
    expect(at('2026-04-22').value).toBe(77);
    expect(at('2026-03-22').value).toBe(76);
  });

  it('exactly 24 months old still counts: 77 − (24 − 6) = 59; 25 months is locked', () => {
    expect(at('2024-10-22')).toMatchObject({ locked: false, value: 59 });
    expect(at('2024-09-22')).toMatchObject({ locked: true });
    expect(at('2024-09-22').value).toBeUndefined();
  });
});

describe('Growth Shield boundaries', () => {
  it('peak 11 whole months old shields: 86 − (11 − 6) = 81 → max(81, 86 − 2) = 84', () => {
    const s = rate(coach, [perf({ courseId: 'c-circuit', timeSec: 260, date: '2025-11-22' })], { streak: true }).stats.SPD;
    expect(s).toMatchObject({ value: 84, current: 81, peak12m: 86, shielded: true });
  });

  it('peak exactly 12 months old is outside "the last 12 months": 86 − 6 = 80, no shield', () => {
    const s = rate(coach, [perf({ courseId: 'c-circuit', timeSec: 260, date: '2025-10-22' })], { streak: true }).stats.SPD;
    expect(s).toMatchObject({ value: 80, shielded: false });
    expect(s.peak12m).toBeUndefined();
  });

  it('shields END too, dating the card from the peak run', () => {
    // 10 km in 42:00 (78), 11 months old → 78 − 5 = 73; bleep 52 laps this month → 64. Current END = 73.
    // Shield: max(73, 78 − 2) = 76, from the 10 km. RACE (73) is never shielded.
    const r = rate(
      coach,
      [perf({ id: 'r10', kind: 'race', distanceKm: 10, timeSec: 2520, date: '2025-11-22' }), perf({ kind: 'bleep', bleepLaps: 52, date: '2026-10-10' })],
      { streak: true },
    );
    expect(r.stats.END).toMatchObject({ value: 76, current: 73, peak12m: 78, shielded: true, provisional: false });
    expect(r.stats.END.basis?.label).toBe('from 10 km, 22 Nov · Growth Shield');
    expect(r.race).toMatchObject({ value: 73, shielded: false });
  });

  it('a shielded stat that rests on a provisional result is marked provisional', () => {
    // Ben on 2025-11-22 (estimated): 13.5 − 283 / 365.25 = 12.73 → Boys 12 row (P80 57, P90 67)
    // 60 laps: P = 80 + 3 / 10 × 10 = 83 → 40 + 0.59 × 83 = 88.97 → 89; 11 months old → 89 − 5 = 84
    // Shield: max(84, 89 − 2) = 87, resting on the provisional bleep table
    const r = rate(ben, [perf({ athleteId: 'a-ben', kind: 'bleep', bleepLaps: 60, date: '2025-11-22' })], { streak: true });
    expect(r.stats.END).toMatchObject({ value: 87, current: 84, peak12m: 89, shielded: true, provisional: true });
  });
});

describe('RACE: more cases', () => {
  const r80 = perf({ id: 'r80b', kind: 'race', eventId: 'e-xc', timeSec: 1190, date: '2026-09-20' });

  it('an expired race leaves the top-N (one race → 1.00 × 80) but is still a cap', () => {
    const expired = perf({ id: 'rOld', kind: 'race', distanceKm: 5, timeSec: 1100, date: '2024-04-22' }); // 30 months
    const r = rate(coach, [expired, r80]);
    expect(r.race).toMatchObject({ value: 80, caps: 2 });
    expect(r.race.basis).toMatchObject({ perfIds: ['r80b'], label: 'from 1 race, best 20 Sep' });
  });

  it('ranks by FreshScore, not raw score', () => {
    // A: 80 at 18 months → 80 − 12 = 68; B: 74 this month. Order B, A: 0.6 × 74 + 0.4 × 68 = 44.4 + 27.2 = 71.6 → 72
    const a = perf({ id: 'rA', kind: 'race', distanceKm: 5, timeSec: 1190, date: '2025-04-22' });
    const b = perf({ id: 'rB', kind: 'race', distanceKm: 5, timeSec: 1286, date: '2026-10-01' });
    const r = rate(coach, [a, b]);
    expect(r.race.value).toBe(72);
    expect(r.race.basis?.perfIds).toEqual(['rB', 'rA']);
    expect(r.race.bestRacePerfId).toBe('rB');
  });

  it('a tie on FreshScore puts the more recent race first', () => {
    const a = perf({ id: 'tieOld', kind: 'race', distanceKm: 5, timeSec: 1190, date: '2026-08-01' });
    const b = perf({ id: 'tieNew', kind: 'race', distanceKm: 5, timeSec: 1190, date: '2026-10-01' });
    expect(rate(coach, [a, b]).race).toMatchObject({ value: 80, bestRacePerfId: 'tieNew' });
  });

  it('a relay leg or parkrun under 5 km feeds RACE but not END', () => {
    const r = rate(coach, [perf({ kind: 'relay_leg', distanceKm: 2, timeSec: 400 })]);
    expect(r.race.locked).toBe(false);
    expect(r.stats.END.locked).toBe(true);
  });
});

describe('END: tie and help', () => {
  it('a tie between the bleep test and a long run goes to the bleep test', () => {
    // Bleep 70 laps (Boys 18+, P60 67 → P70 75): P = 60 + 3 / 8 × 10 = 63.75 → 40 + 0.59 × 63.75 = 77.61 → 78
    // 10 km in 42:00 → 78
    const r = rate(coach, [perf({ kind: 'race', distanceKm: 10, timeSec: 2520, date: '2026-10-01' }), perf({ kind: 'bleep', bleepLaps: 70, date: '2026-09-01' })]);
    expect(r.stats.END.value).toBe(78);
    expect(r.stats.END.basis?.label).toBe('from bleep test, 1 Sep');
  });

  it('the lock help names every long-run pathway', () => {
    expect(rate(coach, []).stats.END.unlockHelp).toBe('Do a bleep test, or a verified race, relay leg, parkrun or long run of 5 km effort or more, to unlock END.');
  });
});

describe('NAV: reference pace edge cases', () => {
  it('best-ever Circuit includes an expired Circuit, ignores unverified ones and results after the as-of date', () => {
    const perfs = [
      perf({ id: 'cOld', courseId: 'c-circuit', timeSec: 247, date: '2024-04-22' }), // 247 / 1.3 = 190 s/km (30 months old)
      perf({ courseId: 'c-circuit', timeSec: 260, date: '2026-10-01' }), // 200 s/km
      perf({ courseId: 'c-circuit', timeSec: 200, date: '2026-10-02', verified: false }), // unverified
      perf({ courseId: 'c-circuit', timeSec: 210, date: '2026-11-01' }), // after the as-of date
    ];
    const ref = navReferencePace(perfs, lookup, cfg, coach, AS_OF);
    expect(ref).toMatchObject({ perfId: 'cOld', source: 'circuit' });
    expect(ref?.secPerKm).toBeCloseTo(190, 9);
    // predicted = 3.0 × 190 × 1.15 = 655.5; eff = 655.5 / (690 + 120) = 0.80926 → 40 + 59 × 0.30926 / 0.5 = 76.49 → 76
    const r = rate(coach, [...perfs, perf({ kind: 'nav', courseId: 'c-nav', timeSec: 690, navErrors: 1, date: '2026-10-10' })]);
    expect(r.stats.NAV.value).toBe(76);
  });

  it('race fallback: a 5 km parkrun (D_eff 5.0) is eligible; 4 km + 120 m (D_eff 5.2) is not', () => {
    const perfs = [
      perf({ id: 'pr5', kind: 'parkrun', distanceKm: 5, timeSec: 1100 }), // 220 s/km
      perf({ kind: 'race', distanceKm: 4, climbM: 120, timeSec: 900 }), // 173 s/km on D_eff 5.2: not eligible
    ];
    expect(navReferencePace(perfs, lookup, cfg, coach)).toEqual({ secPerKm: 220, perfId: 'pr5', source: 'race' });
  });

  it('a Circuit always beats a faster race pace', () => {
    const perfs = [perf({ id: 'c1', courseId: 'c-circuit', timeSec: 300 }), perf({ kind: 'race', distanceKm: 5, timeSec: 900 })];
    expect(navReferencePace(perfs, lookup, cfg, coach)?.perfId).toBe('c1');
  });

  it('a nav result with no route distance: locked, asking for the route distance', () => {
    const r = rate(coach, [perf({ courseId: 'c-circuit', timeSec: 260 }), perf({ kind: 'nav', timeSec: 690, navErrors: 0 })]);
    expect(r.stats.NAV).toMatchObject({ locked: true, unlockHint: 'Route distance missing' });
    expect(r.stats.NAV.value).toBeUndefined();
  });
});

describe('OVR: more cases', () => {
  it('exactly 2 unlocked stats: (SPD 77 + CLB 77) / 2 = 77, shown as 2/6', () => {
    const r = rate(coach, [perf({ courseId: 'c-circuit', timeSec: 292 }), perf({ kind: 'climb', courseId: 'c-climb', timeSec: 1500 })]);
    expect(r.ovr).toEqual({ value: 77, unlocked: 2, display: '77' });
  });

  it('uses the displayed (shielded) values', () => {
    // SPD: 260 s 10 months ago (86 → 82) and 300 s now (75); CLB 77 now.
    // Streak on: SPD 84 → (84 + 77) / 2 = 80.5 → 81. Streak off: (82 + 77) / 2 = 79.5 → 80.
    const perfs = [
      perf({ courseId: 'c-circuit', timeSec: 260, date: '2025-12-22' }),
      perf({ courseId: 'c-circuit', timeSec: 300, date: '2026-10-05' }),
      perf({ kind: 'climb', courseId: 'c-climb', timeSec: 1500, date: '2026-10-03' }),
    ];
    expect(rate(coach, perfs, { streak: true }).ovr.value).toBe(81);
    expect(rate(coach, perfs, { streak: false }).ovr.value).toBe(80);
  });
});

describe('tiers: more cases', () => {
  const base = () => [perf({ courseId: 'c-circuit', timeSec: 260 }), perf({ kind: 'climb', courseId: 'c-climb', timeSec: 1500 })]; // OVR 82

  it('race caps are lifetime: an expired race still unlocks Gold (RACE itself is locked)', () => {
    const r = rate(coach, [...base(), perf({ kind: 'race', distanceKm: 5, timeSec: 1190, date: '2024-04-22' })]);
    expect(r.race).toMatchObject({ locked: true, caps: 1 });
    expect(r.tier).toBe('gold');
  });

  it('an unverified race is not a cap: Silver with a note', () => {
    const r = rate(coach, [...base(), perf({ kind: 'race', distanceKm: 5, timeSec: 1190, verified: false })]);
    expect(r.tier).toBe('silver');
    expect(r.tierNote).toBe('Gold needs at least 1 race cap');
  });

  it('Icon at exactly RACE 85 with 3 caps; a parkrun is not a cap', () => {
    // 95163.75 / 1120 = 84.97 → 85 each; 0.5 × 85 + 0.3 × 85 + 0.2 × 85 = 85
    const dates = ['2026-08-01', '2026-09-01', '2026-10-01'];
    const icon = rate(coach, dates.map((date) => perf({ kind: 'race', distanceKm: 5, timeSec: 1120, date })));
    expect(icon.race).toMatchObject({ value: 85, caps: 3 });
    expect(icon.tier).toBe('icon');
    const twoCaps = rate(coach, dates.map((date, i) => perf({ kind: i === 0 ? 'parkrun' : 'race', distanceKm: 5, timeSec: 1120, date })));
    expect(twoCaps.race).toMatchObject({ value: 85, caps: 2 });
    expect(twoCaps.tier).toBe('bronze'); // no OVR ('—')
  });
});

describe('board opt-outs and estimated ages do not change ratings', () => {
  it('absoluteBoardOptOut changes nothing in the ratings', () => {
    const perfs = [perf({ courseId: 'c-circuit', timeSec: 292 }), perf({ kind: 'race', distanceKm: 5, timeSec: 1190 })];
    const a = rate(coach, perfs);
    const b = rate(athlete({ absoluteBoardOptOut: true }), perfs);
    expect(b.stats).toEqual(a.stats);
    expect(b.race).toEqual(a.race);
    expect(b.tier).toBe(a.tier);
  });
});

describe('locked stats never show numbers, whatever the inputs', () => {
  it('only unverified, deleted, expired and future results → every rating locked', () => {
    const kinds: Partial<Performance>[] = [
      { courseId: 'c-circuit', timeSec: 292 },
      { kind: 'climb', courseId: 'c-climb', timeSec: 1500 },
      { kind: 'descent', courseId: 'c-desc', timeSec: 240, cleanRun: true },
      { kind: 'nav', courseId: 'c-nav', timeSec: 690, navErrors: 0 },
      { kind: 'bleep', bleepLaps: 60 },
      { kind: 'race', distanceKm: 10, timeSec: 2520 },
      { kind: 'arm', arm: { ankleCm: 14, calfReps: 30, storkSec: 30 } },
    ];
    const perfs = kinds.flatMap((k) => [
      perf({ ...k, verified: false }),
      perf({ ...k, deleted: true }),
      perf({ ...k, date: '2024-04-22' }), // 30 months: expired (and outside the ARM window)
      perf({ ...k, date: '2026-12-01' }), // after the as-of date
    ]);
    const r = rate(coach, perfs, { streak: true });
    for (const s of [...STAT_KEYS.map((k) => r.stats[k]), r.race]) {
      expect(s.locked).toBe(true);
      expect(s.value).toBeUndefined();
      expect(s.current).toBeUndefined();
      expect(s.basis).toBeUndefined();
      expect(words(s.unlockHint)).toBeLessThanOrEqual(3);
    }
    expect(r.ovr.display).toBe('—');
    expect(r.race.caps).toBe(1); // only the expired race is a live, verified race up to the as-of date
  });
});

describe('provisional markers', () => {
  it('NAV, ARM and bleep-based END are provisional; age-graded SPD is not', () => {
    const r = rate(coach, [
      perf({ courseId: 'c-circuit', timeSec: 260 }),
      perf({ kind: 'nav', courseId: 'c-nav', timeSec: 690, navErrors: 1 }),
      perf({ kind: 'arm', arm: { ankleCm: 11, calfReps: 18, storkSec: 22 } }),
      perf({ kind: 'bleep', bleepLaps: 52 }),
    ]);
    expect(r.stats.SPD.provisional).toBe(false);
    expect(r.stats.NAV.provisional).toBe(true);
    expect(r.stats.ARM.provisional).toBe(true);
    expect(r.stats.END.provisional).toBe(true);
    expect(r.provisionalAny).toBe(true);
  });

  it('the fallback table also marks fixed-benchmark DSC provisional', () => {
    const fb = cloneConfig(cfg);
    fb.ageGrade.table = 'fallback_provisional';
    const r = rate(ben, [perf({ athleteId: 'a-ben', kind: 'descent', courseId: 'c-desc', timeSec: 240, cleanRun: true, date: '2026-09-01' })], { config: fb });
    expect(r.stats.DSC).toMatchObject({ locked: false, provisional: true });
  });
});

describe('SPD tie', () => {
  it('equal FreshScores: the more recent run dates the card', () => {
    const r = rate(coach, [perf({ id: 's1', courseId: 'c-circuit', timeSec: 292, date: '2026-09-01' }), perf({ id: 's2', courseId: 'c-circuit', timeSec: 292, date: '2026-10-01' })]);
    expect(r.stats.SPD.basis?.perfIds).toEqual(['s2']);
  });
});

describe('a full card: every stat unlocked (worked example)', () => {
  it('Coach Example: SPD 86, END 78, CLB 77, DSC 74, NAV 82, ARM 65 → OVR 77 (6/6), RACE 78, Gold', () => {
    // SPD: Circuit 4:20 → 99 × (181.35 / 260) / 0.80 = 86.31 → 86
    // RACE and END: 10 km in 42:00 → 99 × (1584 / 2520) / 0.80 = 77.79 → 78 (one race: 1.00 × 78)
    // CLB: Test Hill Climb (D_eff 6.0 km) in 25:00 → 99 × (930 / 1500) / 0.80 = 76.73 → 77
    // DSC: fixed benchmark 180 s, age 30 (ageAdj 1) in 4:00 → 99 × 180 / 240 = 74.25 → 74
    // NAV: refPace 260 / 1.3 = 200 s/km; 3.0 × 200 × 1.15 = 690; 690 / (690 + 120) = 0.85185 → 81.52 → 82
    // ARM: ankle 11 (L3) + calf 18 (L2) + stork 22 (L3) = 8 → 40 + 5 × 59 / 12 = 64.58 → 65
    // OVR = (86 + 78 + 77 + 74 + 82 + 65) / 6 = 462 / 6 = 77 → Gold (≥ 75 with 1 race cap); not Icon (1 cap)
    const r = rate(coach, [
      perf({ courseId: 'c-circuit', timeSec: 260 }),
      perf({ kind: 'race', distanceKm: 10, timeSec: 2520 }),
      perf({ kind: 'climb', courseId: 'c-climb', timeSec: 1500 }),
      perf({ kind: 'descent', courseId: 'c-desc', timeSec: 240, cleanRun: true }),
      perf({ kind: 'nav', courseId: 'c-nav', timeSec: 690, navErrors: 1 }),
      perf({ kind: 'arm', arm: { ankleCm: 11, calfReps: 18, storkSec: 22 } }),
    ]);
    expect(STAT_KEYS.map((k) => r.stats[k].value)).toEqual([86, 78, 77, 74, 82, 65]);
    expect(r.ovr).toEqual({ value: 77, unlocked: 6, display: '77' });
    expect(r.race).toMatchObject({ value: 78, caps: 1 });
    expect(r.tier).toBe('gold');
    expect(r.tierNote).toBeUndefined();
    expect(r.provisionalAny).toBe(true); // NAV and ARM are provisional
  });
});

describe('every rating constant comes from config', () => {
  it('Growth Shield margin: with margin 1, max(82, 86 − 1) = 85', () => {
    const c = cloneConfig(cfg);
    c.growthShield.margin = 1;
    const perfs = [perf({ courseId: 'c-circuit', timeSec: 260, date: '2025-12-22' }), perf({ courseId: 'c-circuit', timeSec: 300, date: '2026-10-05' })];
    expect(rate(coach, perfs, { streak: true, config: c }).stats.SPD).toMatchObject({ value: 85, current: 82, peak12m: 86, shielded: true });
  });

  it('RACE weights: two races 0.5 / 0.5 → (80 + 74) / 2 = 77; three 0.34 / 0.33 / 0.33 → 27.2 + 24.42 + 23.1 = 74.72 → 75', () => {
    const c = cloneConfig(cfg);
    c.race.weights2 = [0.5, 0.5];
    c.race.weights3 = [0.34, 0.33, 0.33];
    const r80 = perf({ kind: 'race', distanceKm: 5, timeSec: 1190, date: '2026-09-20' });
    const r74 = perf({ kind: 'race', distanceKm: 5, timeSec: 1286, date: '2026-08-30' });
    const r70 = perf({ kind: 'parkrun', distanceKm: 5, timeSec: 1360, date: '2026-07-04' });
    expect(rate(coach, [r80, r74], { config: c }).race.value).toBe(77);
    expect(rate(coach, [r80, r74, r70], { config: c }).race.value).toBe(75);
  });

  it('OVR minimum unlocked: at 3, two unlocked stats show "—"', () => {
    const c = cloneConfig(cfg);
    c.ovr.minUnlocked = 3;
    const r = rate(coach, [perf({ courseId: 'c-circuit', timeSec: 292 }), perf({ kind: 'climb', courseId: 'c-climb', timeSec: 1500 })], { config: c });
    expect(r.ovr).toEqual({ unlocked: 2, display: '—' });
  });

  it('tier thresholds: with Gold at 80, OVR 77 with a cap is Silver; with Silver at 78 it is Bronze', () => {
    const ovr: OvrValue = { value: 77, unlocked: 3, display: '77' };
    const race: RaceStat = { key: 'RACE', locked: false, value: 70, shielded: false, provisional: false, configVersion: 1, caps: 1 };
    const c = cloneConfig(cfg);
    c.tiers.goldMin = 80;
    expect(tierFor(ovr, race, c).tier).toBe('silver');
    c.tiers.silverMin = 78;
    expect(tierFor(ovr, race, c).tier).toBe('bronze');
    const d = cloneConfig(cfg);
    d.tiers.iconMinCaps = 1;
    d.tiers.iconMinRace = 70;
    expect(tierFor(ovr, race, d).tier).toBe('icon');
  });

  it('ARM window: with 6 months, a 7-month-old test no longer counts', () => {
    const c = cloneConfig(cfg);
    c.arm.windowMonths = 6;
    const t = perf({ kind: 'arm', date: '2026-03-22', arm: { ankleCm: 11, calfReps: 18, storkSec: 22 } });
    expect(rate(coach, [t]).stats.ARM.value).toBe(65);
    expect(rate(coach, [t], { config: c }).stats.ARM).toMatchObject({ locked: true, unlockHint: 'Retest all three' });
  });
});

describe('edge cases', () => {
  it('Growth Shield at exactly the margin: peak 86, current 84 (8 months: 86 − 2) → 84, not shielded', () => {
    const s = rate(coach, [perf({ courseId: 'c-circuit', timeSec: 260, date: '2026-02-22' })], { streak: true }).stats.SPD;
    expect(s).toMatchObject({ value: 84, current: 84, peak12m: 86, shielded: false });
  });

  it('RACE: of three races, an expired one drops out and the two-race weights apply', () => {
    // 80 and 74 current; a 30-month-old 1100 s race (87) has expired: 0.6 × 80 + 0.4 × 74 = 77.6 → 78
    const r = rate(coach, [
      perf({ kind: 'race', distanceKm: 5, timeSec: 1190, date: '2026-09-20' }),
      perf({ kind: 'race', distanceKm: 5, timeSec: 1286, date: '2026-08-30' }),
      perf({ kind: 'race', distanceKm: 5, timeSec: 1100, date: '2024-04-22' }),
    ]);
    expect(r.race).toMatchObject({ value: 78, caps: 3 });
  });

  it('END: an unverified 10 km is ignored, so the bleep test (52 laps → 64) sets END', () => {
    const r = rate(coach, [perf({ kind: 'race', distanceKm: 10, timeSec: 2520, verified: false }), perf({ kind: 'bleep', bleepLaps: 52, date: '2026-10-10' })]);
    expect(r.stats.END).toMatchObject({ value: 64, provisional: true });
    expect(r.stats.END.basis?.label).toBe('from bleep test, 10 Oct');
  });

  it('NAV reference: a long run is not a race, so it cannot set the pace', () => {
    const long = perf({ kind: 'long_run', distanceKm: 5, timeSec: 900 }); // 180 s/km, but not a race
    expect(navReferencePace([long], lookup, cfg, coach)).toBeUndefined();
    const r = rate(coach, [long, perf({ kind: 'nav', courseId: 'c-nav', timeSec: 690, navErrors: 0 })]);
    expect(r.stats.NAV).toMatchObject({ locked: true, unlockHint: 'Run the Circuit' });
  });

  it('ARM: L5 balance needs stance ≥ 30 s and hop-and-stick in the same test', () => {
    // Test A: ankle 14 (L5), calf 30 (L5), stork 35 (L4), no hop-and-stick. Test B: stork 25 (L3) with hop-and-stick.
    // Best balance = L4 (B's hop-and-stick does not lift A's stance). Sum 5 + 5 + 4 = 14 → 40 + 11 × 59 / 12 = 94.08 → 94
    const r = rate(coach, [
      perf({ kind: 'arm', date: '2026-09-10', arm: { ankleCm: 14, calfReps: 30, storkSec: 35 } }),
      perf({ kind: 'arm', date: '2026-10-10', arm: { storkSec: 25, hopStickBothLegs: true } }),
    ]);
    expect(r.arm).toEqual({ ankle: 5, calf: 5, balance: 4, missing: [] });
    expect(r.stats.ARM.value).toBe(94);
  });

  it('a stat whose only result is waiting for verification shows no number', () => {
    const r = rate(coach, [perf({ kind: 'climb', courseId: 'c-climb', timeSec: 1500, verified: false })], { streak: true });
    expect(r.stats.CLB).toMatchObject({ locked: true, unlockHint: 'Run a climb' });
    expect(r.stats.CLB.value).toBeUndefined();
    expect(r.stats.CLB.unlockHelp).toBe('A result is waiting to be verified: tick it to unlock CLB.');
  });
});

describe('bad data never crashes the ratings or shows a made-up number', () => {
  it('an unrecognised year group: age-graded stats lock with "Check athlete details"; ARM still works', () => {
    // Before the fix this threw inside the standards table, taking down every rating on the page.
    const odd = athlete({ yearGroup: 'Y6' as never });
    const r = rate(odd, [perf({ courseId: 'c-circuit', timeSec: 292 }), perf({ kind: 'arm', arm: { ankleCm: 11, calfReps: 18, storkSec: 22 } })]);
    expect(r.stats.SPD).toMatchObject({ locked: true, unlockHint: 'Check athlete details' });
    expect(r.stats.SPD.value).toBeUndefined();
    expect(words(r.stats.SPD.unlockHint)).toBeLessThanOrEqual(3);
    expect(r.stats.ARM.value).toBe(65);
  });

  it('a date of birth that is not a date is ignored (the year-group estimate is used)', () => {
    const withBadDob = rate({ ...ben, dob: '12/03/2012' }, [perf({ athleteId: 'a-ben', kind: 'bleep', bleepLaps: 60, date: '2026-09-01' })]);
    expect(withBadDob.stats.END.value).toBe(84); // same as the Ben worked example: Boys 13, P75 → 84
    expect(withBadDob.ageNow.estimated).toBe(true);
    expect(Number.isFinite(withBadDob.ageNow.age)).toBe(true);
  });

  it('a result with no valid date, an unknown kind or an infinite time is listed but never counts', () => {
    const r = rate(coach, [
      perf({ id: 'noDate', courseId: 'c-circuit', timeSec: 292, date: '' }),
      perf({ id: 'oddKind', kind: 'session' as never, distanceKm: 5, timeSec: 1200 }),
      perf({ id: 'infTime', courseId: 'c-circuit', timeSec: Infinity }),
      perf({ id: 'infLaps', kind: 'bleep', bleepLaps: Infinity }),
    ]);
    expect(r.stats.SPD.locked).toBe(true);
    expect(r.stats.END.locked).toBe(true);
    expect(r.race.locked).toBe(true);
    expect(r.perfScores).toHaveLength(4);
    expect(r.perfScores.every((p) => p.score == null && p.unscoredReason)).toBe(true);
  });

  it('a race with no valid date is not a race cap (it used to count, since "" sorts before any date)', () => {
    const r = rate(coach, [perf({ kind: 'race', distanceKm: 5, timeSec: 1190, date: '' }), perf({ kind: 'race', distanceKm: 5, timeSec: 1190, date: '2026-09-20' })]);
    expect(r.race).toMatchObject({ value: 80, caps: 1 });
  });

  it('an infinite Circuit time is not a reference pace (it used to give NAV 99)', () => {
    const perfs = [perf({ courseId: 'c-circuit', timeSec: Infinity }), perf({ kind: 'nav', courseId: 'c-nav', timeSec: 690, navErrors: 0 })];
    expect(navReferencePace(perfs, lookup, cfg, coach)).toBeUndefined();
    expect(rate(coach, perfs).stats.NAV.locked).toBe(true);
  });
});

describe('invariants over many generated athletes (deterministic)', () => {
  /** mulberry32: a small seeded generator, so the test is the same on every run. */
  function rng(seed: number) {
    let a = seed;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it('every unlocked rating is a whole number 40–99 with a basis; every locked one has no number and a ≤ 3-word hint', () => {
    const r = rng(20261022);
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
    const dates = ['2024-01-10', '2024-10-22', '2025-03-01', '2025-10-23', '2026-02-14', '2026-06-30', '2026-10-01', '2026-10-22', '2026-12-01'];
    const people = [coach, ben, hana, athlete({ id: 'a-staff-f', sex: 'F', dob: '1980-05-05' })];
    for (let i = 0; i < 300; i++) {
      const who = pick(people);
      const perfs: Performance[] = [];
      const count = Math.floor(r() * 12);
      for (let j = 0; j < count; j++) {
        const base = { athleteId: who.id, date: pick(dates), verified: r() > 0.15, deleted: r() < 0.05 };
        const kind = pick(['circuit', 'climb', 'descent', 'nav', 'bleep', 'race', 'relay_leg', 'parkrun', 'long_run', 'arm'] as const);
        const t = 120 + r() * 4000;
        if (kind === 'circuit') perfs.push(perf({ ...base, kind, courseId: 'c-circuit', timeSec: t / 6 }));
        else if (kind === 'climb') perfs.push(perf({ ...base, kind, courseId: 'c-climb', timeSec: t }));
        else if (kind === 'descent') perfs.push(perf({ ...base, kind, courseId: pick(['c-desc', 'c-desc-unset']), timeSec: t / 8, cleanRun: r() > 0.2 }));
        else if (kind === 'nav') perfs.push(perf({ ...base, kind, courseId: 'c-nav', timeSec: t / 2, navErrors: Math.floor(r() * 5) }));
        else if (kind === 'bleep') perfs.push(perf({ ...base, kind, bleepLaps: Math.floor(r() * 140) }));
        else if (kind === 'arm') perfs.push(perf({ ...base, kind, arm: { ankleCm: r() * 18, calfReps: Math.floor(r() * 40), storkSec: r() * 45, hopStickBothLegs: r() > 0.5 } }));
        else perfs.push(perf({ ...base, kind, distanceKm: pick([2, 4, 5, 10, 21.1]), climbM: pick([0, 0, 50, 300]), timeSec: t }));
      }
      const res = rate(who, perfs, { streak: r() > 0.5 });
      for (const s of [...STAT_KEYS.map((k) => res.stats[k]), res.race]) {
        if (s.locked) {
          expect(s.value).toBeUndefined();
          expect(s.current).toBeUndefined();
          expect(s.basis).toBeUndefined();
          expect(s.provisional).toBe(false);
          expect(words(s.unlockHint)).toBeGreaterThan(0);
          expect(words(s.unlockHint)).toBeLessThanOrEqual(3);
        } else {
          expect(Number.isInteger(s.value)).toBe(true);
          expect(s.value).toBeGreaterThanOrEqual(40);
          expect(s.value).toBeLessThanOrEqual(99);
          expect(s.value).toBeGreaterThanOrEqual(s.current as number);
          expect(s.basis?.perfIds.length).toBeGreaterThan(0);
          // The basis results are this athlete's own live, verified results up to the as-of date.
          for (const id of s.basis?.perfIds ?? []) {
            const p = perfs.find((x) => x.id === id);
            expect(p && p.verified && !p.deleted && p.date <= AS_OF).toBe(true);
          }
        }
      }
      if (res.ovr.value != null) {
        expect(res.ovr.unlocked).toBeGreaterThanOrEqual(2);
        expect(Number.isInteger(res.ovr.value)).toBe(true);
        expect(res.ovr.value).toBeGreaterThanOrEqual(40);
        expect(res.ovr.value).toBeLessThanOrEqual(99);
      } else expect(res.ovr.display).toBe('—');
      expect(res.ovr.unlocked).toBe(STAT_KEYS.filter((k) => !res.stats[k].locked).length);
      // Caps never count unverified, deleted or future results.
      expect(res.race.caps).toBe(perfs.filter((p) => (p.kind === 'race' || p.kind === 'relay_leg') && p.verified && !p.deleted && p.date <= AS_OF).length);
    }
  });
});
