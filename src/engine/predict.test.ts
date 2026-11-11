import { describe, expect, it } from 'vitest';
import type { Athlete, Performance } from '../types';
import { DEFAULT_CONFIG } from './config';
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
