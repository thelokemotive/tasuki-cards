import { describe, expect, it } from 'vitest';
import type { Athlete, Performance } from '../types';
import { cloneConfig, currentConfig, DEFAULT_CONFIG, RACE_ANCHOR_MIGRATION, RACE_ANCHOR_NOTE, raceAnchorMigration, withDefaults, type Config } from './config';
import { makeLookup } from './perf';
import { DEFAULT_PREDICT, exponentFor, maturationBetween, predictFiveK, shortSourcePenalty, explainPrediction } from './predict';

const cfg = DEFAULT_CONFIG;
const ath: Athlete = { id: 'a', givenName: 'Aiko', familyName: 'Testfield', preferredName: 'Aiko', aliases: [], sex: 'M', yearGroup: 'Y11', yearGroupYear: 2026, displayMode: 'first_initial', absoluteBoardOptOut: false, avatar: { seed: 1, skinTone: 0, hairStyle: 0, hairColour: 0, kitColour: 'academy-navy', accessory: 'none' }, active: true };
let n = 0;
const perf = (o: Partial<Performance>): Performance => ({ id: `p${++n}`, athleteId: 'a', date: '2026-10-04', kind: 'race', verified: true, source: 'coach', rawInput: '', history: [], ...o });
const lk = makeLookup([], []);

describe('youth-adjusted Riegel exponent', () => {
  it('falls with age and rises for short source races', () => {
    expect(exponentFor(15, 3, DEFAULT_PREDICT)).toBeCloseTo(1.08, 9);
    expect(exponentFor(12, 3, DEFAULT_PREDICT)).toBeCloseTo(1.11, 9);
    expect(exponentFor(15, 1.5, DEFAULT_PREDICT)).toBeCloseTo(1.095, 9);
    expect(exponentFor(15, 10, DEFAULT_PREDICT)).toBeCloseTo(1.08, 9);
    expect(shortSourcePenalty(2.5, DEFAULT_PREDICT)).toBeGreaterThan(0);
    expect(shortSourcePenalty(2.5, DEFAULT_PREDICT)).toBeLessThan(0.008);
  });
  it('growth compounds year by year by sex', () => {
    expect(maturationBetween('M', 15, 16, DEFAULT_PREDICT)).toBeCloseTo(1.2, 9);
    expect(maturationBetween('F', 14, 15, DEFAULT_PREDICT)).toBeCloseTo(0, 9);
    expect(maturationBetween('M', 15.5, 15, DEFAULT_PREDICT)).toBe(0);
  });
});

describe('5 km prediction', () => {
  it('a 4 km race projects with b; an older, much slower parkrun is not a full effort; a CI and targets follow', () => {
    const p = predictFiveK(ath, [perf({ distanceKm: 4, timeSec: 1049 }), perf({ kind: 'parkrun', distanceKm: 5, timeSec: 1559, date: '2025-10-04' })], lk, cfg, '2026-11-11')!;
    const used = p.sources.filter((s) => s.used);
    expect(used).toHaveLength(1);
    expect(used[0].fiveKThen).toBeCloseTo(1049 * Math.pow(5 / 4, used[0].exponent), 6);
    expect(p.sources.find((s) => !s.used)?.note).toMatch(/not a full effort/);
    expect(p.lowSec).toBeLessThan(p.predictedSec);
    expect(p.highSec).toBeGreaterThan(p.predictedSec);
    expect(p.realisticSec).toBeLessThan(p.predictedSec);
    expect(p.stretchSec).toBeLessThan(p.realisticSec);
    expect(p.targetBasis).toBe('prediction');
  });

  it('more agreeing results narrow the interval', () => {
    const one = predictFiveK(ath, [perf({ distanceKm: 4, timeSec: 1049 })], lk, cfg, '2026-11-11')!;
    const three = predictFiveK(ath, [perf({ distanceKm: 4, timeSec: 1049 }), perf({ distanceKm: 3, timeSec: 765, date: '2026-10-20' }), perf({ kind: 'parkrun', distanceKm: 5, timeSec: 1300, date: '2026-10-25' })], lk, cfg, '2026-11-11')!;
    expect(three.plusMinusPct).toBeLessThan(one.plusMinusPct);
  });

  it('never sets a target slower than an actual 5 km PB', () => {
    const p = predictFiveK(ath, [perf({ distanceKm: 3, timeSec: 900 }), perf({ kind: 'parkrun', distanceKm: 5, timeSec: 1450, date: '2026-09-01' })], lk, cfg, '2026-11-11')!;
    expect(p.predictedSec).toBeGreaterThan(1450);
    expect(p).toMatchObject({ targetBasis: 'pb', realisticSec: 1450, best5kSec: 1450 });
    expect(p.stretchSec).toBeLessThan(1450);
    expect(explainPrediction(p, 'Aiko').join(' ')).toMatch(/get back to that PB/);
  });

  it('nothing usable: no prediction; unverified and too-old results are ignored', () => {
    expect(predictFiveK(ath, [], lk, cfg, '2026-11-11')).toBeUndefined();
    expect(predictFiveK(ath, [perf({ distanceKm: 4, timeSec: 1049, verified: false }), perf({ distanceKm: 4, timeSec: 1049, date: '2024-01-01' })], lk, cfg, '2026-11-11')).toBeUndefined();
  });
});

describe('a fast short time trial cannot throw out a real 5 km', () => {
  it('a 1:32 for 550 m and a 21:30 parkrun: both used, and the estimate stays close to the parkrun', () => {
    const pr = predictFiveK(ath, [perf({ distanceKm: 0.55, timeSec: 92, date: '2026-10-20' }), perf({ kind: 'parkrun', distanceKm: 5, timeSec: 1290, date: '2026-10-10' })], lk, cfg, '2026-11-16')!;
    expect(pr.sources.every((s) => s.used)).toBe(true);
    expect(pr.predictedSec).toBeGreaterThan(1290 * 0.95);
    expect(pr.predictedSec).toBeLessThan(1290);
  });
  it('a jogged 5 km is still left out when there is a faster one', () => {
    const pr = predictFiveK(ath, [perf({ kind: 'parkrun', distanceKm: 5, timeSec: 1290, date: '2026-10-10' }), perf({ kind: 'parkrun', distanceKm: 5, timeSec: 1600, date: '2026-10-17' })], lk, cfg, '2026-11-16')!;
    expect(pr.sources.filter((s) => s.used)).toHaveLength(1);
  });
});

describe('a shorter result cannot rule out an official race (18 Nov 2026)', () => {
  // A fast 2 km time trial (unofficial) and a 5 km cross-country race on a hilly course whose climb was not recorded.
  const tt = { id: 'ev-tt', name: '2 km time trial', date: '2026-10-20', kind: 'time_trial', official: false } as const;
  const xc = { id: 'ev-xc', name: 'Prefectural XC', date: '2026-10-25', kind: 'race', official: true } as const;
  const lkEv = makeLookup([], [tt, xc]);
  const runs = () => [perf({ eventId: 'ev-tt', distanceKm: 2, timeSec: 360, date: '2026-10-20' }), perf({ eventId: 'ev-xc', distanceKm: 5, timeSec: 1170, date: '2026-10-25' })];
  const off = (() => {
    const c = cloneConfig(cfg);
    c.predict.raceOnlyRuledOutByLonger = false;
    return c;
  })();

  it('the race is kept and carries the estimate; under the old rule the time trial threw it out', () => {
    const before = predictFiveK(ath, runs(), lkEv, off, '2026-11-16')!;
    expect(before.sources.find((s) => s.officialRace)?.used).toBe(false);
    const now = predictFiveK(ath, runs(), lkEv, cfg, '2026-11-16')!;
    expect(now.sources.every((s) => s.used)).toBe(true);
    const race = now.sources.find((s) => s.officialRace)!;
    expect(race.weight).toBeGreaterThan(now.sources.find((s) => !s.officialRace)!.weight * 4);
    expect(now.predictedSec).toBeGreaterThan(before.predictedSec);
    // The two disagree, so the interval is wider than the race alone would give.
    const raceOnly = predictFiveK(ath, [runs()[1]], lkEv, cfg, '2026-11-16')!;
    expect(now.plusMinusPct).toBeGreaterThan(raceOnly.plusMinusPct);
  });

  it('a faster race at least as long still rules a slow race out', () => {
    const pr = predictFiveK(ath, [...runs(), perf({ distanceKm: 5, timeSec: 1000, date: '2026-11-01' })], lkEv, cfg, '2026-11-16')!;
    const slow = pr.sources.find((s) => s.timeSec === 1170)!;
    expect(slow.used).toBe(false);
    expect(slow.note).toMatch(/from a race this long or longer: probably not a full effort/);
  });

  it('a parkrun is not a race: a jogged one is still ruled out by a shorter, faster result', () => {
    const pr = predictFiveK(ath, [perf({ distanceKm: 3, timeSec: 600, date: '2026-10-20' }), perf({ kind: 'parkrun', distanceKm: 5, timeSec: 1500, date: '2026-10-25' })], lk, cfg, '2026-11-16')!;
    expect(pr.sources.find((s) => s.km === 5)?.used).toBe(false);
  });

  it('the explanation says so when a result is left out', () => {
    const pr = predictFiveK(ath, [...runs(), perf({ distanceKm: 5, timeSec: 1000, date: '2026-11-01' })], lkEv, cfg, '2026-11-16')!;
    expect(explainPrediction(pr, 'Aiko', cfg.predict).join(' ')).toMatch(/cannot rule out a real race/);
    expect(explainPrediction(pr, 'Aiko', off.predict).join(' ')).not.toMatch(/cannot rule out a real race/);
  });
});

describe('the race-anchor config version', () => {
  it('arrives once, as its own version, for a store made before it; the older version is read with the rule off', () => {
    const stored = { ...JSON.parse(JSON.stringify(cfg)), version: 5 } as Config;
    delete (stored.predict as Partial<Config['predict']>).raceOnlyRuledOutByLonger;
    expect(withDefaults(stored).predict.raceOnlyRuledOutByLonger).toBe(false);
    // Reading the old version reproduces its prediction.
    const tt = { id: 'ev-tt', name: '2 km time trial', date: '2026-10-20', kind: 'time_trial', official: false } as const;
    const lkEv = makeLookup([], [tt]);
    const runs = [perf({ eventId: 'ev-tt', distanceKm: 2, timeSec: 360, date: '2026-10-20' }), perf({ distanceKm: 5, timeSec: 1170, date: '2026-10-25' })];
    expect(predictFiveK(ath, runs, lkEv, withDefaults(stored), '2026-11-16')!.sources.filter((s) => s.used)).toHaveLength(1);
    const v6 = raceAnchorMigration([stored], '2026-11-18T00:00:00.000Z')!;
    expect(v6).toMatchObject({ version: 6, note: RACE_ANCHOR_NOTE, migration: RACE_ANCHOR_MIGRATION });
    expect(v6.predict.raceOnlyRuledOutByLonger).toBe(true);
    expect(currentConfig([stored, v6]).predict.raceOnlyRuledOutByLonger).toBe(true);
    expect(predictFiveK(ath, runs, lkEv, currentConfig([stored, v6]), '2026-11-16')!.sources.every((s) => s.used)).toBe(true);
    expect(raceAnchorMigration([stored, v6], 'later')).toBeUndefined();
  });
  it('a new store starts with the rule on and needs no migration; a coach who switches it off keeps that', () => {
    expect(raceAnchorMigration([cfg], 'x')).toBeUndefined();
    const offLater = { ...cloneConfig(cfg), version: 2 };
    offLater.predict.raceOnlyRuledOutByLonger = false;
    expect(raceAnchorMigration([cfg, offLater], 'x')).toBeUndefined();
  });
});
