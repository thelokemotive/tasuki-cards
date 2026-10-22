import { describe, expect, it } from 'vitest';
import type { Athlete, Course, ManualAchievement, Performance, TasukiEvent } from '../types';
import type { CourseRecord, StreakResult, StreakWeek, SurgeResult } from './types';
import { DEFAULT_CONFIG } from './config';
import { addWeeks } from './dates';
import { makeLookup } from './perf';
import { badgeRow, computeBadges } from './badges';

// Fictional athlete "Ben Sampleton" (Y12); "Hana Mockridge" appears only to check filtering.
const cfg = DEFAULT_CONFIG;
const circuit: Course = { id: 'c-circuit', name: 'Campus Circuit', kind: 'circuit', distanceKm: 1.3, climbM: 0, terrainFactor: 1, benchmarkMode: 'age_grade', version: 1 };
const ev = (id: string, date: string): TasukiEvent => ({ id, name: `Fictional Ekiden ${id}`, date, kind: 'relay', distanceKm: 2, official: true });
const lookup = makeLookup([circuit], [ev('E1', '2026-11-01'), ev('E2', '2026-11-08')]);

const ben: Athlete = {
  id: 'ben',
  givenName: 'Ben',
  familyName: 'Sampleton',
  preferredName: 'Ben',
  aliases: [],
  sex: 'M',
  yearGroup: 'Y12',
  yearGroupYear: 2026,
  displayMode: 'first_initial',
  absoluteBoardOptOut: false,
  avatar: { seed: 1, skinTone: 0, hairStyle: 0, hairColour: 0, kitColour: 'academy-navy', accessory: 'none' },
  active: true,
};

let n = 0;
function perf(p: Partial<Performance> & Pick<Performance, 'date' | 'kind'>, athleteId = 'ben'): Performance {
  n++;
  return { id: `p${n}`, athleteId, verified: true, source: 'coach', rawInput: '', history: [], ...p };
}

const parkrun1 = perf({ date: '2026-09-05', kind: 'parkrun', distanceKm: 5, timeSec: 1250 });
const parkrun2 = perf({ date: '2026-09-12', kind: 'parkrun', distanceKm: 5, timeSec: 1240 });
const tenK = perf({ date: '2026-09-20', kind: 'race', distanceKm: 10, timeSec: 2500 });
const arm1 = perf({ date: '2026-09-15', kind: 'arm', arm: { ankleCm: 10, calfReps: 12, storkSec: 3 } }); // ankle L3, calf L1, balance L0
const half = perf({ date: '2026-10-04', kind: 'race', distanceKm: 21.0975, timeSec: 5400 });
const arm2 = perf({ date: '2026-10-15', kind: 'arm', arm: { ankleCm: 8, calfReps: 22, storkSec: 31, hopStickBothLegs: true } }); // ankle L2, calf L3, balance L5
const climb = perf({ date: '2026-10-18', kind: 'climb', distanceKm: 5, climbM: 1000, timeSec: 3600 }); // 1,000 m: Mountain
const leg1 = perf({ date: '2026-11-01', kind: 'relay_leg', eventId: 'E1', timeSec: 420 });
const leg2 = perf({ date: '2026-11-08', kind: 'relay_leg', eventId: 'E2', timeSec: 430 });
const ultra = perf({ date: '2026-11-15', kind: 'long_run', distanceKm: 50, climbM: 1200, timeSec: 25000 }); // marathon + ultra
const perfs: Performance[] = [
  parkrun1,
  parkrun2,
  tenK,
  arm1,
  half,
  arm2,
  climb,
  leg1,
  leg2,
  ultra,
  perf({ date: '2026-10-10', kind: 'race', distanceKm: 42.195, timeSec: 11000, verified: false }), // unverified: no cap, no marathon
  perf({ date: '2026-12-20', kind: 'race', distanceKm: 64, climbM: 2800, timeSec: 35000 }), // after asOf
  perf({ date: '2026-09-01', kind: 'race', distanceKm: 100, timeSec: 40000 }, 'hana'), // someone else
];

// Streak: W36–W44 with a holiday in W39. Counted weeks reach 4 in W40 (Mon 28 Sep) and 8 in W44 (Mon 26 Oct).
const states: StreakWeek['state'][] = ['counted', 'counted', 'counted', 'holiday', 'counted', 'counted', 'counted', 'counted', 'counted'];
const streak: StreakResult = {
  athleteId: 'ben',
  currentStreak: 8,
  bestStreak: 8,
  status: 'active',
  holidayBonusFlames: 0,
  weeks: states.map((state, i) => ({ week: addWeeks('2026-W36', i), state, holidayBonus: false })),
};

const surge = (perfId: string, athleteId: string, eventId: string, medal?: 'bronze' | 'gold'): SurgeResult => ({ perfId, athleteId, eventId, legTimeSec: 420, gateCorrectionPct: 0, noBaseline: false, medal });
const surges = [surge(leg1.id, 'ben', 'E1', 'gold'), surge(leg2.id, 'ben', 'E2', 'bronze'), surge('p-other', 'hana', 'E1', 'gold')];

const record = (athleteId: string, band: CourseRecord['band']): CourseRecord => ({ courseId: 'c-circuit', sex: 'M', band, athleteId, perfId: 'p-rec', timeSec: 270, date: '2026-10-05', yearGroupAtTime: 'Y12' });
const courseRecords = [record('ben', 'Y12-13'), record('hana', 'Y9-11')];

const ach = (id: string, type: ManualAchievement['type'], name: string, date: string, athleteId = 'ben'): ManualAchievement => ({ id, athleteId, type, name, date, icon: type === 'expedition' ? '🧭' : '🎖️' });
const achievements = [
  ach('a1', 'expedition', 'Matsushima Escape 2026', '2026-11-20'),
  ach('a2', 'custom', 'Kit monitor', '2026-10-01'),
  ach('a3', 'expedition', 'Future Trip', '2027-03-01'), // after asOf
  ach('a4', 'custom', 'Not Ben', '2026-10-01', 'hana'),
];

const all = () => computeBadges({ athlete: ben, perfs, lookup, config: cfg, asOf: '2026-11-30', streak, surges, courseRecords, achievements });

describe('computeBadges (spec 3.13)', () => {
  it('derives every badge type, in the spec order', () => {
    expect(all().map((b) => [b.key, b.label])).toEqual([
      ['caps', '4 race caps'], // verified race and relay_leg: 10K, half, two relay legs (the unverified marathon is not a cap)
      ['parkrun', '2 parkruns'],
      ['distance-5k', 'First 5K'],
      ['distance-10k', 'First 10K'],
      ['distance-half', 'First half marathon'],
      ['distance-marathon', 'First marathon'],
      ['distance-ultra', 'First ultra'],
      ['mountain', 'Mountain (1,000 m+ climb)'],
      ['streak-4', '4-week streak'],
      ['streak-8', '8-week streak'],
      ['arm-ankle', 'Ankle L3'],
      ['arm-calf', 'Calf L3'],
      ['arm-balance', 'Balance L5'],
      [`surge:${leg1.id}`, 'Tasuki Surge gold · Fictional Ekiden E1'],
      [`surge:${leg2.id}`, 'Tasuki Surge bronze · Fictional Ekiden E2'],
      ['record:c-circuit:M:Y12-13', 'Campus Circuit record · Y12–13 boys'],
      ['expedition:a1', 'Matsushima Escape 2026'],
      ['custom:a2', 'Kit monitor'],
    ]);
  });

  it('counters carry a count; first-time badges carry the date and performance that earned them', () => {
    const by = Object.fromEntries(all().map((b) => [b.key, b]));
    expect(by.caps).toMatchObject({ kind: 'caps', icon: '★', count: 4, date: '2026-11-08', perfId: leg2.id });
    expect(by.parkrun).toMatchObject({ count: 2, date: '2026-09-12' });
    expect(by['distance-5k']).toMatchObject({ date: '2026-09-05', perfId: parkrun1.id }); // first run ≥ 5 km
    expect(by['distance-10k'].perfId).toBe(tenK.id);
    expect(by['distance-half'].perfId).toBe(half.id); // 21.0975 ≥ 21.0975
    expect(by['distance-marathon'].perfId).toBe(ultra.id); // the unverified 42.195 km race does not count
    expect(by['distance-ultra'].perfId).toBe(ultra.id); // 50 > 42.2
    expect(by.mountain.perfId).toBe(climb.id); // 1,000 m ≥ 1,000 m, before the 1,200 m ultra
    expect(by['streak-4'].date).toBe('2026-09-28'); // 4th counted week = W40 (the W39 holiday holds the run)
    expect(by['streak-8'].date).toBe('2026-10-26'); // 8th = W44
    expect(by['arm-ankle']).toMatchObject({ count: 3, perfId: arm1.id }); // ankle never falls on a weaker retest
    expect(by['arm-balance']).toMatchObject({ count: 5, perfId: arm2.id }); // 31 s ≥ 30 s and hop-and-stick both legs
    expect(by[`surge:${leg1.id}`]).toMatchObject({ kind: 'surge', tier: 'gold', date: '2026-11-01' });
    expect(by['expedition:a1']).toMatchObject({ kind: 'expedition', icon: '🧭', date: '2026-11-20' });
  });

  it('an ultra is strictly beyond 42.2 km; one cap reads singular', () => {
    const p = [perf({ date: '2026-10-01', kind: 'race', distanceKm: 42.2, timeSec: 12000 })];
    const b = computeBadges({ athlete: ben, perfs: p, lookup, config: cfg, asOf: '2026-11-30', streak: { ...streak, bestStreak: 3, weeks: [] }, surges: [], courseRecords: [], achievements: [] });
    expect(b.map((x) => x.label)).toEqual(['1 race cap', 'First 5K', 'First 10K', 'First half marathon', 'First marathon']);
  });

  it('streak milestones come from bestStreak, so a broken streak keeps its badges', () => {
    const broken: StreakResult = { ...streak, currentStreak: 0, bestStreak: 12, status: 'broken' };
    const keys = computeBadges({ athlete: ben, perfs: [], lookup, config: cfg, asOf: '2026-11-30', streak: broken, surges: [], courseRecords: [], achievements: [] }).map((b) => b.key);
    expect(keys).toEqual(['streak-4', 'streak-8', 'streak-12']);
  });

  it('nothing earned → no badges', () => {
    const none: StreakResult = { athleteId: 'ben', currentStreak: 0, bestStreak: 0, status: 'none', holidayBonusFlames: 0, weeks: [] };
    expect(computeBadges({ athlete: ben, perfs: [], lookup, config: cfg, asOf: '2026-11-30', streak: none, surges: [], courseRecords: [], achievements: [] })).toEqual([]);
  });
});

describe('badgeRow', () => {
  it('shows up to 5, most prestigious first, one per kind before repeats', () => {
    // Prestige: record 100; ultra 35 + 15 × 4 = 95; Surge gold 90; expedition 80; marathon 80; Mountain 75;
    // half 65; Surge bronze 65; custom 60; 8-week streak 58; 4-week 54; Balance L5 30 + 20 = 50; 10K 50;
    // caps 40 + 4 = 44; Ankle/Calf L3 42; 5K 35; parkruns 30 + 2 = 32.
    expect(badgeRow(all()).map((b) => b.key)).toEqual(['record:c-circuit:M:Y12-13', 'distance-ultra', `surge:${leg1.id}`, 'expedition:a1', 'mountain']);
  });

  it('fills spare places with the next most prestigious once every kind is shown', () => {
    // 10 kinds; the 11th and 12th places go to the marathon (80) and the bronze Surge (65, newer than the half).
    expect(badgeRow(all(), 12).map((b) => b.key)).toEqual([
      'record:c-circuit:M:Y12-13',
      'distance-ultra',
      `surge:${leg1.id}`,
      'expedition:a1', // 80, 20 Nov: newer than the marathon (15 Nov)
      'distance-marathon',
      'mountain',
      `surge:${leg2.id}`,
      'custom:a2',
      'streak-8',
      'arm-balance',
      'caps',
      'parkrun',
    ]);
  });

  it('a short list is returned whole, sorted', () => {
    const b = all().filter((x) => x.kind === 'caps' || x.kind === 'streak');
    expect(badgeRow(b).map((x) => x.key)).toEqual(['streak-8', 'streak-4', 'caps']);
  });
});
