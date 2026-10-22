import { describe, expect, it } from 'vitest';
import type { Calendar, Course, Participation, Performance } from '../types';
import { cloneConfig, DEFAULT_CONFIG } from './config';
import { isoWeek } from './dates';
import { makeLookup } from './perf';
import { computeStreak, halfTermOfWeek } from './streak';

// Fictional athlete "Aiko Testfield". Weeks (Mondays): W40 = 28 Sep 2026, W41 = 5 Oct, W42 = 12 Oct,
// W43 = 19 Oct (half-term holiday), W44 = 26 Oct, W45 = 2 Nov, W46 = 9 Nov, W47 = 16 Nov, W48 = 23 Nov.
const AIKO = 'ath-aiko';
const circuit: Course = { id: 'c-circuit', name: 'Campus Circuit', kind: 'circuit', distanceKm: 1.3, climbM: 0, terrainFactor: 1, benchmarkMode: 'age_grade', version: 1 };
const lookup = makeLookup([circuit], []);
const cfg = DEFAULT_CONFIG;

const calendar: Calendar = {
  holidayWeeks: ['2026-W43'],
  halfTerms: [
    { id: 'ht-aut1', name: 'Autumn 1', start: '2026-09-01', end: '2026-10-16' },
    { id: 'ht-aut2', name: 'Autumn 2', start: '2026-10-26', end: '2026-12-18' },
  ],
};

let n = 0;
function perf(p: Partial<Performance> & Pick<Performance, 'date' | 'kind'>): Performance {
  n++;
  return { id: `p${n}`, athleteId: AIKO, verified: true, source: 'coach', rawInput: '', history: [], ...p };
}
function run(date: string, extra: Partial<Performance> = {}): Performance {
  return perf({ date, kind: 'circuit', courseId: circuit.id, timeSec: 300, ...extra });
}
function part(date: string, type: Participation['type'], athleteId = AIKO): Participation {
  n++;
  return { id: `q${n}`, athleteId, isoWeek: isoWeek(date), type, date };
}

// The acceptance scenario: a streak that runs across a holiday week and a freeze.
const perfs: Performance[] = [
  run('2026-09-30'), // W40 Circuit → counted
  run('2026-10-14'), // W42 Circuit → counted
  perf({ date: '2026-10-24', kind: 'parkrun', distanceKm: 5, timeSec: 1500 }), // W43 holiday: parkrun → flame only
  run('2026-10-28'), // W44 counted
  run('2026-11-11'), // W46 counted
];
const participation: Participation[] = [
  part('2026-10-10', 'saturday_run'), // W41 Saturday run → counted
  part('2026-11-02', 'freeze'), // W45 freeze (first in Autumn 2) → frozen
];

describe('computeStreak (spec 3.11)', () => {
  it('carries a streak across a holiday week and a freeze', () => {
    const s = computeStreak({ athleteId: AIKO, perfs, participation, calendar, config: cfg, asOf: '2026-11-18', lookup });
    expect(s.weeks.map((w) => `${w.week}:${w.state}`)).toEqual([
      '2026-W40:counted',
      '2026-W41:counted',
      '2026-W42:counted',
      '2026-W43:holiday',
      '2026-W44:counted',
      '2026-W45:frozen',
      '2026-W46:counted',
      '2026-W47:current', // asOf Wed 18 Nov, nothing yet this week: in progress, not missed
    ]);
    // Walking back: W47 in progress (skip), W46 = 1, W45 frozen (hold), W44 = 2, W43 holiday (skip),
    // W42 = 3, W41 = 4, W40 = 5.
    expect(s.currentStreak).toBe(5);
    expect(s.bestStreak).toBe(5);
    expect(s.status).toBe('active');
  });

  it('a verified parkrun in a holiday week adds a flame but not a week', () => {
    const s = computeStreak({ athleteId: AIKO, perfs, participation, calendar, config: cfg, asOf: '2026-11-18', lookup });
    expect(s.weeks.find((w) => w.week === '2026-W43')).toEqual({ week: '2026-W43', state: 'holiday', holidayBonus: true });
    expect(s.holidayBonusFlames).toBe(1);
    // Unverified parkrun → no flame.
    const unverified = perfs.map((p) => (p.kind === 'parkrun' ? { ...p, verified: false } : p));
    expect(computeStreak({ athleteId: AIKO, perfs: unverified, participation, calendar, config: cfg, asOf: '2026-11-18', lookup }).holidayBonusFlames).toBe(0);
  });

  it('a long run also earns the flame; a Circuit in a holiday week neither counts nor breaks', () => {
    const extra = [...perfs, perf({ date: '2026-10-21', kind: 'long_run', distanceKm: 12 }), run('2026-10-22')];
    const s = computeStreak({ athleteId: AIKO, perfs: extra, participation, calendar, config: cfg, asOf: '2026-11-18', lookup });
    expect(s.weeks.find((w) => w.week === '2026-W43')?.state).toBe('holiday');
    expect(s.holidayBonusFlames).toBe(1);
    expect(s.currentStreak).toBe(5);
  });

  it("status is 'frozen' while the latest decided week is the freeze", () => {
    // asOf Tue 10 Nov: the W46 Circuit (11 Nov) has not happened yet, so W46 is in progress.
    // Back from W45 (frozen, hold): W44 = 1, W43 holiday, W42 = 2, W41 = 3, W40 = 4.
    const s = computeStreak({ athleteId: AIKO, perfs, participation, calendar, config: cfg, asOf: '2026-11-10', lookup });
    expect(s.weeks.at(-1)).toEqual({ week: '2026-W46', state: 'current', holidayBonus: false });
    expect(s.currentStreak).toBe(4);
    expect(s.status).toBe('frozen');
  });

  it('ignores a second freeze in the same half-term (the week is missed)', () => {
    // W45 freeze #1 (Autumn 2) holds; W46 counted; W47 freeze #2 (Autumn 2) is ignored → missed;
    // W48 Circuit (Wed 25 Nov) counted.
    const p2 = [...perfs, run('2026-11-25')];
    const q2 = [...participation, part('2026-11-16', 'freeze')];
    const s = computeStreak({ athleteId: AIKO, perfs: p2, participation: q2, calendar, config: cfg, asOf: '2026-11-25', lookup });
    expect(s.weeks.slice(-3).map((w) => w.state)).toEqual(['counted', 'missed', 'counted']);
    // Best: W40, W41, W42, (W43 holiday), W44, (W45 frozen), W46 = 5. Current: W48 = 1 (W47 missed).
    expect(s.bestStreak).toBe(5);
    expect(s.currentStreak).toBe(1);
    expect(s.status).toBe('active');
  });

  it('allows the freeze again in a new half-term, and the allowance comes from config', () => {
    // W41 freeze is in Autumn 1 (Monday 5 Oct), so the W45 freeze in Autumn 2 still holds.
    const p3 = perfs.filter((p) => p.date !== '2026-10-14'); // W42 empty
    const q3 = [part('2026-10-14', 'freeze'), part('2026-11-02', 'freeze'), part('2026-10-10', 'saturday_run')];
    const s = computeStreak({ athleteId: AIKO, perfs: p3, participation: q3, calendar, config: cfg, asOf: '2026-11-18', lookup });
    expect(s.weeks.filter((w) => w.state === 'frozen').map((w) => w.week)).toEqual(['2026-W42', '2026-W45']);
    // W46, W44, W41, W40 counted; W45, W42 frozen; W43 holiday → 4.
    expect(s.currentStreak).toBe(4);

    const two = cloneConfig(cfg);
    two.streak.freezesPerHalfTerm = 2;
    const q4 = [...participation, part('2026-11-16', 'freeze')];
    const p4 = [...perfs, run('2026-11-25')];
    const s4 = computeStreak({ athleteId: AIKO, perfs: p4, participation: q4, calendar, config: two, asOf: '2026-11-25', lookup });
    expect(s4.weeks.find((w) => w.week === '2026-W47')?.state).toBe('frozen');
    expect(s4.currentStreak).toBe(6);
  });

  it('a freeze on a week that already counts uses none of the allowance', () => {
    // Freeze logged on W44 (which has a Circuit) and on W45: W45 still holds.
    const q = [part('2026-10-10', 'saturday_run'), part('2026-10-28', 'freeze'), part('2026-11-02', 'freeze')];
    const s = computeStreak({ athleteId: AIKO, perfs, participation: q, calendar, config: cfg, asOf: '2026-11-18', lookup });
    expect(s.weeks.find((w) => w.week === '2026-W44')?.state).toBe('counted');
    expect(s.weeks.find((w) => w.week === '2026-W45')?.state).toBe('frozen');
  });

  it('a freeze outside every configured half-term is not honoured', () => {
    const q = [part('2026-10-10', 'saturday_run'), part('2026-11-02', 'freeze')];
    const s = computeStreak({ athleteId: AIKO, perfs, participation: q, calendar: { ...calendar, halfTerms: [] }, config: cfg, asOf: '2026-11-18', lookup });
    expect(s.weeks.find((w) => w.week === '2026-W45')?.state).toBe('missed');
    expect(s.currentStreak).toBe(1);
    expect(s.bestStreak).toBe(4);
  });

  it('broken and none', () => {
    // Last activity W46; asOf Mon 30 Nov (W49): W47 and W48 missed → broken.
    const s = computeStreak({ athleteId: AIKO, perfs, participation, calendar, config: cfg, asOf: '2026-11-30', lookup });
    expect(s.currentStreak).toBe(0);
    expect(s.bestStreak).toBe(5);
    expect(s.status).toBe('broken');

    const none = computeStreak({ athleteId: 'ath-ben', perfs, participation, calendar, config: cfg, asOf: '2026-11-30', lookup });
    expect(none).toEqual({ athleteId: 'ath-ben', currentStreak: 0, bestStreak: 0, status: 'none', holidayBonusFlames: 0, weeks: [] });
  });

  it('counts only live, verified Circuit runs; a race on a circuit course counts as a Circuit', () => {
    const p = [
      run('2026-09-30', { verified: false }),
      run('2026-10-07', { deleted: true }),
      perf({ date: '2026-10-14', kind: 'race', courseId: circuit.id, timeSec: 290 }), // circuit by course kind
      perf({ date: '2026-10-14', kind: 'race', distanceKm: 5, timeSec: 1300 }), // a race elsewhere is not a Circuit
    ];
    const s = computeStreak({ athleteId: AIKO, perfs: p, participation: [], calendar, config: cfg, asOf: '2026-10-15', lookup });
    expect(s.weeks.map((w) => w.state)).toEqual(['counted']);
    expect(s.currentStreak).toBe(1);
  });

  it("ignores stored 'circuit' participation, other athletes, and results after asOf", () => {
    const q = [part('2026-10-07', 'circuit'), part('2026-10-10', 'saturday_run', 'ath-ben'), part('2026-10-17', 'saturday_run')];
    const s = computeStreak({ athleteId: AIKO, perfs: [], participation: q, calendar, config: cfg, asOf: '2026-10-14', lookup });
    expect(s.status).toBe('none');
  });

  it('finds the half-term containing a week’s Monday', () => {
    expect(halfTermOfWeek('2026-W44', calendar.halfTerms)?.id).toBe('ht-aut2'); // Monday 26 Oct
    expect(halfTermOfWeek('2026-W42', calendar.halfTerms)?.id).toBe('ht-aut1'); // Monday 12 Oct
    expect(halfTermOfWeek('2026-W43', calendar.halfTerms)).toBeUndefined(); // Monday 19 Oct: between half-terms
  });
});
