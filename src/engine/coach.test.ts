import { describe, expect, it } from 'vitest';
import type { Athlete, DataSnapshot, Performance } from '../types';
import { SCHEMA_VERSION } from '../types';
import { DEFAULT_CONFIG } from './config';
import { deriveAll } from './derive';
import { buildDemoData, seedCourses, CAMPUS_CIRCUIT_ID } from '../demo/demoData';
import { climbers, coachToDos, currentWindow, developmentFocus, houseCup, levelUps, notSeenLately, setupChecklist, summitLadder } from './coach';

const cfg = DEFAULT_CONFIG;
const TODAY = '2026-11-05';

function athlete(id: string, over: Partial<Athlete> = {}): Athlete {
  return {
    id, givenName: id, familyName: 'Test', preferredName: id, aliases: [], sex: 'F', yearGroup: 'Y9', yearGroupYear: 2026, displayMode: 'first_initial', absoluteBoardOptOut: false,
    avatar: { seed: 1, skinTone: 0, hairStyle: 0, hairColour: 0, kitColour: 'academy-navy', accessory: 'none' }, active: true, ...over,
  };
}
let n = 0;
const perf = (athleteId: string, over: Partial<Performance>): Performance => ({ id: `p${++n}`, athleteId, date: '2026-10-20', kind: 'circuit', courseId: CAMPUS_CIRCUIT_ID, verified: true, source: 'coach', rawInput: '', history: [], ...over });

function snap(athletes: Athlete[], performances: Performance[], extra: Partial<DataSnapshot> = {}): DataSnapshot {
  return { schemaVersion: SCHEMA_VERSION, athletes, courses: seedCourses(), events: [], performances, participation: [], achievements: [], configs: [cfg], calendar: { holidayWeeks: [], halfTerms: [] }, meta: {}, ...extra };
}

describe('summit ladder', () => {
  it('no OVR yet: unlock stats first', () => {
    const d = deriveAll(snap([athlete('a')], [perf('a', { timeSec: 400 })]), TODAY).athletes.get('a')!;
    const l = summitLadder(d, cfg);
    expect(l).toMatchObject({ tier: 'bronze', next: 'silver', progress: 0 });
    expect(l.headline).toBe('Unlock 1 more stat to start the climb.');
  });

  it('bronze with an OVR: points to Silver', () => {
    const d = deriveAll(snap([athlete('a')], [perf('a', { timeSec: 420 }), perf('a', { kind: 'bleep', bleepLaps: 20, courseId: undefined })]), TODAY).athletes.get('a')!;
    const l = summitLadder(d, cfg);
    expect(d.ratings.tier).toBe('bronze');
    expect(l.headline).toBe(`Silver needs ${cfg.tiers.silverMin - d.ratings.ovr.value!} more OVR point${cfg.tiers.silverMin - d.ratings.ovr.value! === 1 ? '' : 's'}.`);
    expect(l.progress).toBeGreaterThan(0);
    expect(l.progress).toBeLessThan(1);
  });

  it('every demo athlete gets a ladder with a headline and a progress between 0 and 1', () => {
    const demo = buildDemoData(TODAY);
    const d = deriveAll({ ...snap([], []), ...demo, configs: [cfg], meta: {} }, TODAY);
    for (const a of d.athletes.values()) {
      const l = summitLadder(a, cfg);
      expect(l.headline).toMatch(/\S/);
      expect(l.headline).not.toMatch(/undefined|NaN/);
      expect(l.progress).toBeGreaterThanOrEqual(0);
      expect(l.progress).toBeLessThanOrEqual(1);
      expect(l.tier).toBe(a.ratings.tier);
    }
  });
});

describe('development focus', () => {
  it('names the weakest stat against the runner’s own average, locked stats to unlock, and a superpower', () => {
    const d = deriveAll(snap([athlete('a')], [perf('a', { timeSec: 300 }), perf('a', { kind: 'bleep', bleepLaps: 12, courseId: undefined })]), TODAY).athletes.get('a')!;
    const f = developmentFocus(d, cfg);
    expect(f.find((x) => x.kind === 'focus')?.stat).toBe('END');
    expect(f.find((x) => x.kind === 'superpower')?.stat).toBe('SPD');
    expect(f.filter((x) => x.kind === 'unlock').map((x) => x.stat)).toEqual(['CLB', 'DSC', 'NAV', 'ARM']);
    expect(f.find((x) => x.kind === 'focus')!.ideas.length).toBeGreaterThan(0);
  });

  it('an old result is flagged for freshening', () => {
    const d = deriveAll(snap([athlete('a')], [perf('a', { timeSec: 300, date: '2026-01-10' })]), TODAY).athletes.get('a')!;
    expect(developmentFocus(d, cfg).find((x) => x.kind === 'refresh')?.stat).toBe('SPD');
  });
});

describe('checklist, to-dos and not seen lately', () => {
  it('an empty start lists what to set up', () => {
    const s = snap([], []);
    const items = setupChecklist(s, deriveAll(s, TODAY), TODAY);
    expect(items.find((i) => i.id === 'roster')?.done).toBe(false);
    expect(items.find((i) => i.id === 'demo')?.done).toBe(true);
    expect(items.find((i) => i.id === 'backup')).toMatchObject({ done: false, detail: 'Never' });
  });

  it('runners with nothing in three weeks are listed; staff are not', () => {
    const s = snap([athlete('seen'), athlete('lost'), athlete('coach', { yearGroup: 'Staff' })], [perf('seen', { date: '2026-11-01' }), perf('lost', { date: '2026-09-01' })]);
    const d = deriveAll(s, TODAY);
    expect(notSeenLately(s, d).map((x) => x.athlete.id)).toEqual(['lost']);
    expect(coachToDos(s, d).find((t) => t.id === 'lost')?.count).toBe(1);
  });
});

describe('level-ups and climbers', () => {
  it('a new PB this week shows as a level-up; nothing changed means no entry', () => {
    const s = snap([athlete('a'), athlete('b')], [perf('a', { timeSec: 330, date: '2026-10-01' }), perf('a', { timeSec: 310, date: '2026-11-03' }), perf('b', { timeSec: 330, date: '2026-10-01' })]);
    const before = deriveAll(s, '2026-10-29');
    const after = deriveAll(s, TODAY);
    const ups = levelUps(before, after);
    expect(ups.map((u) => u.athleteId)).toEqual(['a']);
    expect(ups[0].lines.join(' ')).toMatch(/SPD \d+ → \d+/);
    expect(ups[0].lines.join(' ')).toMatch(/PB −20 s/);
    const c = climbers(before, after);
    expect(c[0]).toMatchObject({ athleteId: 'a', best: { key: 'SPD' } });
  });

  it('the demo week has level-ups, smallest first', () => {
    const demo = buildDemoData(TODAY);
    const s = { ...snap([], []), ...demo, configs: [cfg], meta: {} };
    const ups = levelUps(deriveAll(s, '2026-10-29'), deriveAll(s, TODAY));
    expect(ups.length).toBeGreaterThan(0);
    for (let i = 1; i < ups.length; i++) expect(ups[i].weight).toBeGreaterThanOrEqual(ups[i - 1].weight);
  });
});

describe('house cup', () => {
  it('points for turning up and PBs, per member, so a small house can win', () => {
    const s = snap(
      [athlete('a1', { house: 'Matsu' }), athlete('a2', { house: 'Matsu' }), athlete('a3', { house: 'Matsu' }), athlete('b1', { house: 'Ume' }), athlete('x')],
      [
        perf('a1', { timeSec: 330, date: '2026-10-13' }),
        perf('b1', { timeSec: 330, date: '2026-10-13' }),
        perf('b1', { timeSec: 320, date: '2026-10-20' }),
        perf('b1', { timeSec: 310, date: '2026-10-27' }),
      ],
    );
    const cup = houseCup(deriveAll(s, TODAY), '2026-10-05', TODAY);
    expect(cup.map((h) => h.house)).toEqual(['Ume', 'Matsu']);
    // Ume: 3 counted weeks (3) + 2 PBs (6) = 9 for 1 member
    expect(cup[0]).toMatchObject({ members: 1, weeks: 3, pbs: 2, points: 9, perMember: 9 });
    expect(cup[1]).toMatchObject({ members: 3, points: 1, perMember: 0.3 });
  });

  it('the window is the current half-term, else six weeks', () => {
    const s = snap([], [], { calendar: { holidayWeeks: [], halfTerms: [{ id: 'h', name: 'Autumn 2', start: '2026-11-02', end: '2026-12-18' }] } });
    expect(currentWindow(s, TODAY)).toEqual({ from: '2026-11-02', to: TODAY, label: 'Autumn 2' });
    expect(currentWindow(snap([], []), TODAY)).toEqual({ from: '2026-09-24', to: TODAY, label: 'the last six weeks' });
  });
});
