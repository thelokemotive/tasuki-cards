import { describe, expect, it } from 'vitest';
import type { Athlete, Calendar, Participation, Performance, TopUp } from '../types';
import { DEFAULT_CONFIG } from './config';
import { isoWeek } from './dates';
import { makeLookup } from './perf';
import { computeStreak } from './streak';
import { computeWinter, pacePlan, phaseOfWeek, winterHouseCup, winterWeeks } from './winter';
import { fillSession, suggestedSession, WINTER_SESSIONS } from './winterSessions';

// Fictional runners. Winter 2026–27: Christmas holiday Mon 21 Dec 2026 – Sun 10 Jan 2027 (2026-W52, 2026-W53,
// 2027-W01), then the snow season in term from Mon 11 Jan 2027.
const cfg = DEFAULT_CONFIG;
const calendar: Calendar = {
  holidayWeeks: ['2026-W52', '2026-W53', '2027-W01'],
  halfTerms: [],
  winter: [
    { id: 'xmas', name: 'Christmas holiday', start: '2026-12-21', end: '2027-01-10', kind: 'holiday' },
    { id: 'snow', name: 'Snow season', start: '2027-01-11', end: '2027-03-14', kind: 'snow' },
  ],
};

function athlete(id: string, extra: Partial<Athlete> = {}): Athlete {
  return {
    id,
    givenName: 'Test',
    familyName: id,
    preferredName: 'Test',
    aliases: [],
    sex: 'F',
    yearGroup: 'Y9',
    displayMode: 'full',
    absoluteBoardOptOut: false,
    avatar: {} as Athlete['avatar'],
    active: true,
    ...extra,
  };
}
const AIKO = athlete('aiko', { house: 'Peregrine' });

let n = 0;
function top(date: string, t: TopUp, athleteId = 'aiko'): Participation {
  n++;
  return { id: `t${n}`, athleteId, isoWeek: isoWeek(date), type: 'top_up', date, topUp: t };
}
const run = (date: string, minutes = 25, extra: Partial<TopUp> = {}) => top(date, { activity: 'run', minutes, ...extra });
const tread = (date: string, minutes = 25, extra: Partial<TopUp> = {}) => top(date, { activity: 'treadmill', minutes, ...extra });
const armour = (date: string, minutes = 10, extra: Partial<TopUp> = {}) => top(date, { activity: 'armour', minutes, ...extra });
const ski = (date: string) => top(date, { activity: 'ski', minutes: 240 });

function winter(parts: Participation[], asOf: string, a: Athlete = AIKO, perfs: Performance[] = []) {
  return computeWinter({ athlete: a, perfs, participation: parts, calendar, config: cfg, asOf })!;
}

describe('winter weeks', () => {
  it('lists every week a phase touches and finds its phase', () => {
    const weeks = winterWeeks(calendar.winter!);
    expect(weeks.slice(0, 4)).toEqual(['2026-W52', '2026-W53', '2027-W01', '2027-W02']);
    expect(phaseOfWeek('2027-W01', calendar.winter!)?.id).toBe('xmas');
    expect(phaseOfWeek('2027-W02', calendar.winter!)?.id).toBe('snow');
  });

  it('is off with no winter phases', () => {
    expect(computeWinter({ athlete: AIKO, perfs: [], participation: [], calendar: { holidayWeeks: [], halfTerms: [] }, config: cfg, asOf: '2027-01-01' })).toBeUndefined();
  });
});

describe('the Rule of 2', () => {
  it('keeps a week with a run and an armour session', () => {
    const w = winter([run('2026-12-22'), armour('2026-12-24')], '2026-12-27');
    expect(w.weeks[0]).toMatchObject({ week: '2026-W52', state: 'kept', runs: 1, sessions: 2 });
  });

  it('needs at least one run: two armour sessions do not keep a week', () => {
    const w = winter([armour('2026-12-22'), armour('2026-12-24')], '2026-12-31');
    expect(w.weeks[0].state).not.toBe('kept');
  });

  it('never counts ski days, and a run under 15 minutes does not count', () => {
    const w = winter([ski('2026-12-22'), ski('2026-12-23'), run('2026-12-24', 10), run('2026-12-25', 20)], '2026-12-31');
    expect(w.weeks[0]).toMatchObject({ runs: 1, sessions: 1, skiDays: 2 });
    expect(w.weeks[0].state).not.toBe('kept');
  });

  it('gives nothing extra for cramming: four runs are still one kept week', () => {
    const w = winter([run('2026-12-21'), run('2026-12-22', 60), tread('2026-12-23'), run('2026-12-24')], '2026-12-27');
    expect(w.weeks[0]).toMatchObject({ state: 'kept', sessions: 2, extra: 2 });
    expect(w.flame).toBe(1);
  });

  it('counts sessions on separate days: two runs on one Sunday are one session', () => {
    const w = winter([run('2026-12-27'), tread('2026-12-27'), armour('2026-12-27')], '2026-12-27');
    expect(w.weeks[0]).toMatchObject({ runs: 1, sessions: 1, extra: 2, state: 'current' });
    const ok = winter([run('2026-12-26'), run('2026-12-27')], '2026-12-27');
    expect(ok.weeks[0].state).toBe('kept');
  });

  it('marks a week sharp when a session had race-pace surges', () => {
    const w = winter([run('2026-12-22'), tread('2026-12-24', 25, { sharp: true })], '2026-12-27');
    expect(w.weeks[0].sharp).toBe(true);
    expect(w.sharpWeeks).toBe(1);
  });

  it('counts a parkrun as a sharp run', () => {
    const parkrun: Performance = { id: 'p1', athleteId: 'aiko', date: '2026-12-26', kind: 'parkrun', distanceKm: 5, timeSec: 1500, verified: true, source: 'coach', rawInput: '', history: [] };
    const w = winter([armour('2026-12-22')], '2026-12-27', AIKO, [parkrun]);
    expect(w.weeks[0]).toMatchObject({ state: 'kept', sharp: true });
  });

  it('asks staff for three sessions', () => {
    const coach = athlete('coach', { yearGroup: 'Staff' });
    const parts = [run('2026-12-22', 40, {}), run('2026-12-24', 40)].map((p) => ({ ...p, athleteId: 'coach' }));
    const w = winter(parts, '2026-12-27', coach);
    expect(w.target).toBe(3);
    expect(w.weeks[0]).toMatchObject({ state: 'current', sessions: 2 });
  });
});

describe('flame, rest passes and the current week', () => {
  it('uses the one rest pass on the first missed week, then breaks the flame', () => {
    const parts = [run('2026-12-22'), run('2026-12-24'), run('2027-01-12'), armour('2027-01-14')];
    // W52 kept, W53 missed (pass), W01 missed (no pass left), W02 kept, W03 current
    const w = winter(parts, '2027-01-19');
    expect(w.weeks.map((x) => x.state)).toEqual(['kept', 'rest', 'missed', 'kept', 'current']);
    expect(w.weeks[1].restBy).toBe('pass');
    expect(w.flame).toBe(1);
    expect(w.bestFlame).toBe(1);
    expect(w.restPassesLeft).toBe(0);
  });

  it('a coach rest (freeze) holds a week without using the pass', () => {
    const freeze: Participation = { id: 'f1', athleteId: 'aiko', isoWeek: '2026-W53', type: 'freeze', date: '2026-12-28' };
    const parts = [run('2026-12-22'), run('2026-12-24'), freeze, run('2027-01-05'), run('2027-01-07')];
    const w = winter(parts, '2027-01-10');
    expect(w.weeks.map((x) => x.state)).toEqual(['kept', 'rest', 'kept']);
    expect(w.weeks[1].restBy).toBe('coach');
    expect(w.flame).toBe(2);
    expect(w.restPassesLeft).toBe(1);
  });

  it('never calls the current week missed', () => {
    const w = winter([run('2026-12-22')], '2026-12-23');
    expect(w.thisWeek?.state).toBe('current');
    expect(w.next).toMatch(/1 more/);
  });

  it('is spring ready at 75% of decided weeks kept', () => {
    const parts = [run('2026-12-22'), run('2026-12-24'), run('2026-12-29'), run('2026-12-31'), run('2027-01-05'), run('2027-01-07')];
    expect(winter(parts, '2027-01-11').springReady).toBe(true);
    expect(winter(parts.slice(0, 2), '2027-01-11').springReady).toBe(false);
  });
});

describe('load and soreness nudges', () => {
  it('first week back after 14+ days: easy and short', () => {
    const w = winter([run('2026-12-01')], '2026-12-22');
    expect(w.flags.map((f) => f.kind)).toContain('return');
    expect(w.next).toMatch(/up to 20 minutes/);
  });

  it('one short jog in the fortnight before is still a break', () => {
    const thin = winter([run('2026-12-08', 15), run('2026-12-21'), run('2026-12-22')], '2026-12-23');
    expect(thin.flags.map((f) => f.kind)).toContain('return');
    const regular = winter([run('2026-12-09'), run('2026-12-12'), run('2026-12-15'), run('2026-12-21')], '2026-12-23');
    expect(regular.flags.map((f) => f.kind)).not.toContain('return');
  });

  it('heel or knee soreness in a growing pupil goes to the coach; the same in a sixth-former is an armour swap', () => {
    const y8 = winter([run('2026-12-22', 25, { soreness: 4, soreWhere: 'heel' })], '2026-12-23', { ...AIKO, yearGroup: 'Y8' });
    expect(y8.flags.find((f) => f.kind === 'growth')?.coach).toBe(true);
    expect(suggestedSession(y8, false)).toBeUndefined();
    const y12 = winter([run('2026-12-22', 25, { soreness: 4, soreWhere: 'knee' })], '2026-12-23', { ...AIKO, yearGroup: 'Y12' });
    expect(y12.flags.map((f) => f.kind)).toContain('soreness');
    expect(suggestedSession(y12, false)).toBe('sore');
  });

  it('flags a big jump on the previous four weeks', () => {
    const parts = [run('2026-11-24', 30), run('2026-12-01', 30), run('2026-12-08', 30), run('2026-12-15', 30), run('2026-12-21', 50), run('2026-12-22', 50), run('2026-12-23', 50)];
    const w = winter(parts, '2026-12-23');
    expect(w.flags.map((f) => f.kind)).toContain('spike');
  });

  it('soreness 4+ swaps the next session for armour; 6+ goes to the coach', () => {
    const sore = winter([run('2026-12-22', 25, { soreness: 4 })], '2026-12-23');
    expect(sore.flags.find((f) => f.kind === 'soreness')?.coach).toBe(false);
    expect(sore.next).toMatch(/armour/);
    const pain = winter([run('2026-12-22', 25, { soreness: 7 })], '2026-12-23');
    expect(pain.flags.find((f) => f.kind === 'pain')?.coach).toBe(true);
    expect(pain.next).toMatch(/tell the coach/i);
  });
});

describe('main streak', () => {
  const lookup = makeLookup([], []);
  it('a kept holiday week counts; a missed one still never breaks the streak', () => {
    const w = winter([run('2026-12-22'), run('2026-12-24'), run('2027-01-05'), run('2027-01-07')], '2027-01-10');
    const kept = new Set(w.weeks.filter((x) => x.state === 'kept').map((x) => x.week));
    const s = computeStreak({ athleteId: 'aiko', perfs: [], participation: [], calendar, config: cfg, asOf: '2027-01-10', lookup, winterKept: kept });
    expect(s.weeks.map((x) => x.state)).toEqual(['counted', 'holiday', 'counted']);
    expect(s.currentStreak).toBe(2);
  });
});

describe('spring race pace on a treadmill', () => {
  it('turns a 20:00 5 km into 15.0 km/h surges and 12.0 km/h easy', () => {
    expect(pacePlan(1200, cfg)).toMatchObject({ paceSecPerKm: 240, raceKmh: 15, easyKmh: 12, inclinePct: 1 });
    expect(pacePlan(undefined, cfg)).toBeUndefined();
  });
});

describe('House Frost Cup', () => {
  it('ranks houses by the share of weeks kept, pupils only', () => {
    const a = winter([run('2026-12-22'), run('2026-12-24')], '2026-12-29');
    const b = { ...winter([], '2026-12-29', athlete('ben', { house: 'Kestrel' })) };
    const staff = { ...winter([], '2026-12-29', athlete('coach', { house: 'Kestrel', yearGroup: 'Staff' })) };
    const cup = winterHouseCup([a, b, staff], [AIKO, athlete('ben', { house: 'Kestrel' }), athlete('coach', { house: 'Kestrel', yearGroup: 'Staff' })]);
    expect(cup.map((h) => [h.house, h.members, h.share])).toEqual([
      ['Peregrine', 1, 1],
      ['Kestrel', 1, 0],
    ]);
  });
});

describe('session cards', () => {
  it('suggests the session that fits the week', () => {
    const regular = [run('2026-12-09'), run('2026-12-12'), run('2026-12-15')];
    expect(suggestedSession(winter([...regular, run('2026-12-21')], '2026-12-23'), false)).toBe('sharp');
    expect(suggestedSession(winter([...regular, run('2026-12-21', 25, { sharp: true })], '2026-12-23'), false)).toBe('easy');
    expect(suggestedSession(winter(regular, '2026-12-16'), false)).toBeUndefined(); // not a winter week
    expect(suggestedSession(winter([run('2026-12-22'), run('2026-12-24')], '2026-12-24'), false)).toBeUndefined(); // kept
    const snowRegular = [run('2027-01-01'), run('2027-01-05'), run('2027-01-08')];
    expect(suggestedSession(winter([...snowRegular, run('2027-01-12')], '2027-01-13'), false)).toBe('antidote');
    expect(suggestedSession(winter(snowRegular, '2027-01-13'), false)).toBe('treadmill');
  });

  it('fills in the runner own treadmill speeds', () => {
    const s = fillSession(WINTER_SESSIONS.find((x) => x.id === 'treadmill')!, 1200, cfg);
    expect(s.steps.join(' ')).toContain('4 × 1 minute at 15.0 km/h');
    expect(s.steps.join(' ')).toContain('12.0 km/h');
  });
});
