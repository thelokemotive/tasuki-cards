import { describe, expect, it } from 'vitest';
import type { DataSnapshot } from '../../types';
import { SCHEMA_VERSION } from '../../types';
import { DEFAULT_CONFIG } from '../config';
import { applyChanges } from '../../store/changes';
import { deriveAll } from '../derive';
import { seedCourses } from '../../demo/demoData';
import { matchName } from '../names';
import { athleteFromDraft, draftProblem, inferSex, isOurSchool, proposeNewAthlete } from './newAthletes';
import { ACADEMY_WARNING, buildImportPlan, planToChanges, willCommit, type RowDecision } from './plan';

const TODAY = '2026-11-15';
const cfg = DEFAULT_CONFIG;

function empty(): DataSnapshot {
  return { schemaVersion: SCHEMA_VERSION, athletes: [], courses: seedCourses(), events: [], performances: [], participation: [], achievements: [], configs: [cfg], calendar: { holidayWeeks: [], halfTerms: [] }, meta: {} };
}
const ids = () => {
  let n = 0;
  return (p: string) => `${p}-${++n}`;
};

describe('inferSex from a category or sex column', () => {
  it.each([
    ['男子', 'M'], ['女子', 'F'], ['男', 'M'], ['女', 'F'], ['M', 'M'], ['F', 'F'], ['Men', 'M'], ['Women', 'F'], ['Boys', 'M'], ['Girls', 'F'],
    ['Male', 'M'], ['Female', 'F'], ['M40', 'M'], ['F18', 'F'], ['W35', 'F'], ['U15 Boys', 'M'], ['中学女子', 'F'], ['一般男子 10km', 'M'], ['Ｆ', 'F'], ["Women's 5K", 'F'], ['Ladies', 'F'],
  ])('%s → %s', (text, sex) => expect(inferSex(text)).toBe(sex));

  it.each([['Open'], ['男女混合'], ['M/F'], ['5km'], [''], [undefined]])('%s → unknown', (text) => expect(inferSex(text)).toBeUndefined());
});

describe('isOurSchool', () => {
  const names = ['Harrow', 'ハロウ', '安比', 'Appi'];
  it.each([['Harrow Appi'], ['HARROW INTERNATIONAL SCHOOL APPI'], ['ハロウ安比校'], ['ﾊﾛｳ'], ['harrow appi japan']])('%s is ours', (c) => expect(isOurSchool(c, names)).toBe(true));
  it.each([['盛岡RC'], ['Morioka Runners'], [''], [undefined]])('%s is not', (c) => expect(isOurSchool(c, names)).toBe(false));
  it('no names set: nobody is ours', () => expect(isOurSchool('Harrow', [])).toBe(false));
});

describe('proposeNewAthlete', () => {
  it('Western order', () => expect(proposeNewAthlete('Aiko Testfield', 'F')).toMatchObject({ givenName: 'Aiko', familyName: 'Testfield', preferredName: 'Aiko', sex: 'F', aliases: [] }));
  it('results-table capitals, family first', () => {
    const d = proposeNewAthlete('TESTFIELD Aiko');
    expect(d).toMatchObject({ givenName: 'Aiko', familyName: 'Testfield' });
    expect(d.aliases).toEqual([]);
  });
  it('all capitals keeps the written form as an alias', () => expect(proposeNewAthlete('AIKO TESTFIELD')).toMatchObject({ givenName: 'Aiko', familyName: 'Testfield', aliases: ['AIKO TESTFIELD'] }));
  it('comma form', () => expect(proposeNewAthlete('Testfield, Aiko')).toMatchObject({ givenName: 'Aiko', familyName: 'Testfield' }));
  it('kanji: Japanese order, written form kept as alias', () => expect(proposeNewAthlete('試験 花子')).toMatchObject({ familyName: '試験', givenName: '花子', aliases: ['試験 花子'] }));
  it('kana with no space', () => expect(proposeNewAthlete('テストハナコ')).toMatchObject({ givenName: 'テストハナコ', familyName: '', aliases: ['テストハナコ'] }));
  it('needs a sex and a year group before it can be created', () => {
    const d = proposeNewAthlete('Aiko Testfield', 'F');
    expect(draftProblem(d)).toBe('choose the year group');
    expect(draftProblem({ ...d, sex: undefined, yearGroup: 'Y9' })).toBe('choose the sex');
    expect(draftProblem({ ...d, yearGroup: 'Y9' })).toBeUndefined();
  });
  it('a kanji alias matches exactly next time', () => {
    const a = athleteFromDraft({ ...proposeNewAthlete('試験 花子', 'F'), givenName: 'Hanako', familyName: 'Testfield', preferredName: 'Hanako', yearGroup: 'Y9' }, 'ath-1', '2026-11-15T00:00:00Z', 2026);
    expect(a).toMatchObject({ givenName: 'Hanako', familyName: 'Testfield', aliases: ['試験 花子'], sex: 'F', yearGroup: 'Y9', yearGroupYear: 2026, displayMode: 'first_initial', active: true });
    expect(matchName('試験 花子', [a], cfg)).toMatchObject({ type: 'exact_alias', athleteId: 'ath-1' });
  });
});

const TABLE = `順位\t氏名\t所属\t種目\t記録
1\t盛岡 太郎\t盛岡RC\t男子\t10:01
2\tTESTFIELD Aiko\tHarrow Appi\t女子\t11:30
3\t試験 花子\tハロウ安比\t女子\t12:05
4\tBen Sampleton\tHarrow\t男子\t12:40
5\t岩手 次郎\t岩手AC\t男子\t13:00`;

describe('Paste & Match: building the roster from results', () => {
  const ctx = (ourSchool?: string[]) => ({ snapshot: empty(), config: cfg, today: TODAY, defaults: { name: 'Hachimantai 3K', date: '2026-11-08', perfKind: 'race' as const, distanceKm: 3 }, ourSchool });

  it('without "Our school" names, everyone unknown is an outsider, each with a new-athlete proposal', () => {
    const plan = buildImportPlan(TABLE, ctx());
    expect(plan.rows.map((r) => r.status)).toEqual(['outsider', 'outsider', 'outsider', 'outsider', 'outsider']);
    expect(plan.rows[1].newAthlete).toMatchObject({ givenName: 'Aiko', familyName: 'Testfield', sex: 'F' });
    expect(plan.rows[3].newAthlete).toMatchObject({ givenName: 'Ben', familyName: 'Sampleton', sex: 'M' });
  });

  it('club matches "Our school": academy candidates ("New athlete?"), others stay outsiders', () => {
    const plan = buildImportPlan(TABLE, ctx(['Harrow', 'ハロウ', '安比', 'Appi']));
    expect(plan.rows.map((r) => [r.status, !!r.academy])).toEqual([
      ['outsider', false],
      ['review', true],
      ['review', true],
      ['review', true],
      ['outsider', false],
    ]);
    expect(plan.rows[2].warnings).toContain(ACADEMY_WARNING);
  });

  it('approving creates each new athlete once and saves their results; outsiders count for field size', () => {
    const plan = buildImportPlan(TABLE, ctx(['Harrow', 'ハロウ']));
    const drafts = plan.rows.filter((r) => r.academy).map((r, i) => ({ ...r.newAthlete!, yearGroup: (['Y9', 'Y10', 'Y11'] as const)[i] }));
    drafts[1] = { ...drafts[1], givenName: 'Hanako', familyName: 'Shiken', preferredName: 'Hanako' };
    const decisions: Record<string, RowDecision> = {};
    for (const r of plan.rows) if (r.academy) decisions[r.id] = { status: 'ready', newAthleteKey: r.newAthlete!.key };
    expect(Object.values(decisions).every(willCommit)).toBe(true);
    const { changes, summary } = planToChanges(plan, decisions, empty(), { now: '2026-11-15T10:00:00.000Z', by: 'Coach', newId: ids(), newAthletes: drafts, yearGroupYear: 2026 });
    expect(summary).toMatchObject({ performances: 3, newAthletes: 3, outsiders: 2, newEvents: 1 });
    const made = changes.put!.athletes!;
    expect(made.map((a) => [a.givenName, a.familyName, a.sex, a.yearGroup])).toEqual([
      ['Aiko', 'Testfield', 'F', 'Y9'],
      ['Hanako', 'Shiken', 'F', 'Y10'],
      ['Ben', 'Sampleton', 'M', 'Y11'],
    ]);
    expect(made[1].aliases).toEqual(['試験 花子']);
    expect(changes.put!.events![0].fieldSize).toBe(5);
    const after = applyChanges(empty(), changes);
    const d = deriveAll(after, '2026-11-15');
    // A 3 km race now feeds SPD (go-live plan 1): every new runner gets RACE and SPD straight away.
    for (const a of made) {
      const r = d.athletes.get(a.id)!.ratings;
      expect(r.race.locked).toBe(false);
      expect(r.stats.SPD.locked).toBe(false);
    }
    // Next time the same table matches the new athletes (kanji via the stored alias).
    const again = buildImportPlan(TABLE, { ...ctx(['Harrow']), snapshot: after });
    expect(again.rows.slice(1, 4).map((r) => r.match.type)).toEqual(['normalised', 'exact_alias', 'normalised']);
  });

  it('one draft covers every row with the same name (two sections); an unfinished draft saves nothing', () => {
    const text = `# event: Race A | 2026-11-01 | race | 3 km\nZed Newrunner 10:00\n# event: Race B | 2026-11-08 | race | 3 km\nZed Newrunner 9:50`;
    const plan = buildImportPlan(text, { snapshot: empty(), config: cfg, today: TODAY });
    expect(plan.rows).toHaveLength(2);
    const key = plan.rows[0].newAthlete!.key;
    expect(plan.rows[1].newAthlete!.key).toBe(key);
    const decisions = Object.fromEntries(plan.rows.map((r) => [r.id, { status: 'ready' as const, newAthleteKey: key }]));
    const ok = planToChanges(plan, decisions, empty(), { now: '2026-11-15T00:00:00Z', by: 'C', newId: ids(), newAthletes: [{ ...plan.rows[0].newAthlete!, sex: 'M', yearGroup: 'Y12' }] });
    expect(ok.summary).toMatchObject({ newAthletes: 1, performances: 2 });
    expect(new Set(ok.changes.put!.performances!.map((p) => p.athleteId)).size).toBe(1);
    const unfinished = planToChanges(plan, decisions, empty(), { now: '2026-11-15T00:00:00Z', by: 'C', newId: ids(), newAthletes: [{ ...plan.rows[0].newAthlete!, sex: 'M' }] });
    expect(unfinished.summary).toMatchObject({ newAthletes: 0, performances: 0, notCommitted: 2 });
  });
});
