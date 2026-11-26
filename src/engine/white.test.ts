// White Season acceptance tests (spec §13), fictional runners only.
import { describe, expect, it } from 'vitest';
import type { Athlete, DataSnapshot, Participation, Performance } from '../types';
import { cloneConfig, currentConfig, DEFAULT_CONFIG, WHITE_MIGRATION, whiteMigration, withDefaults, type Config } from './config';
import { deriveAll } from './derive';
import { addDays, isoWeek } from './dates';
import { agedMonths, agedMonthsExact, freshness } from './scoring';
import { emptySnapshot } from '../store/Store';
import {
  computeWhite,
  ekidenPosition,
  inWinterProgramme,
  pausedDaysAfter,
  pinLine,
  seasonHolidays,
  seasonWeeks,
  suggestKmPerSession,
  teamEkiden,
  whiteRadar,
  whiteWeekKind,
  winterBadges,
} from './white';

const cfg: Config = DEFAULT_CONFIG;

function athlete(id: string, extra: Partial<Athlete> = {}): Athlete {
  return {
    id,
    givenName: 'Testa',
    familyName: id,
    preferredName: 'Testa',
    aliases: [],
    sex: 'F',
    yearGroup: 'Y9',
    yearGroupYear: 2026,
    displayMode: 'full',
    absoluteBoardOptOut: false,
    avatar: { seed: 1, skinTone: 0, hairStyle: 0, hairColour: 0, kitColour: 'academy-navy', accessory: 'none' },
    active: true,
    ...extra,
  };
}

let n = 0;
function gym(athleteId: string, date: string, card = 'E', tier: 1 | 2 | 3 | undefined = 1, hurt = false): Performance {
  n++;
  return {
    id: `g${String(n).padStart(4, '0')}`,
    athleteId,
    date,
    kind: 'gym_session',
    gym: { card, tier, hurt, holiday: whiteWeekKind(isoWeek(date), cfg.winter.season) === 'holiday' },
    verified: true,
    source: 'sheet',
    rawInput: `${card}${tier ?? ''}`,
    history: [],
  };
}

function freeze(athleteId: string, monday: string, freezeKind: Participation['freezeKind']): Participation {
  return { id: `f-${athleteId}-${monday}`, athleteId, isoWeek: isoWeek(monday), type: 'freeze', date: monday, freezeKind };
}

/** Two sessions (Mon, Wed) in each of the given week Mondays. */
function twoPerWeek(athleteId: string, mondays: string[]): Performance[] {
  return mondays.flatMap((m) => [gym(athleteId, m, 'E', 1), gym(athleteId, addDays(m, 2), 'A', 2)]);
}

const TERM = cfg.winter.season.termWeeks;
const AIKO = athlete('aiko');

function white(perfs: Performance[], asOf: string, parts: Participation[] = [], a: Athlete = AIKO, config: Config = cfg) {
  return computeWhite({ athlete: a, perfs, participation: parts, config, asOf })!;
}

function snapshot(athletes: Athlete[], performances: Performance[], participation: Participation[] = [], config: Config = cfg): DataSnapshot {
  return { ...emptySnapshot(), athletes, performances, participation, configs: [config] };
}

describe('season calendar', () => {
  it('has 18 weeks: 11 counted term weeks and 7 holiday weeks, in three holidays', () => {
    const weeks = seasonWeeks(cfg.winter.season);
    expect(weeks).toHaveLength(18);
    expect(weeks.filter((w) => whiteWeekKind(w, cfg.winter.season) === 'term')).toHaveLength(11);
    expect(seasonHolidays(cfg.winter.season).map((h) => [h.key, h.weeks.length])).toEqual([
      ['2026-12-14', 4],
      ['2027-02-15', 2],
      ['2027-04-05', 1],
    ]);
  });

  it('is off before the season starts, and for staff by default', () => {
    expect(computeWhite({ athlete: AIKO, perfs: [], participation: [], config: cfg, asOf: '2026-12-06' })).toBeUndefined();
    expect(inWinterProgramme(athlete('s', { yearGroup: 'Staff' }))).toBe(false);
    expect(inWinterProgramme(athlete('y', { yearGroup: 'Y13' }))).toBe(true);
    expect(inWinterProgramme(athlete('x', { active: false }))).toBe(false);
    expect(inWinterProgramme(athlete('s2', { yearGroup: 'Staff', winterProgramme: true }))).toBe(true);
  });
});

describe('§13.1 qualifying weeks', () => {
  it('sessions on 2 different days qualify; two on the same day do not', () => {
    expect(white([gym('aiko', '2026-12-07'), gym('aiko', '2026-12-09')], '2026-12-13').weeks[0].status).toBe('qualifying');
    const same = white([gym('aiko', '2026-12-07'), gym('aiko', '2026-12-07', 'A')], '2026-12-14').weeks[0];
    expect(same.status).toBe('frosted');
    expect(same.credited).toBe(1);
    expect(same.entries[1]).toMatchObject({ credited: false, notCredited: 'same_date' });
  });

  it('the week in progress is never a miss', () => {
    expect(white([gym('aiko', '2026-12-07')], '2026-12-09').weeks[0].status).toBe('current');
    // Sunday is still the week in progress; it is decided on Monday.
    expect(white([gym('aiko', '2026-12-07')], '2026-12-13').weeks[0].status).toBe('current');
  });
});

describe('§13.2–3 frosted, broken, Comeback Thaw (and the main streak)', () => {
  // 7 Dec qualifying; Christmas neutral; 11 Jan missed; 18 Jan qualifying.
  const perfs = twoPerWeek('aiko', ['2026-12-07', '2027-01-18']);

  it('qualifying → miss → frosted (held) → qualifying → +1 and a Comeback Thaw', () => {
    const w = white(perfs, '2027-01-24');
    expect(w.weeks.map((x) => x.status)).toEqual(['qualifying', 'neutral', 'neutral', 'neutral', 'neutral', 'frosted', 'qualifying']);
    expect(w.thaws).toBe(1);
    expect(w.weeks.at(-1)!.thaw).toBe(true);
    const d = deriveAll(snapshot([AIKO], perfs), '2027-01-24');
    expect(d.athletes.get('aiko')!.streak.currentStreak).toBe(2);
    // As of the frosted week: the streak is held at 1, not reset.
    const held = deriveAll(snapshot([AIKO], perfs), '2027-01-18');
    expect(held.athletes.get('aiko')!.streak.currentStreak).toBe(1);
    expect(d.athletes.get('aiko')!.winterBadges.map((b) => b.label)).toContain('Comeback Thaw ×1');
  });

  it('qualifying → miss → miss → streak 0 ("never miss twice")', () => {
    const p = twoPerWeek('aiko', ['2026-12-07']);
    const w = white(p, '2027-01-25');
    expect(w.weeks.slice(-3).map((x) => x.status)).toEqual(['frosted', 'broken', 'current']);
    expect(deriveAll(snapshot([AIKO], p), '2027-01-25').athletes.get('aiko')!.streak.currentStreak).toBe(0);
  });

  it('missGraceWeeks is a setting: 0 breaks on the first miss', () => {
    const c = cloneConfig(cfg);
    c.winter.missGraceWeeks = 0;
    expect(white(twoPerWeek('aiko', ['2026-12-07']), '2027-01-18', [], AIKO, c).weeks.find((x) => x.week === '2027-W02')!.status).toBe('broken');
  });

  it('carries the Gold Season streak into winter (same counter)', () => {
    const circuit = (date: string): Performance => ({ id: `c${date}`, athleteId: 'aiko', date, kind: 'circuit', distanceKm: 1.3, timeSec: 330, verified: true, source: 'coach', rawInput: '', history: [] });
    const gold = ['2026-11-16', '2026-11-23', '2026-11-30'].map(circuit);
    const d = deriveAll(snapshot([AIKO], [...gold, ...twoPerWeek('aiko', ['2026-12-07'])]), '2026-12-13');
    expect(d.athletes.get('aiko')!.streak.currentStreak).toBe(4);
  });
});

describe('§13.4 self recovery freezes', () => {
  it('a self RF makes its week neutral; two per half-term; a third is evaluated as a miss', () => {
    const rf = ['2027-01-11', '2027-01-18', '2027-01-25'].map((m) => freeze('aiko', m, 'self_rf'));
    const w = white(twoPerWeek('aiko', ['2026-12-07', '2027-02-01']), '2027-02-07', rf);
    const by = (wk: string) => w.weeks.find((x) => x.week === wk)!;
    expect(by('2027-W02')).toMatchObject({ status: 'neutral', neutralBy: 'self_rf', rf: 'used' });
    expect(by('2027-W03')).toMatchObject({ status: 'neutral', rf: 'used' });
    expect(by('2027-W04')).toMatchObject({ status: 'frosted', rf: 'over_allowance' });
    expect(w.rfUsed['spring1-2027']).toBe(2);
  });

  it('an RF in a week that already qualifies is ignored and uses none of the allowance', () => {
    const w = white(twoPerWeek('aiko', ['2027-01-11']), '2027-01-17', [freeze('aiko', '2027-01-11', 'self_rf')]);
    expect(w.weeks.at(-1)).toMatchObject({ status: 'qualifying', rf: 'ignored_qualified' });
    expect(w.rfUsed['spring1-2027'] ?? 0).toBe(0);
  });

  it('coach and medical freezes have no limit; an old freeze without a kind reads as a coach freeze', () => {
    const parts = [freeze('aiko', '2027-01-11', 'medical'), freeze('aiko', '2027-01-18', 'medical'), freeze('aiko', '2027-01-25', 'medical'), freeze('aiko', '2027-02-01', undefined)];
    const w = white([], '2027-02-07', parts);
    expect(w.weeks.filter((x) => x.neutralBy === 'medical')).toHaveLength(3);
    expect(w.weeks.find((x) => x.week === '2027-W05')!.neutralBy).toBe('coach');
  });
});

describe('§13.5 holidays', () => {
  it('holiday weeks are neutral; holiday sessions add km and count towards Holiday Hero', () => {
    const p = ['2026-12-15', '2026-12-17', '2026-12-22', '2026-12-29'].map((d) => gym('aiko', d, 'H', 1));
    const w = white(p, '2027-01-03');
    expect(w.weeks.filter((x) => x.kind === 'holiday').every((x) => x.status === 'neutral')).toBe(true);
    expect(w.holidayCredits['2026-12-14']).toBe(4);
    expect(p.every((x) => x.gym!.holiday)).toBe(true);
    const c = cloneConfig(cfg);
    c.winter.kmPerSession = 0.5;
    const team = teamEkiden([w], c);
    expect(team.totalKm).toBe(2);
    expect(winterBadges(w, c, team).map((b) => b.label)).toContain('Holiday Hero');
  });
});

describe('§13.6 cap and radar', () => {
  it('5 sessions in one week → 3 credited, and the radar flags 4+', () => {
    const p = [0, 1, 2, 3, 4].map((i) => gym('aiko', addDays('2027-01-11', i)));
    const w = white(p, '2027-01-17');
    expect(w.weeks.at(-1)!.credited).toBe(3);
    expect(w.weeks.at(-1)!.entries.filter((e) => e.notCredited === 'over_cap')).toHaveLength(2);
    const radar = whiteRadar([w], [AIKO], cfg, '2027-W02');
    expect(radar.many).toEqual([{ athleteId: 'aiko', logged: 5 }]);
  });

  it('lists "!" entries, Summit without a pass, quiet runners and RF used up', () => {
    const ben = athlete('ben', { summitPass: { date: '2027-01-12' } });
    const chika = athlete('chika');
    const aikoW = white([gym('aiko', '2027-01-25', 'A', 3), gym('aiko', '2027-01-26', 'E', 1, true)], '2027-02-01');
    const benW = white([gym('ben', '2027-01-25', 'A', 3), gym('ben', '2027-01-27', 'S', 2)], '2027-02-01', [], ben);
    const chikaW = white([gym('chika', '2027-01-12', 'E')], '2027-02-01', ['2027-01-11', '2027-01-18'].map((m) => freeze('chika', m, 'self_rf')), chika);
    const quiet = white([], '2027-02-01', [], athlete('dai'));
    const r = whiteRadar([aikoW, benW, chikaW, quiet], [AIKO, ben, chika, athlete('dai')], cfg, '2027-W04');
    expect(r.hurt).toEqual([{ athleteId: 'aiko', date: '2027-01-26', card: 'E', tier: 1 }]);
    expect(r.summitNoPass.map((x) => x.athleteId)).toEqual(['aiko']);
    expect(r.quiet).toContain('dai');
    // Chika's last two counted weeks: a self RF (18 Jan) and nothing (25 Jan). A self RF does not excuse her from the list.
    expect(r.quiet).toContain('chika');
    expect(r.quiet).not.toContain('aiko');
    expect(r.rfUsedUp).toEqual(['chika']);
  });
});

describe('§13.7 freshness pause (Winter Shield)', () => {
  const race: Performance = { id: 'race1', athleteId: 'aiko', date: '2026-05-07', kind: 'race', distanceKm: 5, timeSec: 1260, verified: true, source: 'coach', rawInput: '', history: [] };
  const grace3 = cloneConfig(cfg);
  grace3.freshness.decayGraceMonths = 3;
  const allTerm = twoPerWeek('aiko', TERM);

  it('pure: monthsOld = (asOf − date − pausedDays), in whole months as elsewhere', () => {
    expect(agedMonths('2026-05-07', '2027-04-07', 122)).toBe(agedMonths('2026-05-07', '2026-12-06'));
    expect(agedMonths('2026-05-07', '2027-04-07', 0)).toBe(11);
    expect(agedMonthsExact('2026-05-07', '2027-04-07', 122)).toBeCloseTo(agedMonthsExact('2026-05-07', '2026-12-06'), 10);
    expect(pausedDaysAfter([{ monday: '2027-01-11', paused: true }, { monday: '2027-01-18', paused: false }], '2027-01-13', '2027-01-20')).toBe(4);
  });

  it('no frosted or broken weeks all winter: the same penalty on 7 Apr 2027 as on 6 Dec 2026', () => {
    const w = white(allTerm, '2027-04-07', [], AIKO, grace3);
    expect(w.weeks.every((x) => x.status === 'qualifying' || x.status === 'neutral')).toBe(true);
    const paused = pausedDaysAfter(w.weeks, race.date, '2027-04-07');
    expect(paused).toBe(122);
    const before = freshness(80, race.date, '2026-12-06', grace3);
    const after = freshness(80, race.date, '2027-04-07', grace3, paused);
    expect(after.penalty).toBe(before.penalty);
    expect(before.penalty).toBe(3);
    // Through the whole engine: the same RACE rating on both days.
    const s = snapshot([AIKO], [race, ...allTerm], [], grace3);
    expect(deriveAll(s, '2027-04-07').athletes.get('aiko')!.ratings.race.value).toBe(deriveAll(s, '2026-12-06').athletes.get('aiko')!.ratings.race.value);
  });

  it('with 3 frosted weeks it ages by exactly those 21 days', () => {
    const skip = new Set(['2027-01-18', '2027-03-01', '2027-03-15']);
    const w = white(twoPerWeek('aiko', TERM.filter((m) => !skip.has(m))), '2027-04-07', [], AIKO, grace3);
    expect(w.weeks.filter((x) => x.status === 'frosted')).toHaveLength(3);
    expect(pausedDaysAfter(w.weeks, race.date, '2027-04-07')).toBe(122 - 21);
    expect(w.shield).toBe('on');
  });

  it('with no winter sessions at all it ages normally', () => {
    const w = white([], '2027-04-07', [], AIKO, grace3);
    expect(pausedDaysAfter(w.weeks, race.date, '2027-04-07')).toBe(0);
    expect(w.shield).toBe('off');
    const s = snapshot([AIKO], [race], [], grace3);
    const off = cloneConfig(grace3);
    off.winter.whiteEnabled = false;
    expect(deriveAll(s, '2027-04-07').athletes.get('aiko')!.ratings.race.value).toBe(deriveAll(snapshot([AIKO], [race], [], off), '2027-04-07').athletes.get('aiko')!.ratings.race.value);
  });

  it('shows frosted when the latest completed counted week was frosted', () => {
    const w = white(twoPerWeek('aiko', ['2027-01-11']), '2027-01-27');
    expect(w.frosted).toBe(true);
    expect(w.shield).toBe('frosted');
  });
});

describe('§13.8 the Winter Ekiden board', () => {
  it('kmPerSession 0.55 and 200 credited sessions → 110.0 km, Day 2, leg 6, 18.3 km to Odawara', () => {
    const pos = ekidenPosition(Math.round(0.55 * 200 * 10) / 10, cfg.winter.route);
    expect(pos).toMatchObject({ km: 110, day: 2, leg: 6, kmToNext: 18.3, finished: false });
    expect(pos.next.name).toBe('Odawara');
  });

  it('the pin line, the finish and the victory lap', () => {
    expect(pinLine(ekidenPosition(63.2, cfg.winter.route))).toBe('Move the pin to 63.2 km (2.6 km before Hiratsuka).');
    const done = ekidenPosition(220, cfg.winter.route);
    expect(done).toMatchObject({ finished: true, lapKm: 2.9 });
    expect(ekidenPosition(0, cfg.winter.route)).toMatchObject({ leg: 1, day: 1, kmToNext: 21.3 });
  });

  it('suggests km per session for the roster, rounded to 0.05 km', () => {
    expect(suggestKmPerSession(36, cfg)).toBe(0.55); // 217.1 / (36 × 11) = 0.548
  });

  it('Winter Ekiden Finisher: a credited session by the time the team reaches the finish', () => {
    const c = cloneConfig(cfg);
    c.winter.kmPerSession = 100;
    const a = white(twoPerWeek('aiko', ['2026-12-07']), '2027-01-17', [], AIKO, c);
    const late = white(twoPerWeek('ben', ['2027-01-11']), '2027-01-17', [], athlete('ben'), c);
    const team = teamEkiden([a, late], c);
    expect(team.finishedOn).toBe('2027-01-11');
    expect(team.finishers.sort()).toEqual(['aiko', 'ben']);
  });
});

describe('§13.13 ratings untouched', () => {
  it('importing 50 gym sessions leaves every rating and OVR identical', () => {
    const roster = ['aiko', 'ben', 'chika', 'dai', 'emi'].map((id) => athlete(id));
    const results: Performance[] = roster.flatMap((a, i) => [
      { id: `r-${a.id}`, athleteId: a.id, date: '2026-11-14', kind: 'race', distanceKm: 5, timeSec: 1200 + i * 30, verified: true, source: 'coach', rawInput: '', history: [] },
      { id: `c-${a.id}`, athleteId: a.id, date: '2026-11-20', kind: 'circuit', distanceKm: 1.3, timeSec: 320 + i * 5, verified: true, source: 'coach', rawInput: '', history: [] },
    ]);
    const sessions = roster.flatMap((a) => Array.from({ length: 10 }, (_, k) => gym(a.id, addDays('2026-12-07', k * 3), 'X', 2)));
    expect(sessions).toHaveLength(50);
    const before = deriveAll(snapshot(roster, results), '2027-01-20');
    const after = deriveAll(snapshot(roster, [...results, ...sessions]), '2027-01-20');
    for (const a of roster) {
      const b = before.athletes.get(a.id)!.ratings;
      const x = after.athletes.get(a.id)!.ratings;
      expect(x.ovr).toEqual(b.ovr);
      expect(x.race).toEqual(b.race);
      expect(x.stats).toEqual(b.stats);
      // A gym session is never scored and feeds nothing.
      for (const ps of x.perfScores.filter((p) => p.kind === 'gym_session')) {
        expect(ps.feeds).toEqual([]);
        expect(ps.score).toBeUndefined();
      }
    }
  });
});

describe('config migration', () => {
  it('a store without White Season gets one new version, once; older versions read with it off', () => {
    const old = cloneConfig(DEFAULT_CONFIG) as unknown as Record<string, unknown>;
    const winter = { ...(old.winter as Record<string, unknown>) };
    delete winter.season;
    delete winter.whiteEnabled;
    const stored = { ...old, winter } as unknown as Config;
    expect(withDefaults(stored).winter.whiteEnabled).toBe(false);
    const m = whiteMigration([stored], '2026-11-27T00:00:00Z')!;
    expect(m.migration).toBe(WHITE_MIGRATION);
    expect(m.version).toBe(2);
    expect(currentConfig([stored, m]).winter.whiteEnabled).toBe(true);
    expect(currentConfig([stored, m]).winter.season.termWeeks).toHaveLength(11);
    expect(whiteMigration([stored, m], '2026-11-28T00:00:00Z')).toBeUndefined();
    expect(whiteMigration([DEFAULT_CONFIG], '2026-11-28T00:00:00Z')).toBeUndefined();
  });
});
