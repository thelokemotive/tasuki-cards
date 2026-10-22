import { describe, expect, it } from 'vitest';
import type { Athlete, Course, Performance, Sex, TasukiEvent, YearGroup } from '../types';
import type { PerfScore, RatingKey } from './types';
import { DEFAULT_CONFIG } from './config';
import { makeLookup } from './perf';
import { computeCourseRecords, computeInForm, computePersonalBests, courseTimeOf } from './pbs';

// Fictional athletes only: Aiko Testfield, Ben Sampleton, Hana Mockridge, Coach Example.
const cfg = DEFAULT_CONFIG;
const course = (id: string, name: string, kind: Course['kind'], distanceKm: number): Course => ({ id, name, kind, distanceKm, climbM: 0, terrainFactor: 1, benchmarkMode: 'age_grade', version: 1 });
const circuit = course('c-circuit', 'Campus Circuit', 'circuit', 1.3);
const descent = course('c-descent', 'Gondola Descent', 'descent', 0.8);
const navCourse = course('c-nav', 'Forest Nav', 'nav', 2);
const xc: TasukiEvent = { id: 'e-xc', name: 'Fictional XC', date: '2026-11-01', kind: 'race', distanceKm: 4, official: true };
const lookup = makeLookup([circuit, descent, navCourse], [xc]);

let n = 0;
function perf(athleteId: string, p: Partial<Performance> & Pick<Performance, 'date' | 'kind'>): Performance {
  n++;
  return { id: `p${n}`, athleteId, verified: true, source: 'coach', rawInput: '', history: [], ...p };
}
const circ = (athleteId: string, date: string, timeSec: number, extra: Partial<Performance> = {}) => perf(athleteId, { date, kind: 'circuit', courseId: circuit.id, timeSec, ...extra });

function athlete(id: string, givenName: string, sex: Sex, yearGroup: YearGroup): Athlete {
  return {
    id,
    givenName,
    familyName: 'Testfield',
    preferredName: givenName,
    aliases: [],
    sex,
    yearGroup,
    yearGroupYear: 2026,
    displayMode: 'first_initial',
    absoluteBoardOptOut: false,
    avatar: { seed: 1, skinTone: 0, hairStyle: 0, hairColour: 0, kitColour: 'academy-navy', accessory: 'none' },
    active: true,
  };
}

describe('computePersonalBests (spec 7)', () => {
  const aiko = [
    circ('aiko', '2026-09-30', 310), // first Circuit: PB, no previous best
    circ('aiko', '2026-10-07', 300), // PB −10 s
    circ('aiko', '2026-10-14', 305), // slower
    circ('aiko', '2026-10-21', 300), // equal: not a PB
    circ('aiko', '2026-10-28', 296), // PB −4 s
    circ('aiko', '2026-10-29', 280, { verified: false }), // unverified: ignored
    circ('aiko', '2026-10-30', 270, { deleted: true }), // deleted: ignored
    perf('aiko', { date: '2026-10-03', kind: 'race', distanceKm: 4, timeSec: 1000 }), // dist:4.00
    perf('aiko', { date: '2026-11-01', kind: 'race', eventId: xc.id, timeSec: 975 }), // event distance 4 km: PB −25 s
    perf('aiko', { date: '2026-10-10', kind: 'parkrun', distanceKm: 5, timeSec: 1500 }), // dist:5.00
    perf('aiko', { date: '2026-11-01', kind: 'relay_leg', distanceKm: 4, timeSec: 900 }), // relay legs excluded
    perf('aiko', { date: '2026-10-11', kind: 'long_run', courseId: circuit.id, distanceKm: 5.2, timeSec: 1400 }), // 4 laps: dist:5.20, not a Circuit time
    perf('aiko', { date: '2026-10-12', kind: 'bleep', bleepLaps: 50 }),
    perf('aiko', { date: '2026-11-10', kind: 'bleep', bleepLaps: 53 }), // +3 laps
    perf('aiko', { date: '2026-10-12', kind: 'arm', arm: { ankleCm: 9, calfReps: 18, storkSec: 22 } }),
    perf('aiko', { date: '2026-11-10', kind: 'arm', arm: { ankleCm: 11, calfReps: 16 } }), // ankle +2 cm; calf lower
    perf('aiko', { date: '2026-10-15', kind: 'descent', courseId: descent.id, timeSec: 150, cleanRun: false }), // never scored
    perf('aiko', { date: '2026-10-16', kind: 'descent', courseId: descent.id, timeSec: 170, cleanRun: true }),
    perf('aiko', { date: '2026-10-17', kind: 'nav', courseId: navCourse.id, timeSec: 900, navErrors: 1, routeKmEff: 2 }), // NAV runs excluded
  ];

  it('keeps one current PB per course, distance, bleep and ARM measure', () => {
    const { current } = computePersonalBests(aiko, lookup);
    expect(current.map((pb) => [pb.key, pb.label, pb.value])).toEqual([
      ['course:c-circuit', 'Campus Circuit', 296],
      ['course:c-descent', 'Gondola Descent', 170],
      ['dist:4.00', '4 km', 975],
      ['dist:5.00', '5 km', 1500],
      ['dist:5.20', '5.2 km', 1400],
      ['bleep', 'Bleep test', 53],
      ['arm:ankle', 'Ankle (knee-to-wall)', 11],
      ['arm:calf', 'Calf raises', 18],
      ['arm:stork', 'Stork balance', 22],
    ]);
    expect(current.find((pb) => pb.key === 'bleep')?.measure).toBe('count');
    expect(current.find((pb) => pb.key === 'dist:4.00')?.measure).toBe('time');
  });

  it('history lists every PB-setting result in date order', () => {
    const circuitHistory = computePersonalBests(aiko, lookup).history.filter((pb) => pb.key === 'course:c-circuit');
    expect(circuitHistory.map((pb) => [pb.date, pb.value, pb.previousBest, pb.improvement])).toEqual([
      ['2026-09-30', 310, undefined, undefined],
      ['2026-10-07', 300, 310, 10],
      ['2026-10-28', 296, 300, 4],
    ]);
    expect(circuitHistory[2].previousPerfId).toBe(circuitHistory[1].perfId);
    const all = computePersonalBests(aiko, lookup).history;
    expect(all.map((pb) => pb.date)).toEqual([...all.map((pb) => pb.date)].sort());
    const ankle = all.filter((pb) => pb.key === 'arm:ankle');
    expect(ankle.at(-1)).toMatchObject({ value: 11, previousBest: 9, improvement: 2 });
  });

  it('courseTimeOf: course runs only, at the course distance', () => {
    expect(courseTimeOf(circ('ben', '2026-10-01', 290), lookup)?.course.id).toBe('c-circuit');
    expect(courseTimeOf(circ('ben', '2026-10-01', 290, { distanceKm: 1.3 }), lookup)?.timeSec).toBe(290);
    expect(courseTimeOf(circ('ben', '2026-10-01', 290, { distanceKm: 2.6 }), lookup)).toBeUndefined();
    expect(courseTimeOf(circ('ben', '2026-10-01', 290, { kind: 'relay_leg' }), lookup)).toBeUndefined();
  });
});

function score(perfId: string, date: string, feeds: RatingKey[], s: number, fresh = s): PerfScore {
  return { perfId, athleteId: 'aiko', date, kind: 'circuit', feeds, score: s, fresh, penalty: s - fresh, monthsOld: 0, expired: false, age: 14, ageEstimated: true, provisional: false, configVersion: 1 };
}

describe('computeInForm (spec 3.10)', () => {
  const c1 = circ('aiko', '2026-11-04', 300);
  const c2 = circ('aiko', '2026-11-11', 288);
  const perfs = [c1, c2];

  it('raw path: a PB on the same course within the last 7 days', () => {
    // 300 → 288: improvement 12 s → 'PB −12 s'.
    const f = computeInForm({ athleteId: 'aiko', perfs, perfScores: [], lookup, config: cfg, asOf: '2026-11-15' });
    expect(f).toEqual([{ athleteId: 'aiko', perfId: c2.id, date: '2026-11-11', type: 'raw', label: 'Campus Circuit', text: 'PB −12 s', improvement: 12 }]);
  });

  it('the window is asOf − 6 … asOf (7 days including asOf)', () => {
    expect(computeInForm({ athleteId: 'aiko', perfs, perfScores: [], lookup, config: cfg, asOf: '2026-11-17' })).toHaveLength(1); // 6 days after
    expect(computeInForm({ athleteId: 'aiko', perfs, perfScores: [], lookup, config: cfg, asOf: '2026-11-18' })).toHaveLength(0); // 7 days after
    expect(computeInForm({ athleteId: 'aiko', perfs, perfScores: [], lookup, config: cfg, asOf: '2026-11-10' })).toHaveLength(0); // before the PB
  });

  it('a first-ever result is not In-Form', () => {
    expect(computeInForm({ athleteId: 'aiko', perfs: [c2], perfScores: [], lookup, config: cfg, asOf: '2026-11-12' })).toEqual([]);
  });

  it('counts and larger time gains', () => {
    const p = [
      perf('aiko', { date: '2026-10-12', kind: 'bleep', bleepLaps: 50 }),
      perf('aiko', { date: '2026-11-10', kind: 'bleep', bleepLaps: 53 }),
      perf('aiko', { date: '2026-10-03', kind: 'race', distanceKm: 4, timeSec: 1040 }),
      perf('aiko', { date: '2026-11-09', kind: 'race', distanceKm: 4, timeSec: 975 }),
      perf('aiko', { date: '2026-10-12', kind: 'arm', arm: { calfReps: 18 } }),
      perf('aiko', { date: '2026-11-11', kind: 'arm', arm: { calfReps: 19 } }),
    ];
    const f = computeInForm({ athleteId: 'aiko', perfs: p, perfScores: [], lookup, config: cfg, asOf: '2026-11-12' });
    expect(f.map((x) => x.text)).toEqual(['+1 rep', '+3 laps', 'PB −1:05']); // newest first; 1040 − 975 = 65 s
  });

  it('score path: a new best unpenalised score for a stat', () => {
    // SPD 71 (4 Nov) then 74 (11 Nov). The fresh (penalised) value is ignored: the unpenalised score counts.
    const perfScores = [score(c1.id, '2026-11-04', ['SPD'], 71), score(c2.id, '2026-11-11', ['SPD'], 74, 70)];
    const f = computeInForm({ athleteId: 'aiko', perfs, perfScores, lookup, config: cfg, asOf: '2026-11-15' });
    expect(f.map((x) => [x.type, x.text])).toEqual([
      ['raw', 'PB −12 s'],
      ['score', 'SPD 71 → 74'],
    ]);
    expect(f[1]).toMatchObject({ stat: 'SPD', label: 'Speed', improvement: 3, perfId: c2.id });
  });

  it('score path only: equal scores, first scores and unverified results do not count', () => {
    const r1 = perf('aiko', { date: '2026-11-01', kind: 'race', distanceKm: 5, timeSec: 1300 });
    const r2 = perf('aiko', { date: '2026-11-10', kind: 'race', distanceKm: 10, timeSec: 2700 }); // different distance: no raw PB
    const r3 = perf('aiko', { date: '2026-11-11', kind: 'race', distanceKm: 3, timeSec: 600, verified: false });
    const perfScores = [score(r1.id, '2026-11-01', ['RACE'], 70), score(r2.id, '2026-11-10', ['RACE', 'END'], 70), score(r3.id, '2026-11-11', ['RACE'], 90)];
    // RACE 70 → 70 is not better; END 70 is END's first score; r3 is unverified.
    expect(computeInForm({ athleteId: 'aiko', perfs: [r1, r2, r3], perfScores, lookup, config: cfg, asOf: '2026-11-12' })).toEqual([]);
    // Raise r2 to 73: RACE 70 → 73.
    const better = [perfScores[0], score(r2.id, '2026-11-10', ['RACE', 'END'], 73)];
    expect(computeInForm({ athleteId: 'aiko', perfs: [r1, r2], perfScores: better, lookup, config: cfg, asOf: '2026-11-12' }).map((x) => x.text)).toEqual(['RACE 70 → 73']);
  });
});

describe('computeCourseRecords (spec 3.13 / 6)', () => {
  const athletes = [athlete('aiko', 'Aiko', 'F', 'Y9'), athlete('hana', 'Hana', 'F', 'Y10'), athlete('ben', 'Ben', 'M', 'Y12'), athlete('coach', 'Coach', 'F', 'Staff')];
  const perfs = [
    circ('aiko', '2026-06-10', 330), // academic year 2025–26: Aiko was Y8 → Y7–8
    circ('aiko', '2026-10-01', 320), // 2026–27: Y9 → Y9–11
    circ('hana', '2026-10-05', 310), // Y10 → Y9–11, beats Aiko's 320
    circ('hana', '2026-10-12', 310), // equals her record: the earlier run holds it
    circ('ben', '2026-03-01', 290), // 2025–26: Y11 → Y9–11
    circ('ben', '2026-10-05', 280), // Y12 → Y12–13
    circ('ben', '2026-10-06', 260, { verified: false }), // unverified: ignored
    circ('ben', '2026-11-20', 250), // after asOf: ignored
    circ('coach', '2026-10-05', 300), // Staff
    perf('aiko', { date: '2026-10-15', kind: 'descent', courseId: descent.id, timeSec: 100, cleanRun: false }), // excluded
    perf('hana', { date: '2026-10-16', kind: 'descent', courseId: descent.id, timeSec: 120, cleanRun: true }),
    perf('ghost', { date: '2026-10-16', kind: 'circuit', courseId: circuit.id, timeSec: 200 }), // not on the roster
  ];

  it('raw best per course × sex × year band, using the year group at the time', () => {
    const recs = computeCourseRecords({ athletes, perfs, lookup, config: cfg, asOf: '2026-11-01' });
    expect(recs.map((r) => [r.courseId, r.sex, r.band, r.athleteId, r.timeSec, r.yearGroupAtTime])).toEqual([
      ['c-circuit', 'F', 'Y7-8', 'aiko', 330, 'Y8'],
      ['c-circuit', 'F', 'Y9-11', 'hana', 310, 'Y10'],
      ['c-circuit', 'F', 'Staff', 'coach', 300, 'Staff'],
      ['c-circuit', 'M', 'Y9-11', 'ben', 290, 'Y11'],
      ['c-circuit', 'M', 'Y12-13', 'ben', 280, 'Y12'],
      ['c-descent', 'F', 'Y9-11', 'hana', 120, 'Y10'],
    ]);
    expect(recs[1].date).toBe('2026-10-05');
  });
});
