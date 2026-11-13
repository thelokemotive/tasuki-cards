import { describe, expect, it } from 'vitest';
import type { Course, Performance } from '../types';
import { cloneConfig, DEFAULT_CONFIG } from './config';
import { makeLookup } from './perf';
import { handicapStartSheet } from './handicap';

// Fictional runners: Aiko Testfield, Ben Sampleton, Hana Mockridge, Dai Exampleton, Kei Placeholder.
const cfg = DEFAULT_CONFIG;
const circuit: Course = { id: 'c-circuit', name: 'Campus Circuit', kind: 'circuit', distanceKm: 1.3, climbM: 0, terrainFactor: 1, benchmarkMode: 'age_grade', version: 1 };
const hill: Course = { ...circuit, id: 'c-hill', name: 'Hill Loop', kind: 'climb' };
const lookup = makeLookup([circuit, hill], []);

let n = 0;
const circ = (athleteId: string, timeSec: number, extra: Partial<Performance> = {}): Performance => {
  n++;
  return { id: `p${n}`, athleteId, date: '2026-10-01', kind: 'circuit', courseId: circuit.id, timeSec, verified: true, source: 'coach', rawInput: '', history: [], ...extra };
};

const perfs = [
  circ('aiko', 310),
  circ('aiko', 300), // Aiko PB 300 (the slowest PB)
  circ('ben', 288), // Ben PB 288
  circ('hana', 251), // Hana PB 251
  circ('hana', 230, { verified: false }), // unverified: ignored
  circ('hana', 220, { deleted: true }), // deleted: ignored
  circ('dai', 287.5), // Dai PB 287.5
  circ('kei', 200, { courseId: hill.id }), // another course: Kei has no Circuit PB
];

describe('handicapStartSheet (spec 3.14)', () => {
  it('offsets = slowest PB − PB, rounded to 5 s, in start order', () => {
    const rows = handicapStartSheet({ athleteIds: ['aiko', 'ben', 'hana', 'dai', 'kei'], perfs, lookup, courseId: circuit.id, config: cfg });
    // Slowest PB = 300 (Aiko).
    //   Aiko 300 − 300 = 0   → 0
    //   Ben  300 − 288 = 12  → 12 / 5 = 2.4 → 2 × 5 = 10
    //   Dai  300 − 287.5 = 12.5 → 2.5 → rounds up to 3 × 5 = 15
    //   Hana 300 − 251 = 49  → 9.8 → 10 × 5 = 50
    //   Kei  no PB → first wave, offset 0, ahead of Aiko (ties: no-PB runners first)
    expect(rows.map((r) => [r.athleteId, r.pbSec, r.offsetSec])).toEqual([
      ['kei', undefined, 0],
      ['aiko', 300, 0],
      ['ben', 288, 10],
      ['dai', 287.5, 15],
      ['hana', 251, 50],
    ]);
    expect(rows[1].pbPerfId).toBe(perfs[1].id);
  });

  it('ties on offset start the slower PB first', () => {
    // Ben 288 → 10; a 289 runner: 300 − 289 = 11 → 2.2 → 10. Same offset: 289 (slower) starts first.
    const rows = handicapStartSheet({ athleteIds: ['ben', 'aiko', 'hana'], perfs: [...perfs, circ('extra', 289)], lookup, courseId: circuit.id, config: cfg });
    const rows2 = handicapStartSheet({ athleteIds: ['ben', 'extra'], perfs: [...perfs, circ('extra', 289)], lookup, courseId: circuit.id, config: cfg });
    expect(rows.map((r) => r.athleteId)).toEqual(['aiko', 'ben', 'hana']);
    // With only Ben and the 289 runner, the slowest PB is 289: 289 → 0, Ben 1 s → 0.2 → 0. Slower PB first.
    expect(rows2.map((r) => [r.athleteId, r.offsetSec])).toEqual([
      ['extra', 0],
      ['ben', 0],
    ]);
  });

  it('rounding step comes from config; nobody with a PB → everyone in the first wave', () => {
    const one = cloneConfig(cfg);
    one.handicap.roundSec = 1;
    const rows = handicapStartSheet({ athleteIds: ['aiko', 'ben', 'hana'], perfs, lookup, courseId: circuit.id, config: one });
    expect(rows.map((r) => r.offsetSec)).toEqual([0, 12, 49]);
    const none = handicapStartSheet({ athleteIds: ['kei', 'new'], perfs, lookup, courseId: circuit.id, config: cfg });
    expect(none).toEqual([
      { athleteId: 'kei', offsetSec: 0 },
      { athleteId: 'new', offsetSec: 0 },
    ]);
  });

  it('ignores duplicate ids and runners not on the list', () => {
    const rows = handicapStartSheet({ athleteIds: ['ben', 'ben', 'hana'], perfs, lookup, courseId: circuit.id, config: cfg });
    // Slowest PB among Ben and Hana = 288: Ben 0; Hana 288 − 251 = 37 → 7.4 → 35.
    expect(rows.map((r) => [r.athleteId, r.offsetSec])).toEqual([
      ['ben', 0],
      ['hana', 35],
    ]);
  });
});

describe('handicap from 5K predictions (any course)', () => {
  it('slowest predicted runner goes first; the gap is the difference in predicted course times', async () => {
    const { handicapFromPredictions } = await import('./handicap');
    const { DEFAULT_CONFIG } = await import('./config');
    const rows = handicapFromPredictions({
      athletes: [
        { id: 'fast', age: 15.5, predicted5kSec: 1200 },
        { id: 'slow', age: 15.5, predicted5kSec: 1800 },
        { id: 'none', age: 15.5 },
      ],
      distanceKm: 3.5,
      climbM: 500,
      config: DEFAULT_CONFIG,
    });
    // D_eff = 3.5 + 5 = 8.5 km; both scale by the same factor, so the gap is 600 × (8.5/5)^b
    expect(rows.map((r) => r.athleteId)).toEqual(['none', 'slow', 'fast']);
    const b = 1.08; // age 15
    expect(rows[2].offsetSec).toBe(Math.round((600 * Math.pow(8.5 / 5, b)) / 5) * 5);
    expect(rows[1].offsetSec).toBe(0);
  });
});
