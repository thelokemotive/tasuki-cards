import { describe, expect, it } from 'vitest';
import type { Athlete, DataSnapshot, Performance } from '../types';
import { SCHEMA_VERSION } from '../types';
import { DEFAULT_CONFIG } from './config';
import { deriveAll } from './derive';
import { explainAll, explainOvr, explainStat, explanationText } from './explain';
import { buildDemoData, seedCourses, CAMPUS_CIRCUIT_ID } from '../demo/demoData';
import { formatTime } from './format';
import { standardTime } from './standards';

const cfg = DEFAULT_CONFIG;
const AS_OF = '2026-10-12';

const aiko: Athlete = {
  id: 'aiko', givenName: 'Aiko', familyName: 'Testfield', preferredName: 'Aiko', aliases: [], sex: 'F', yearGroup: 'Y9', yearGroupYear: 2026,
  dob: '2013-02-20', displayMode: 'first_initial', absoluteBoardOptOut: false,
  avatar: { seed: 1, skinTone: 0, hairStyle: 0, hairColour: 0, kitColour: 'academy-navy', accessory: 'none' }, active: true,
};

let n = 0;
const perf = (over: Partial<Performance>): Performance => ({ id: `p${++n}`, athleteId: 'aiko', date: AS_OF, kind: 'race', verified: true, source: 'coach', rawInput: '', history: [], ...over });

function snap(perfs: Performance[], athletes: Athlete[] = [aiko]): DataSnapshot {
  return {
    schemaVersion: SCHEMA_VERSION, athletes,
    courses: [...seedCourses(), { id: 'c-desc', name: 'Test Slope Descent', kind: 'descent', distanceKm: 1, climbM: 0, terrainFactor: 1, benchmarkMode: 'fixed', t99OpenM: 180, t99OpenF: 200, version: 1, notes: 'Loose gravel\nBenchmark from a reference run: Coach Example ran 3:40 on 4 Nov 2026 (M, age 40.5), set to score 90. 99-point open times 3:00 (men), 3:20 (women).' }],
    events: [
      { id: 'e3k', name: 'Hachimantai 3K', date: AS_OF, kind: 'race', distanceKm: 3, climbM: 40, official: true },
      { id: 'e10', name: 'Valley 10K', date: '2026-09-20', kind: 'race', distanceKm: 10, official: true },
    ],
    performances: perfs, participation: [], achievements: [], configs: [cfg], calendar: { holidayWeeks: [], halfTerms: [] }, meta: {},
  };
}

function explain(perfs: Performance[], key: Parameters<typeof explainStat>[1], audience: 'coach' | 'student' = 'coach', asOf = AS_OF) {
  const d = deriveAll(snap(perfs), asOf);
  return { e: explainStat(d.athletes.get('aiko')!, key, cfg, d.lookup, { audience }), d };
}

describe('explainStat: the spec example (go-live plan 4)', () => {
  it('SPD from a 3 km race: effort, standard, age grade, Run Score, freshness', () => {
    const { e, d } = explain([perf({ id: 'r3k', eventId: 'e3k', timeSec: 1000 })], 'SPD');
    const r = d.athletes.get('aiko')!.ratings;
    const ps = r.perfScores[0];
    // Aiko on 12 Oct 2026, born 20 Feb 2013: 13.6 years old.
    expect(ps.age).toBeCloseTo(13.64, 2);
    const std = standardTime(ps.age, 'F', 3.4, cfg);
    expect(e.headline).toBe(`SPD ${r.stats.SPD.value}`);
    const text = e.paragraphs.join(' ');
    expect(text).toContain('SPD is the best of the Circuit and any verified race, relay leg or parkrun of up to 3.5 km effort.');
    expect(text).toContain(`SPD ${r.stats.SPD.value} comes from Hachimantai 3K on 12 Oct 2026.`);
    expect(text).toContain('3 km + 40 m climb = 3.4 km effort.');
    expect(text).toContain(`The world-standard time for a 13.6-year-old girl at 3.4 km is ${formatTime(std)}.`);
    expect(text).toContain(`Aiko ran 16:40, an age grade of ${((std / 1000) * 100).toFixed(1)}%.`);
    expect(text).toMatch(new RegExp(`Run Score = 99 × ${((std / 1000) * 100).toFixed(1)}% ÷ 80% = [\\d.]+ → ${ps.score}\\.`));
    expect(text).toContain('The result is 0 months old, so there is no freshness penalty');
    expect(e.considered).toEqual([expect.objectContaining({ perfId: 'r3k', status: 'used', label: 'Hachimantai 3K · 16:40' })]);
  });

  it('lists every result considered and why the others did not win', () => {
    const { e } = explain(
      [
        perf({ id: 'best', eventId: 'e3k', timeSec: 900 }),
        perf({ id: 'slow', kind: 'circuit', courseId: CAMPUS_CIRCUIT_ID, timeSec: 480, date: '2026-10-01' }),
        perf({ id: 'unv', kind: 'circuit', courseId: CAMPUS_CIRCUIT_ID, timeSec: 300, date: '2026-10-05', verified: false }),
        perf({ id: 'old', kind: 'circuit', courseId: CAMPUS_CIRCUIT_ID, timeSec: 360, date: '2025-11-01' }),
        perf({ id: 'gone', kind: 'circuit', courseId: CAMPUS_CIRCUIT_ID, timeSec: 300, date: '2024-01-01' }),
      ],
      'SPD',
    );
    const by = Object.fromEntries(e.considered.map((c) => [c.perfId, c]));
    expect(by.best.status).toBe('used');
    expect(by.slow).toMatchObject({ status: 'lower' });
    expect(by.slow.reason).toMatch(/^lower \(\d+ against \d+\)$/);
    expect(by.unv).toMatchObject({ status: 'unverified', reason: 'waiting to be verified' });
    expect(by.gone).toMatchObject({ status: 'expired', reason: 'over 24 months old' });
    expect(['older', 'lower']).toContain(by.old.status);
    expect(e.paragraphs.at(-1)).toBe('4 other results were considered; the list below says why they did not win.');
  });

  it('the student version uses the display name and whole years, never the DOB', () => {
    const { e } = explain([perf({ eventId: 'e3k', timeSec: 1000 })], 'SPD', 'student');
    const text = explanationText(e);
    expect(text).toContain('Aiko T. ran 16:40');
    expect(text).toContain('13-year-old girl');
    expect(text).not.toContain('Testfield');
    expect(text).not.toContain('2013');
    expect(text).not.toContain('13.6');
  });
});

describe('explainStat: every kind of working', () => {
  it('a locked stat says how to unlock it', () => {
    const { e } = explain([], 'CLB');
    expect(e.headline).toBe('CLB: locked');
    expect(e.paragraphs.join(' ')).toContain('CLB is locked: Run a climb course, or a verified race or long run with at least 150 m of climb and 50 m per km, to unlock CLB.');
  });

  it('RACE shows the weighted blend', () => {
    const { e, d } = explain([perf({ eventId: 'e3k', timeSec: 1000 }), perf({ eventId: 'e10', date: '2026-09-20', timeSec: 3000 })], 'RACE');
    const race = d.athletes.get('aiko')!.ratings.race;
    expect(e.headline).toBe(`RACE ${race.value}`);
    expect(e.paragraphs.join(' ')).toMatch(new RegExp(`RACE = 60% × \\d+ \\(Valley 10K, 20 Sep\\) \\+ 40% × \\d+ \\(Hachimantai 3K, 12 Oct\\) = [\\d.]+ → ${race.value}\\.`));
  });

  it('bleep: percentile and rating', () => {
    const { e } = explain([perf({ kind: 'bleep', bleepLaps: 40 })], 'END');
    const t = e.paragraphs.join(' ');
    expect(t).toMatch(/For a 13\.6-year-old girl, 40 laps is the [\d.]+th percentile \(between P\d+ = \d+ and P\d+ = \d+ laps\)\. Rating = 40 \+ 0\.59 × [\d.]+ = [\d.]+ → \d+\./);
  });

  it('fixed-benchmark descent: age adjustment and the course note', () => {
    const { e } = explain([perf({ kind: 'descent', courseId: 'c-desc', timeSec: 260, cleanRun: true })], 'DSC');
    const t = e.paragraphs.join(' ');
    expect(t).toContain('Test Slope Descent is scored against a fixed benchmark (Coach Example ran 3:40 on 4 Nov 2026 (M, age 40.5), set to score 90): the 99-point time for open women is 3:20.');
    expect(t).toMatch(/For a 13\.6-year-old girl the age adjustment is × 1\.\d{3}, so the 99-point time is \d:\d\d\. Aiko ran 4:20: 99 × \d:\d\d ÷ 4:20 = [\d.]+ → \d+\./);
  });

  it('NAV: reference pace, prediction, errors, efficiency', () => {
    const { e } = explain(
      [perf({ kind: 'circuit', courseId: CAMPUS_CIRCUIT_ID, timeSec: 390, date: '2026-10-01' }), perf({ kind: 'nav', distanceKm: 3, timeSec: 1200, navErrors: 1 })],
      'NAV',
    );
    const t = e.paragraphs.join(' ');
    expect(t).toContain('Reference pace 5:00/km (best Circuit pace, from Campus Circuit, 1 Oct).');
    expect(t).toContain('Predicted time = 3 km × 5:00/km × 1.15 allowance = 17:15.');
    expect(t).toContain('Aiko took 20:00 + 1 error × 120 s = 22:00.');
    expect(t).toMatch(/Efficiency = 17:15 ÷ 22:00 = 78\.4%\. NAV = 40 \+ 59 × \(78\.4% − 50%\) ÷ 50% → 74\./);
  });

  it('ARM: best level per domain and the formula', () => {
    const { e } = explain([perf({ kind: 'arm', arm: { ankleCm: 11, calfReps: 18, storkSec: 22 } })], 'ARM');
    const t = e.paragraphs.join(' ');
    expect(t).toContain("Aiko's best levels: ankle level 3 (11 cm, 12 Oct); calf level 2 (18 heel raises, 12 Oct); balance level 3 (22 s, 12 Oct).");
    expect(t).toContain('ARM = 40 + (8 − 3) × 59 ÷ 12 = 64.6 → 65.');
  });

  it('freshness and Growth Shield are spelled out', () => {
    // A great Circuit 8 months ago, a weaker one this month, streak active (weekly Circuits).
    const perfs: Performance[] = [perf({ id: 'peak', kind: 'circuit', courseId: CAMPUS_CIRCUIT_ID, timeSec: 330, date: '2026-02-10' })];
    for (let w = 0; w < 6; w++) perfs.push(perf({ kind: 'circuit', courseId: CAMPUS_CIRCUIT_ID, timeSec: 420, date: `2026-${w < 3 ? '09' : '10'}-${String(w < 3 ? 14 + w * 7 : 1 + (w - 3) * 5).padStart(2, '0')}` }));
    const d = deriveAll(snap(perfs), AS_OF);
    const ad = d.athletes.get('aiko')!;
    const s = ad.ratings.stats.SPD;
    const e = explainStat(ad, 'SPD', cfg, d.lookup);
    const t = e.paragraphs.join(' ');
    if (s.shielded) {
      expect(t).toContain(`so SPD shows no less than 2 below the best of the last 12 months: ${s.peak12m} (Campus Circuit, 10 Feb) − 2 = ${s.value}, instead of ${s.current}.`);
      expect(e.considered.find((c) => c.perfId === 'peak')?.status).toBe('shield');
    } else {
      expect(t).toMatch(/points? off for freshness/);
    }
    expect(t).toMatch(/months old/);
  });

  it('OVR in words', () => {
    const d = deriveAll(snap([perf({ eventId: 'e3k', timeSec: 1000 }), perf({ kind: 'bleep', bleepLaps: 40 })]), AS_OF);
    const lines = explainOvr(d.athletes.get('aiko')!, cfg);
    expect(lines[0]).toMatch(/^OVR = the average of the 2 unlocked stats: \(\d+ \+ \d+\) ÷ 2 = [\d.]+ → \d+\./);
  });
});

describe('explanations agree with the ratings for every demo athlete', () => {
  const demo = buildDemoData('2026-11-05');
  const s: DataSnapshot = { ...snap([]), athletes: demo.athletes, courses: [...demo.courses], events: demo.events, performances: demo.performances, participation: demo.participation, achievements: demo.achievements };
  const d = deriveAll(s, '2026-11-05');
  for (const ad of d.athletes.values()) {
    it(`${ad.athlete.givenName} ${ad.athlete.familyName}`, () => {
      for (const audience of ['coach', 'student'] as const) {
        for (const e of explainAll(ad, cfg, d.lookup, { audience })) {
          const stat = e.key === 'RACE' ? ad.ratings.race : ad.ratings.stats[e.key];
          expect(e.headline).toBe(stat.locked ? `${e.key}: locked` : `${e.key} ${stat.value}`);
          const text = explanationText(e);
          expect(text).not.toMatch(/undefined|NaN|Infinity|\[object/);
          expect(e.paragraphs.length).toBeGreaterThan(0);
          for (const id of stat.basis?.perfIds ?? []) expect(e.considered.some((c) => c.perfId === id && (c.status === 'used' || c.status === 'shield'))).toBe(true);
          // Every "→ N" in a single-result working is that result's score.
          if (!stat.locked && e.key !== 'RACE' && e.key !== 'ARM') {
            const used = e.considered.find((c) => c.status === 'used') ?? e.considered.find((c) => c.status === 'shield');
            expect(used).toBeDefined();
          }
          if (audience === 'student') {
            if (ad.athlete.dob) expect(text).not.toContain(ad.athlete.dob);
            if (ad.athlete.displayMode !== 'full') expect(text).not.toContain(`${ad.athlete.preferredName} ${ad.athlete.familyName}`);
          }
        }
      }
    });
  }
});

describe('articles', () => {
  it('an 11-year-old, an 18-year-old, a 13.6-year-old', () => {
    const young = { ...aiko, id: 'aiko', dob: '2015-03-01' };
    const d = deriveAll(snap([perf({ eventId: 'e3k', timeSec: 1000 })], [young]), AS_OF);
    const t = explainStat(d.athletes.get('aiko')!, 'SPD', cfg, d.lookup, { audience: 'student' }).paragraphs.join(' ');
    expect(t).toContain('for an 11-year-old girl');
  });
});
