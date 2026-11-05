import { describe, expect, it } from 'vitest';
import type { Athlete, DataSnapshot } from '../../types';
import { SCHEMA_VERSION } from '../../types';
import { DEFAULT_CONFIG } from '../config';
import { applyChanges } from '../../store/changes';
import { deriveAll } from '../derive';
import { seedCourses, CAMPUS_CIRCUIT_ID } from '../../demo/demoData';
import { parseLineFormat } from './lineFormat';
import { buildImportPlan, decisionFor, planToChanges, type RowDecision } from './plan';
import { detectRosterLayout, parseRoster } from './roster';
import { parseTable } from './table';

const TODAY = '2026-12-01';
const cfg = DEFAULT_CONFIG;

function athlete(id: string, given: string, family: string, sex: 'M' | 'F', yearGroup: Athlete['yearGroup'], aliases: string[] = []): Athlete {
  return {
    id,
    givenName: given,
    familyName: family,
    preferredName: given,
    aliases,
    sex,
    yearGroup,
    yearGroupYear: 2026,
    displayMode: 'full',
    absoluteBoardOptOut: false,
    avatar: { seed: 1, skinTone: 0, hairStyle: 0, hairColour: 0, kitColour: 'academy-navy', accessory: 'none' },
    active: true,
  };
}

const ROSTER = [
  athlete('aiko', 'Aiko', 'Testfield', 'F', 'Y9'),
  athlete('ben', 'Ben', 'Sampleton', 'M', 'Y10'),
  athlete('hana', 'Hana', 'Mockridge', 'F', 'Y9', ['モックリッジ ハナ']),
  athlete('kenji', 'Kenji', 'Demoyama', 'M', 'Y11'),
  athlete('coach', 'Coach', 'Example', 'M', 'Staff'),
];

function snapshot(extra: Partial<DataSnapshot> = {}): DataSnapshot {
  return {
    schemaVersion: SCHEMA_VERSION,
    athletes: ROSTER,
    courses: seedCourses(),
    events: [],
    performances: [],
    participation: [],
    achievements: [],
    configs: [cfg],
    calendar: { holidayWeeks: [], halfTerms: [] },
    meta: {},
    ...extra,
  };
}

const ids = () => {
  let n = 0;
  return (p: string) => `${p}-${++n}`;
};
const commitCtx = () => ({ now: '2026-12-01T10:00:00.000Z', by: 'Coach', newId: ids() });

// The spec 4.3 example, with invented names.
const LINE_EXAMPLE = `# event: Hachimantai Ekiden | 2026-11-01 | relay_leg | 2.0 km | climb 20 m
Aiko Testfield, 8:10, leg 2, team Peregrine
Kenji D, 7:55, leg 4, team Golden Eagle, raced earlier
# event: Campus Circuit | 2026-11-04 | circuit
Ben Sampleton 4:52
# event: Higashi-Matsushima XC | 2026-11-29 | race | 4.0 km | place 7/23
Aiko Testfield 16:15
# test: bleep | 2026-11-10
Ben Sampleton 64 laps
# test: arm | 2026-11-10
Aiko Testfield ankle 11 calf 18 stork 22 hop yes
# participation: saturday_run | 2026-11-07
Aiko Testfield, Ben Sampleton
# event: Chiang Mai Trail 64K | 2026-12-20 | race | 64 km | climb 2800 m
Coach Example 9:45:00`;

describe('Tasuki line format (spec 4.3)', () => {
  const p = parseLineFormat(LINE_EXAMPLE, { today: TODAY, config: cfg });

  it('reads every header', () => {
    expect(p.format).toBe('line');
    expect(p.sections.map((s) => [s.type, s.name, s.date, s.perfKind ?? s.participationType])).toEqual([
      ['event', 'Hachimantai Ekiden', '2026-11-01', 'relay_leg'],
      ['event', 'Campus Circuit', '2026-11-04', 'circuit'],
      ['event', 'Higashi-Matsushima XC', '2026-11-29', 'race'],
      ['test', 'Bleep test', '2026-11-10', 'bleep'],
      ['test', 'ARM tests', '2026-11-10', 'arm'],
      ['participation', 'Saturday run', '2026-11-07', 'saturday_run'],
      ['event', 'Chiang Mai Trail 64K', '2026-12-20', 'race'],
    ]);
    expect(p.sections[0]).toMatchObject({ distanceKm: 2, climbM: 20 });
    expect(p.sections[2]).toMatchObject({ distanceKm: 4, fieldSize: 23 });
    expect(p.sections[6]).toMatchObject({ distanceKm: 64, climbM: 2800 });
    expect(p.sections.every((s) => s.warnings.length === 0)).toBe(true);
  });

  it('reads every result line exactly', () => {
    const r = p.rows;
    expect(r).toHaveLength(9);
    expect(r[0]).toMatchObject({ name: 'Aiko Testfield', timeSec: 490, legNumber: 2, teamName: 'Peregrine' });
    expect(r[1]).toMatchObject({ name: 'Kenji D', timeSec: 475, legNumber: 4, teamName: 'Golden Eagle', racedEarlierSameDay: true });
    expect(r[2]).toMatchObject({ name: 'Ben Sampleton', timeSec: 292 });
    expect(r[3]).toMatchObject({ name: 'Aiko Testfield', timeSec: 975, place: 7 }); // header place applies to the single result
    expect(r[4]).toMatchObject({ name: 'Ben Sampleton', laps: 64 });
    expect(r[5]).toMatchObject({ name: 'Aiko Testfield', arm: { ankleCm: 11, calfReps: 18, storkSec: 22, hopStickBothLegs: true } });
    expect(r.slice(6, 8).map((x) => x.name)).toEqual(['Aiko Testfield', 'Ben Sampleton']);
    expect(r[8]).toMatchObject({ name: 'Coach Example', timeSec: 9 * 3600 + 45 * 60 });
    expect(r.every((x) => x.errors.length === 0)).toBe(true);
  });

  it('plans and commits: events, performances, participation, Campus Circuit course', () => {
    const s = snapshot();
    const plan = buildImportPlan(LINE_EXAMPLE, { snapshot: s, config: cfg, today: TODAY });
    expect(plan.rows.filter((r) => r.status === 'ready')).toHaveLength(9);
    expect(plan.sections[1].courseId).toBe(CAMPUS_CIRCUIT_ID);
    const { changes, summary } = planToChanges(plan, {}, s, commitCtx());
    expect(summary).toMatchObject({ performances: 7, participation: 2, newEvents: 6 });
    const circuit = changes.put!.performances!.find((x) => x.kind === 'circuit')!;
    expect(circuit).toMatchObject({ courseId: CAMPUS_CIRCUIT_ID, timeSec: 292, source: 'paste', verified: true, rawInput: 'Ben Sampleton 4:52' });
    const leg = changes.put!.performances!.find((x) => x.kind === 'relay_leg' && x.athleteId === 'kenji')!;
    expect(leg).toMatchObject({ legNumber: 4, racedEarlierSameDay: true });
  });

  it('space-separated options, unverified, not clean, nav errors', () => {
    const q = parseLineFormat(
      `# event: Ski Slope Descent | 2026-11-12 | descent | 1.2 km\nAiko Testfield 3:40 not clean\nBen Sampleton 3:10\n# test: nav | 2026-11-13 | course Nav Loop | 2.5 km\nHana Mockridge 18:20, errors 1, variant B\n# event: Holiday parkrun | 2026-12-26 | parkrun\nKenji Demoyama 19:02 unverified`,
      { today: TODAY, config: cfg },
    );
    expect(q.rows[0]).toMatchObject({ timeSec: 220, cleanRun: false });
    expect(q.rows[2]).toMatchObject({ timeSec: 1100, navErrors: 1, navVariant: 'B' });
    expect(q.sections[1].routeKmEff).toBe(2.5);
    expect(q.rows[3]).toMatchObject({ timeSec: 1142, unverified: true });
  });

  it('missing date, missing time and spoken times', () => {
    const q = parseLineFormat(`# event: Time trial | race | 3 km\nAiko Testfield\nBen Sampleton eleven fifty two\nHana Mockridge 16:75`, { today: TODAY, config: cfg });
    expect(q.sections[0].date).toBe(TODAY);
    expect(q.sections[0].warnings.join()).toMatch(/No date/);
    expect(q.rows[0].errors).toContain('missing time');
    expect(q.rows[1]).toMatchObject({ name: 'Ben Sampleton', timeSec: 712 });
    expect(q.rows[2].errors[0]).toMatch(/60/);
  });
});

// Acceptance test (spec 11): a messy fictional results table.
const MESSY = `順位\t氏名\t所属\t記録
1\tOutsider Runnerman\tSendai AC\t14:58
2\tTESTFIELD Aiko\tHarrow Appi\t16:15
3\tB. Sampleton\tHarrow Appi\t16:40
4\tAnother Strangerson\tMorioka RC\t16:52
5\tKenji Demoyamma\tHarrow Appi\t17:05
6\tモックリッジ ハナ\tハロウ安比\t17:30
6\tモックリッジ ハナ\tハロウ安比\t17:30
8\tCoach Example\tHarrow Appi\t
9\tThird Visitorson\tHachimantai TC\t19:44`;

describe('Paste-and-Match acceptance test (spec 11)', () => {
  const s = snapshot({ events: [{ id: 'ev-xc', name: 'Fictional Valley XC', date: '2026-11-29', kind: 'race', distanceKm: 4, official: true }] });
  const before = JSON.stringify(s);
  const plan = buildImportPlan(MESSY, { snapshot: s, config: cfg, today: TODAY, defaults: { eventId: 'ev-xc', name: 'Fictional Valley XC', date: '2026-11-29', perfKind: 'race', distanceKm: 4 } });
  const row = (n: number) => plan.rows.find((r) => r.raw.line === n)!;

  it('detects the Japanese header columns', () => {
    expect(plan.format).toBe('table');
    expect(plan.rows).toHaveLength(9);
  });

  it('proposes the correct matches', () => {
    expect(row(2)).toMatchObject({ status: 'outsider' });
    expect(row(3)).toMatchObject({ athleteId: 'aiko', status: 'ready', match: { type: 'normalised' } }); // family name first
    expect(row(4)).toMatchObject({ athleteId: 'ben', status: 'ready', match: { type: 'initials' } });
    expect(row(5)).toMatchObject({ status: 'outsider' });
    expect(row(6)).toMatchObject({ athleteId: 'kenji', status: 'review', match: { type: 'fuzzy' } }); // typo: a suggestion only
    expect(row(7)).toMatchObject({ athleteId: 'hana', status: 'ready' }); // katakana via stored alias
    expect(row(10)).toMatchObject({ status: 'outsider' });
  });

  it('flags the duplicate row and the missing time', () => {
    expect(row(8).status).toBe('skip');
    expect(row(8).warnings).toContain('duplicate row');
    expect(row(9).status).toBe('skip');
    expect(row(9).warnings).toContain('missing time');
  });

  it('nothing commits before approval', () => {
    expect(JSON.stringify(s)).toBe(before);
  });

  it('approval commits only ready rows, learns the confirmed typo as an alias, and counts outsiders', () => {
    const decisions: Record<string, RowDecision> = { [row(6).id]: { status: 'ready', athleteId: 'kenji' } };
    expect(decisionFor(row(6), decisions).status).toBe('ready');
    const { changes, summary } = planToChanges(plan, decisions, s, commitCtx());
    expect(summary).toMatchObject({ performances: 4, newEvents: 0, aliasesLearned: 1, outsiders: 3 });
    expect(changes.put!.athletes![0]).toMatchObject({ id: 'kenji', aliases: ['Kenji Demoyamma'] });
    const ev = changes.put!.events![0];
    expect(ev.id).toBe('ev-xc');
    expect(ev.fieldSize).toBe(9);
    expect(ev.categoryWinners).toEqual([{ category: 'Overall', timeSec: 898 }]);
    // Approving updates athlete ratings and boards.
    const after = applyChanges(s, changes);
    const d = deriveAll(after, TODAY);
    expect(d.athletes.get('aiko')!.ratings.race.locked).toBe(false);
    expect(d.athletes.get('aiko')!.ratings.race.caps).toBe(1);
    expect(d.athletes.get('coach')!.ratings.race.locked).toBe(true);
    // Re-pasting the same table now flags duplicates of existing results.
    const again = buildImportPlan(MESSY, { snapshot: after, config: cfg, today: TODAY, defaults: { eventId: 'ev-xc', name: 'Fictional Valley XC', date: '2026-11-29', perfKind: 'race', distanceKm: 4 } });
    const aikoAgain = again.rows.find((r) => r.raw.line === 3)!;
    expect(aikoAgain.status).toBe('skip');
    expect(aikoAgain.warnings).toContain('duplicate of an existing result');
  });
});

describe('results tables and Forms exports', () => {
  it('PDF-style runs of spaces with an English header', () => {
    const t = parseTable(`Pos   Name                 Cat     Time\n1     Ben Sampleton        U17M    16:40\n2     Some Visitor         U17M    16:55`, { today: TODAY, config: cfg });
    expect(t.rows.map((r) => [r.place, r.name, r.category, r.timeSec])).toEqual([
      [1, 'Ben Sampleton', 'U17M', 1000],
      [2, 'Some Visitor', 'U17M', 1015],
    ]);
  });

  it('headerless free-text lines with places', () => {
    const plan = buildImportPlan(`1. Ben Sampleton 16:40\n2. Aiko Testfield 17:02`, { snapshot: snapshot(), config: cfg, today: TODAY, defaults: { name: 'Club 5K', date: '2026-11-20', perfKind: 'race', distanceKm: 5 } });
    expect(plan.rows.map((r) => [r.athleteId, r.raw.timeSec])).toEqual([
      ['ben', 1000],
      ['aiko', 1022],
    ]);
  });

  it('Google Forms CSV: unverified, own event/date/distance per row', () => {
    const csv = `Timestamp,Your name,Which event?,Date of run,Distance (km),Your time\n"2026/12/28 10:15:30",Aiko Testfield,Fictional parkrun,28/12/2026,5,23:40\n"2026/12/29 09:01:00","Sampleton, Ben",Holiday trail race,2026-12-27,10,48:10`;
    const s = snapshot();
    const plan = buildImportPlan(csv, { snapshot: s, config: cfg, today: TODAY });
    expect(plan.format).toBe('forms');
    expect(plan.sections.map((x) => [x.name, x.date, x.perfKind])).toEqual([
      ['Fictional parkrun', '2026-12-28', 'parkrun'],
      ['Holiday trail race', '2026-12-27', 'race'],
    ]);
    expect(plan.rows.map((r) => r.athleteId)).toEqual(['aiko', 'ben']);
    const { changes } = planToChanges(plan, {}, s, commitCtx());
    const perfs = changes.put!.performances!;
    expect(perfs.every((p) => p.verified === false && p.source === 'form')).toBe(true);
    expect(perfs.map((p) => [p.distanceKm, p.timeSec])).toEqual([
      [5, 1420],
      [10, 2890],
    ]);
  });

  it('flags implausible pace', () => {
    const plan = buildImportPlan(`Ben Sampleton 9:00`, { snapshot: snapshot(), config: cfg, today: TODAY, defaults: { name: 'Club 5K', date: '2026-11-20', perfKind: 'race', distanceKm: 5 } });
    expect(plan.rows[0].status).toBe('review');
    expect(plan.rows[0].warnings.join()).toMatch(/Implausible pace/);
  });
});

describe('roster import (spec 4.5)', () => {
  it('school layout with a header', () => {
    const text = `Surname\tPreferred Name\tLegal First Name\tYear\tGender\tDOB\nTestwell\tLily\tLilian\t9\tF\t04/05/2012\nFakeworth\tTaro\tTaro\tYear 10\tMale\t`;
    const layout = detectRosterLayout(text);
    expect(layout.columns).toEqual(['family', 'preferred', 'given', 'year', 'sex', 'dob']);
    const c = parseRoster(text, layout, { roster: ROSTER, asOf: TODAY, config: cfg });
    expect(c[0]).toMatchObject({ familyName: 'Testwell', preferredName: 'Lily', givenName: 'Lilian', yearGroup: 'Y9', sex: 'F', dob: '2012-05-04', errors: [] });
    expect(c[1]).toMatchObject({ yearGroup: 'Y10', sex: 'M', errors: [] });
  });

  it('simple lines with aliases, and duplicate detection on name + year', () => {
    const text = `Testfield, Aiko, Y9, F, テストフィールド アイコ; Ai\nTestfield, Aiko, Y10, F\nNewname, Mio, Y7, F, 2014-01-02, ミオ`;
    const layout = detectRosterLayout(text);
    const c = parseRoster(text, layout, { roster: ROSTER, asOf: TODAY, config: cfg });
    expect(c[0]).toMatchObject({ familyName: 'Testfield', preferredName: 'Aiko', yearGroup: 'Y9', aliases: ['テストフィールド アイコ', 'Ai'], duplicateOf: 'aiko' });
    expect(c[1].duplicateOf).toBeUndefined(); // different year group
    expect(c[2]).toMatchObject({ dob: '2014-01-02', aliases: ['ミオ'] });
  });

  it('reports rows it cannot use', () => {
    const c = parseRoster(`Nobody, X, Y5, Q`, detectRosterLayout(`Nobody, X, Y5, Q`), { roster: [], asOf: TODAY, config: cfg });
    expect(c[0].errors.join()).toMatch(/Year group not understood.*Sex not understood|Sex not understood/);
  });
});

describe('orienteering results only → NAV (go-live plan 6)', () => {
  it('a Butterfly O header plus "name time errors n" scores NAV from a 10 km race (Riegel)', () => {
    const race = { id: 'r10', athleteId: 'aiko', date: '2026-10-01', kind: 'race' as const, distanceKm: 10, timeSec: 2700, verified: true, source: 'coach' as const, rawInput: '', history: [] };
    const base = snapshot({ performances: [race] });
    const plan = buildImportPlan('# event: Butterfly O | 2026-11-12 | nav | 3.2 km | climb 60 m\nAiko Testfield 24:10 errors 1', { snapshot: base, config: cfg, today: TODAY });
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0]).toMatchObject({ status: 'ready', athleteId: 'aiko', kind: 'nav' });
    const { changes } = planToChanges(plan, {}, base, { now: '2026-11-12T10:00:00Z', by: 'Coach', newId: ids() });
    const after = applyChanges(base, changes);
    const nav = after.performances.find((p) => p.kind === 'nav')!;
    expect(nav).toMatchObject({ timeSec: 1450, navErrors: 1 });
    const r = deriveAll(after, '2026-11-12').athletes.get('aiko')!.ratings;
    expect(r.stats.NAV.locked).toBe(false);
    expect(r.stats.NAV.basis?.label).toBe('from Butterfly O, 12 Nov');
  });
});
