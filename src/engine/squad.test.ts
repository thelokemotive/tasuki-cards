import { describe, expect, it } from 'vitest';
import { squadView } from './squad';
import { gldCourseFor, gldMigration, predictGld, GLD_COURSES } from './gld';
import { buildImportPlan, planToChanges } from './parse/plan';
import { wholeSchoolToTable } from './parse/wholeSchool';
import { DEFAULT_CONFIG } from './config';
import { emptySnapshot } from '../store/Store';
import { applyChanges } from '../store/changes';
import type { Athlete, Performance } from '../types';

const ath = (id: string, extra: Partial<Athlete> = {}) => ({ id, givenName: id, familyName: 'Test', preferredName: id, aliases: [], sex: 'M', yearGroup: 'Y9', displayMode: 'first_initial', absoluteBoardOptOut: false, avatar: {}, active: true, ...extra }) as unknown as Athlete;
const perf = (id: string, athleteId: string, eventId: string) => ({ id, athleteId, eventId, date: '2026-10-01', kind: 'race', place: 3, verified: true, source: 'paste', rawInput: '', history: [] }) as unknown as Performance;

describe('squad and whole school', () => {
  it('whole-school runners are left out until they have raced two different events', () => {
    const s = { ...emptySnapshot(), athletes: [ath('sq'), ath('one', { squad: false }), ath('two', { squad: false })], performances: [perf('p1', 'one', 'gld'), perf('p2', 'two', 'gld'), perf('p3', 'two', 'xc'), perf('p4', 'sq', 'gld')] };
    const v = squadView(s);
    expect(v.athletes.map((a) => a.id)).toEqual(['sq', 'two']);
    expect(v.performances.map((p) => p.id)).toEqual(['p2', 'p3', 'p4']);
  });

  it('a whole-school race can keep every other runner as a whole-school athlete, with sex and year group', () => {
    const H = ['Racing?', 'Preferred Name', 'Full Name', 'Year', 'Score (position)'];
    const sheets = [
      { sheetName: 'Churchill', rows: [H, ['TRUE', 'Aki', 'Aki Testfield', '10', '1'], ['TRUE', 'Ben', 'Ben Sampleton', '9', '2']], text: '' },
      { sheetName: 'Nitobe', rows: [H, ['TRUE', 'Cal', 'Cal Mock', '11', '3']], text: '' },
      { sheetName: 'Lyons', rows: [H, ['TRUE', 'Dee', 'Dee Demo', '7', '1']], text: '' },
    ];
    const snap = { ...emptySnapshot(), athletes: [ath('aki', { givenName: 'Aki', familyName: 'Testfield', preferredName: 'Aki', yearGroup: 'Y10' })], configs: [DEFAULT_CONFIG] };
    const plan = buildImportPlan(wholeSchoolToTable(sheets, 'Green Long Ducker 2025')!.text, { snapshot: snap, config: DEFAULT_CONFIG, today: '2026-11-14', defaults: { date: '2025-11-08' } });
    let n = 0;
    const { changes, summary } = planToChanges(plan, {}, snap, { now: '2026-11-14T00:00:00Z', by: 'Coach', newId: (p) => `${p}-${++n}`, wholeSchoolAthletes: true });
    const created = (changes.put?.athletes ?? []).map((a) => [a.preferredName, a.sex, a.yearGroup, a.yearGroupYear, a.squad]);
    expect(created).toEqual([
      ['Ben', 'M', 'Y9', 2025, false],
      ['Cal', 'M', 'Y11', 2025, false],
      ['Dee', 'F', 'Y7', 2025, false],
    ]);
    expect(summary.performances).toBe(4);
    const after = applyChanges(snap, changes);
    expect(squadView(after).athletes.map((a) => a.id)).toEqual(['aki']);
    // the Long Ducker events are linked to their courses on load
    const mig = gldMigration(after);
    expect(mig.courses).toHaveLength(3);
    expect(mig.events.map((e) => [e.name, e.courseId]).sort()).toEqual([
      ['Green Long Ducker 2025 junior girls', 'course-gld-prep'],
      ['Green Long Ducker 2025 senior boys', 'course-gld-senior'],
    ]);
  });

  it('maps race names to the three courses and predicts from the Next 5K', () => {
    expect(['Green Long Ducker 2026 Y7 boys', 'Green Long Ducker 2026 senior girls', 'Green Long Ducker 2026 sixth form boys', 'Hachimantai XC'].map((n) => gldCourseFor(n)?.id)).toEqual(['course-gld-prep', 'course-gld-senior', 'course-gld-sixth', undefined]);
    const d = { athlete: ath('x', { yearGroup: 'Y10' }), prediction: { predictedSec: 20 * 60 }, ratings: { ageNow: { age: 15, estimated: false } } } as never;
    const p = predictGld(d, DEFAULT_CONFIG, '2026-11-14')!;
    expect(p.course).toBe(GLD_COURSES[1]);
    // 3.535 km + 526 m climb = 8.8 effective km: well over the 20-minute 5K time
    expect(p.timeSec).toBeGreaterThan(20 * 60 * (8.8 / 5));
    expect(p.timeSec).toBeLessThan(20 * 60 * (8.8 / 5) * 1.15);
  });
});
