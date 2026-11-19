// The pupil's Trail: this week, missions, the squad quest, the spirits and what is new since last time.
import { describe, expect, it } from 'vitest';
import type { Athlete, DataSnapshot, Performance } from '../types';
import { SCHEMA_VERSION } from '../types';
import { DEFAULT_CONFIG } from './config';
import { deriveAll } from './derive';
import { buildDemoData, seedCourses, CAMPUS_CIRCUIT_ID } from '../demo/demoData';
import { emptySnapshot } from '../store/Store';
import { isoWeek } from './dates';
import { squadQuest, trailWeek, weeklyMissions } from './trail';
import { COMPANIONS, defaultCompanion, LORE, pickForDay, SPIRITS, STAT_SPIRIT, STAT_SPIRITS } from './spirits';
import { momentsSince, seenState } from './moments';
import { STAT_KEYS } from './types';

const cfg = DEFAULT_CONFIG;
const TODAY = '2026-11-19'; // a Thursday

function athlete(id: string, over: Partial<Athlete> = {}): Athlete {
  return {
    id, givenName: id, familyName: 'Test', preferredName: id, aliases: [], sex: 'F', yearGroup: 'Y9', yearGroupYear: 2026, displayMode: 'first_initial', absoluteBoardOptOut: false,
    avatar: { seed: 1, skinTone: 0, hairStyle: 0, hairColour: 0, kitColour: 'academy-navy', accessory: 'none' }, active: true, ...over,
  };
}
let n = 0;
const circuit = (athleteId: string, date: string, timeSec = 600): Performance => ({ id: `p${++n}`, athleteId, date, kind: 'circuit', courseId: CAMPUS_CIRCUIT_ID, timeSec, verified: true, source: 'coach', rawInput: '', history: [] });

function snap(athletes: Athlete[], performances: Performance[], extra: Partial<DataSnapshot> = {}): DataSnapshot {
  return { schemaVersion: SCHEMA_VERSION, athletes, courses: seedCourses(), events: [], performances, participation: [], achievements: [], configs: [cfg], calendar: { holidayWeeks: [], halfTerms: [] }, meta: {}, ...extra };
}

/** Circuit runs on the Wednesday of each of the last `weeks` weeks (and this week if `thisWeek`). */
function regular(id: string, weeks: number, thisWeek: boolean): Performance[] {
  const out: Performance[] = [];
  for (let i = weeks; i >= 1; i--) out.push(circuit(id, new Date(Date.UTC(2026, 10, 18 - 7 * i)).toISOString().slice(0, 10)));
  if (thisWeek) out.push(circuit(id, '2026-11-18'));
  return out;
}

describe('this week on the trail', () => {
  it('kept, open, waiting for the coach, and a holiday week', () => {
    const s = snap([athlete('a'), athlete('b')], [...regular('a', 3, true), ...regular('b', 3, false)]);
    const d = deriveAll(s, TODAY);
    const a = trailWeek(d.athletes.get('a')!, cfg, TODAY);
    expect(a).toMatchObject({ status: 'kept', streak: 4, next: 4, daysLeft: 4, milestone: { at: 8, toGo: 4, held: false } });
    const b = trailWeek(d.athletes.get('b')!, cfg, TODAY);
    expect(b).toMatchObject({ status: 'open', streak: 3, next: 4, milestone: { at: 4, toGo: 1, held: false }, comeback: false });
    expect(trailWeek(d.athletes.get('b')!, cfg, TODAY, 1).status).toBe('pending');
    const hol = deriveAll({ ...s, calendar: { holidayWeeks: [isoWeek(TODAY)], halfTerms: [] } }, TODAY);
    expect(trailWeek(hol.athletes.get('b')!, cfg, TODAY).status).toBe('holiday');
  });

  it('a copy of the ratings from an earlier week: this week is open, the gap is read from the calendar', () => {
    const s = snap([athlete('a')], regular('a', 3, true));
    const old = deriveAll(s, TODAY).athletes.get('a')!; // worked out on Thursday of week 47
    // Opened the next Tuesday (week 48): week 47 was kept, so the trail is 4 and this week is open.
    expect(trailWeek(old, cfg, '2026-11-24')).toMatchObject({ status: 'open', streak: 4, next: 5, daysLeft: 6 });
    // Opened two weeks later: week 48 is not known to be kept, unless it was a holiday.
    expect(trailWeek(old, cfg, '2026-12-01')).toMatchObject({ status: 'open', streak: 0, best: 4, comeback: true });
    const t = trailWeek(old, cfg, '2026-12-01', 0, new Set(['2026-W48']));
    expect(t).toMatchObject({ streak: 4 });
    expect(t.recent.slice(-3).map((w) => w.state)).toEqual(['counted', 'holiday', 'current']);
  });

  it('a lapsed streak is a comeback, and Sunday has one day left', () => {
    const s = snap([athlete('a')], [circuit('a', '2026-10-07'), circuit('a', '2026-10-14')]);
    const tw = trailWeek(deriveAll(s, '2026-11-22').athletes.get('a')!, cfg, '2026-11-22');
    expect(tw).toMatchObject({ status: 'open', streak: 0, best: 2, comeback: true, daysLeft: 1 });
  });

  it('missions: the trail first, three at most, a holiday rests with the dugong', () => {
    const s = snap([athlete('a')], regular('a', 2, false));
    const d = deriveAll(s, TODAY).athletes.get('a')!;
    const m = weeklyMissions(d, cfg, trailWeek(d, cfg, TODAY));
    expect(m[0]).toMatchObject({ id: 'trail', title: 'Keep your 2-week trail', done: false, spirit: 'serow' });
    expect(m.length).toBeLessThanOrEqual(3);
    expect(m.some((x) => x.kind === 'awaken')).toBe(true);
    const hol = deriveAll({ ...s, calendar: { holidayWeeks: [isoWeek(TODAY)], halfTerms: [] } }, TODAY).athletes.get('a')!;
    expect(weeklyMissions(hol, cfg, trailWeek(hol, cfg, TODAY))[0]).toMatchObject({ spirit: 'dugong', done: true });
  });

  it('every demo runner gets a trail and missions without throwing', () => {
    const s = { ...emptySnapshot(), ...buildDemoData(TODAY), configs: [cfg] };
    const d = deriveAll(s, TODAY);
    for (const a of d.athletes.values()) {
      const tw = trailWeek(a, cfg, TODAY);
      const m = weeklyMissions(a, cfg, tw);
      expect(m[0].id).toBe('trail');
      expect(m.every((x) => x.title && x.detail)).toBe(true);
    }
  });
});

describe('the squad quest', () => {
  it('counts kept weeks without naming anyone, leaves staff out, and aims past the recent best', () => {
    const people = ['a', 'b', 'c', 'd'].map((id) => athlete(id));
    const staff = athlete('s', { yearGroup: 'Staff' });
    const perfs = [...regular('a', 4, true), ...regular('b', 4, false), ...regular('c', 1, false), ...regular('s', 4, true)];
    const q = squadQuest(deriveAll(snap([...people, staff], perfs), TODAY), TODAY);
    // Last four weeks: 2, 2, 2, 3 kept → best 3, target 4 (all of them); this week only a.
    expect(q).toMatchObject({ runners: 4, kept: 1, lastWeek: 3, bestRecent: 3, target: 4, reached: false });
  });

  it('never asks for more than the whole squad, nor less than half', () => {
    const q = squadQuest(deriveAll(snap([athlete('a'), athlete('b'), athlete('c')], []), TODAY), TODAY);
    expect(q).toMatchObject({ runners: 3, kept: 0, target: 2 });
    expect(squadQuest(deriveAll(snap([], []), TODAY), TODAY)).toMatchObject({ runners: 0, target: 0, reached: false });
  });
});

describe('the spirits', () => {
  it('one spirit per stat and one for RACE, all different, each with facts', () => {
    expect(new Set(STAT_SPIRITS).size).toBe(6);
    expect(STAT_SPIRIT.RACE).toBe('monkey');
    for (const k of STAT_KEYS) expect(SPIRITS[STAT_SPIRIT[k]].stat).toBe(k);
    for (const s of Object.values(SPIRITS)) {
      expect(s.facts.length).toBeGreaterThanOrEqual(2);
      expect(s.why.length).toBeGreaterThan(20);
    }
    expect(COMPANIONS).toContain('monkey');
    expect(LORE.length).toBeGreaterThan(5);
  });

  it('the default companion is the strongest stat, the serow when nothing is unlocked', () => {
    expect(defaultCompanion({ SPD: { locked: false, value: 70 }, NAV: { locked: false, value: 81 }, ARM: { locked: true } })).toBe('owl');
    expect(defaultCompanion({ SPD: { locked: false, value: 70 }, END: { locked: false, value: 70 } })).toBe('falcon');
    expect(defaultCompanion({})).toBe('serow');
  });

  it('a line picked for a day stays put that day', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    expect(pickForDay(items, '2026-11-19')).toBe(pickForDay(items, '2026-11-19'));
    const days = Array.from({ length: 30 }, (_, i) => pickForDay(items, `2026-11-${String(i + 1).padStart(2, '0')}`));
    expect(new Set(days).size).toBeGreaterThan(2);
  });
});

describe('what is new since last time', () => {
  const s = snap([athlete('a')], regular('a', 5, true));
  const d = deriveAll(s, TODAY).athletes.get('a')!;

  it('nothing on a first visit, nothing when nothing changed', () => {
    expect(momentsSince(undefined, d)).toEqual([]);
    expect(momentsSince(seenState(d), d)).toEqual([]);
  });

  it('a stat up, a week kept and a new badge, biggest first; a dip is never a moment', () => {
    const now = seenState(d);
    const prev = { ...now, stats: { ...now.stats }, badges: now.badges.filter((b) => b !== 'streak-4'), keptWeeks: now.keptWeeks - 1, streak: now.streak - 1 };
    const k = Object.keys(now.stats)[0] as keyof typeof now.stats;
    prev.stats[k] = (now.stats[k] ?? 60) - 3;
    const m = momentsSince(prev, d);
    expect(m.map((x) => x.kind)).toEqual(['week', 'stat']);
    expect(m[0]).toMatchObject({ title: '4-week trail!', big: true });
    expect(m[1].title).toBe(`${k} ${now.stats[k]! - 3} → ${now.stats[k]}`);
    const dipped = { ...now, stats: { ...now.stats, [k]: now.stats[k]! + 5 }, ovr: (now.ovr ?? 0) + 4 };
    expect(momentsSince(dipped, d)).toEqual([]);
  });

  it('a stat unlocked awakens its spirit; a tier up is the biggest moment', () => {
    const now = seenState(d);
    const k = Object.keys(now.stats)[0] as keyof typeof now.stats;
    const { [k]: _gone, ...rest } = now.stats;
    const m = momentsSince({ ...now, stats: rest, tier: 'bronze' }, d);
    if (now.tier !== 'bronze') expect(m[0].kind).toBe('tier');
    const awaken = m.find((x) => x.kind === 'awaken')!;
    expect(awaken).toMatchObject({ big: true, spirit: STAT_SPIRIT[k] });
  });

  it('a PB says how much better', () => {
    const now = seenState(d);
    const key = Object.keys(now.pbs)[0];
    const m = momentsSince({ ...now, pbs: { ...now.pbs, [key]: now.pbs[key] + 12 } }, d);
    expect(m).toHaveLength(1);
    expect(m[0].detail).toMatch(/12 s faster/);
  });
});

describe('trail finds', () => {
  it('found badges first, then one next step per ladder', async () => {
    const { trailFinds } = await import('./trail');
    const s = snap([athlete('a')], regular('a', 5, true));
    const d = deriveAll(s, TODAY).athletes.get('a')!;
    const f = trailFinds(d, cfg);
    const firstTodo = f.findIndex((x) => !x.found);
    expect(f.slice(0, firstTodo).every((x) => x.found)).toBe(true);
    expect(f.slice(firstTodo).every((x) => !x.found && x.how)).toBe(true);
    expect(f.find((x) => x.key === 'streak-4')?.found).toBe(true);
    expect(f.find((x) => x.key === 'streak-8')).toMatchObject({ found: false, how: 'Keep 8 weeks in a row (holiday weeks hold it).' });
    expect(f.filter((x) => x.key.startsWith('streak-') && !x.found)).toHaveLength(1);
  });
});
