// The November 2026 rules: standards below the mile, evidence-weighted OVR, and the September rollover.
import { describe, expect, it } from 'vitest';
import type { Athlete, Performance, TasukiEvent } from '../types';
import { cloneConfig, currentConfig, DEFAULT_CONFIG, evidenceMigration, EVIDENCE_NOTE, preEvidenceRules } from './config';
import { ageOnDate } from './age';
import { hasLeft, yearRollover } from './display';
import { makeLookup } from './perf';
import { MILE_KM, standardTime, subMileRatio } from './standards';
import { computeAthleteRatings } from './stats';

const cfg = DEFAULT_CONFIG;
const old = preEvidenceRules(cfg);
const AS_OF = '2026-11-16';

function athlete(over: Partial<Athlete> = {}): Athlete {
  return { id: 'a1', givenName: 'Ben', familyName: 'Sampleton', preferredName: 'Ben', aliases: [], sex: 'M', yearGroup: 'Y10', yearGroupYear: 2026, displayMode: 'full', absoluteBoardOptOut: false, avatar: { seed: 1, skinTone: 0, hairStyle: 0, hairColour: 0, kitColour: 'academy-navy', accessory: 'none' }, active: true, ...over };
}
let n = 0;
const perf = (over: Partial<Performance>): Performance => ({ id: `p${++n}`, athleteId: 'a1', date: '2026-10-01', kind: 'race', verified: true, source: 'coach', rawInput: '', history: [], ...over });

const events: TasukiEvent[] = [
  { id: 'e-tt', name: '550 m time trial', date: '2026-10-20', kind: 'time_trial', distanceKm: 0.55, official: false },
  { id: 'e-gld', name: 'Green Long Ducker 2025 senior boys', date: '2025-11-08', kind: 'race', official: true },
];
const lookup = makeLookup([], events);
const rate = (a: Athlete, perfs: Performance[], config = cfg) => computeAthleteRatings({ athlete: a, perfs, lookup, config, asOf: AS_OF, streakActiveOrFrozen: false });

describe('standards below 1 mile follow the world-record curve', () => {
  it('is continuous at the mile and matches the table from there up', () => {
    expect(subMileRatio('M', MILE_KM)).toBeCloseTo(1, 12);
    expect(standardTime(14, 'M', MILE_KM, cfg)).toBeCloseTo(244, 9);
    expect(standardTime(14, 'M', 5, cfg)).toBe(standardTime(14, 'M', 5, old));
  });

  it('800 m and 400 m: the mile standard times the ratio of the world records', () => {
    // Open men: mile standard 227 s; 800 m record 100.91 s, mile record 223.13 s.
    expect(standardTime(25, 'M', 0.8, cfg)).toBeCloseTo((227 * 100.91) / 223.13, 6);
    expect(standardTime(25, 'F', 0.4, cfg)).toBeCloseTo((standardTime(25, 'F', MILE_KM, cfg) * 47.6) / 247.64, 6);
  });

  it('550 m: 10–14% harder than the old extrapolation, which flattered short time trials', () => {
    const now = standardTime(14.7, 'M', 0.55, cfg);
    const before = standardTime(14.7, 'M', 0.55, old);
    expect(before / now).toBeGreaterThan(1.1);
    expect(before / now).toBeLessThan(1.14);
    expect(standardTime(25, 'M', 0.55, old) / standardTime(25, 'M', 0.55, cfg)).toBeCloseTo(1.103, 2);
  });

  it('pace keeps getting faster as the distance gets shorter, with no jumps', () => {
    let last = Infinity;
    for (let d = 3; d >= 0.1; d -= 0.05) {
      const pace = standardTime(13, 'F', d, cfg) / d;
      expect(pace).toBeLessThan(last);
      last = pace;
    }
  });
});

describe('evidence-weighted OVR', () => {
  // A Year 10 with one 550 m stopwatch time trial (1:40) and a Long Ducker place from last year.
  const newcomer = [perf({ eventId: 'e-tt', date: '2026-10-20', timeSec: 100 }), perf({ eventId: 'e-gld', date: '2025-11-08', place: 20, fieldSize: 80 })];
  // An experienced runner: twenty parkruns around 21:30, three 3 km races and four timed hill climbs.
  const regular = [
    ...Array.from({ length: 20 }, (_, i) => perf({ kind: 'parkrun', distanceKm: 5, date: `2026-${String(1 + (i % 10)).padStart(2, '0')}-${i < 10 ? '10' : '24'}`, timeSec: 1290 + (i % 5) * 12 })),
    ...['2026-05-16', '2026-06-13', '2026-09-26'].map((date) => perf({ distanceKm: 3, date, timeSec: 720 })),
    ...['2026-04-18', '2026-06-20', '2026-09-12', '2026-10-17'].map((date) => perf({ kind: 'climb', distanceKm: 2, climbM: 300, date, timeSec: 1500 })),
  ];

  it('one short time trial and a place: a first estimate, close to the starting assumption', () => {
    const r = rate(athlete(), newcomer);
    expect(r.stats.SPD.evidence).toMatchObject({ results: 1, weight: 0.75 * 0.5 });
    expect(r.stats.CLB.evidence).toMatchObject({ results: 1, weight: 0.5 }); // a place with no time
    expect(r.ovr.evidence).toBe('estimate');
    expect(r.ovr.unlocked).toBe(2);
    // SPD is still shown as what he ran; the OVR does not take two thin results at face value.
    expect(r.stats.SPD.value!).toBeGreaterThan(80);
    expect(r.ovr.value!).toBeLessThan(62);
    expect(r.ovr.value!).toBeLessThan(Math.round(r.ovr.plain!) - 8);
  });

  it('the experienced runner is ahead of the newcomer, which the plain average got the wrong way round', () => {
    const a = rate(athlete(), newcomer);
    const b = rate(athlete({ id: 'a1' }), regular);
    expect(b.ovr.evidence).toBe('proven');
    expect(b.ovr.results).toBeGreaterThan(20);
    expect(b.ovr.value!).toBeGreaterThan(a.ovr.value!);
    // …and with plenty of evidence the OVR is within two points of the average of his stats.
    expect(Math.abs(b.ovr.value! - b.ovr.average!)).toBeLessThan(2);
    expect(rate(athlete(), newcomer, old).ovr.value!).toBeGreaterThan(rate(athlete(), regular, old).ovr.value!);
  });

  it('the arithmetic: OVR = prior + proven × (confidence-weighted average − prior)', () => {
    const r = rate(athlete(), newcomer);
    const [spd, clb] = [r.stats.SPD, r.stats.CLB];
    const c = [spd, clb].map((s) => s.evidence!.weight / (s.evidence!.weight + 1.5));
    const average = (c[0] * spd.value! + c[1] * clb.value!) / (c[0] + c[1]);
    const total = spd.evidence!.weight + clb.evidence!.weight;
    expect(r.ovr.average).toBeCloseTo(average, 9);
    expect(r.ovr.proven).toBeCloseTo(total / (total + 1.5), 9);
    expect(r.ovr.value).toBe(Math.round(50 + (total / (total + 1.5)) * (average - 50)));
  });

  it('two results on one day are one piece of evidence; a result over a year old counts half', () => {
    const sameDay = rate(athlete(), [perf({ distanceKm: 3, date: '2026-10-03', timeSec: 720 }), perf({ distanceKm: 3, date: '2026-10-03', timeSec: 730 })]);
    expect(sameDay.stats.SPD.evidence).toMatchObject({ results: 1, weight: 1 });
    const aged = rate(athlete(), [perf({ distanceKm: 3, date: '2025-10-03', timeSec: 720 })]);
    expect(aged.stats.SPD.evidence).toMatchObject({ results: 1, weight: 0.5 });
  });

  it('switched off, OVR is the plain average again', () => {
    const r = rate(athlete(), newcomer, old);
    expect(r.ovr.value).toBe(Math.round((r.stats.SPD.value! + r.stats.CLB.value!) / 2));
    expect(r.ovr.evidence).toBeUndefined();
  });
});

describe('the rules arrive as a new config version, once', () => {
  const stored = () => {
    const c = JSON.parse(JSON.stringify(cfg));
    delete c.ovr.evidence;
    delete c.ageGrade.subMile;
    return c as typeof cfg;
  };

  it('a version stored before the rules is read with them off, so its ratings can be reproduced', () => {
    const c = currentConfig([stored()]);
    expect(c.ovr.evidence.enabled).toBe(false);
    expect(c.ageGrade.subMile).toBe('extrapolate');
  });

  it('a store from before gets one new version with the rules on', () => {
    const v2 = evidenceMigration([stored()], '2026-11-16T00:00:00.000Z')!;
    expect([v2.version, v2.note]).toEqual([2, EVIDENCE_NOTE]);
    expect(v2.ovr.evidence.enabled).toBe(true);
    expect(v2.ageGrade.subMile).toBe('world_record_curve');
    expect(evidenceMigration([stored(), v2], '2026-11-17T00:00:00.000Z')).toBeUndefined();
  });

  it('a new store, and a coach who has switched the rules off since, are left alone', () => {
    expect(evidenceMigration([cfg], 'x')).toBeUndefined();
    const off = { ...preEvidenceRules(cfg), version: 2 };
    expect(evidenceMigration([cfg, off], 'x')).toBeUndefined();
    const v2 = evidenceMigration([stored()], 'x')!;
    const v3 = { ...preEvidenceRules(cloneConfig(v2)), version: 3, migration: undefined };
    expect(evidenceMigration([stored(), v2, v3], 'x')).toBeUndefined();
  });
});

describe('September rollover of year groups', () => {
  it('a Y9 from the 2025 workbook is Y10 in November 2026, with the same estimated age', () => {
    const a = athlete({ yearGroup: 'Y9', yearGroupYear: 2025 });
    const [b] = yearRollover([a], AS_OF, cfg);
    expect([b.yearGroup, b.yearGroupYear]).toEqual(['Y10', 2026]);
    expect(ageOnDate(b, '2025-11-08', cfg).age).toBeCloseTo(ageOnDate(a, '2025-11-08', cfg).age, 2);
    expect(yearRollover([b], AS_OF, cfg)).toEqual([]);
  });

  it('nothing moves before 1 September, and two years move two year groups', () => {
    expect(yearRollover([athlete({ yearGroup: 'Y9', yearGroupYear: 2025 })], '2026-08-31', cfg)).toEqual([]);
    expect(yearRollover([athlete({ yearGroup: 'Y7', yearGroupYear: 2024 })], AS_OF, cfg)[0].yearGroup).toBe('Y9');
  });

  it('staff, unstamped records and leavers are left as they are', () => {
    const leaver = athlete({ yearGroup: 'Y13', yearGroupYear: 2025 });
    expect(yearRollover([athlete({ yearGroup: 'Staff', yearGroupYear: 2024 }), athlete({ yearGroupYear: undefined }), leaver], AS_OF, cfg)).toEqual([]);
    expect(hasLeft(leaver, AS_OF, cfg)).toBe(true);
    expect(hasLeft(athlete(), AS_OF, cfg)).toBe(false);
  });
});
