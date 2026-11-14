import { describe, expect, it } from 'vitest';
import { parkrunDate, parkrunToTable, rankOf } from './parkrun';
import { buildImportPlan } from './plan';
import { DEFAULT_CONFIG } from '../config';
import { SCHEMA_VERSION, type Athlete } from '../../types';

// A results page copied from the browser, run through Chrome's translation (invented names).
const PAGE = `Home
course
results
Download the free parkrun app.
Testvale Park Run
11/14/26 | #177
5
Finisher

Sort by finishing order ▲
Rank	parkrun participants	sex	Age group	club	time
1
延寿 試験
32 finishes | Members of the parkrun25 club
Boys
1/3
VM40-44
79.32% Age-based evaluation
17:44
Personal best: 17:25
2
Aiko TESTFIELD
4 Finishes
Girls
1/2
JW11-14
77.76% Age-based evaluation
20:32
Personal best!
twenty one
Ben SAMPLETON
3 finishes
Boys
2/3
JM15-17
49.13% Age-based evaluation
27:53
First time participating!
twenty two
見本 花子
20 Finishes
Girls
2/2
VW50-54
63.66% Age-based evaluation
1:02:39
Personal best: 54:54
Why not join us as a volunteer ?
Average finish time: 00:28:56`;

const snap = { schemaVersion: SCHEMA_VERSION, athletes: [] as Athlete[], courses: [], events: [], performances: [], participation: [], achievements: [], configs: [DEFAULT_CONFIG], calendar: { holidayWeeks: [], halfTerms: [] }, meta: {} };

describe('parkrun results pages', () => {
  it('reads ranks in digits or words', () => {
    expect([rankOf('1'), rankOf('twenty one'), rankOf('twenty-two'), rankOf('Boys'), rankOf('one hundred and five')]).toEqual([1, 21, 22, undefined, 105]);
  });

  it('reads the date the way it is most likely meant (a recent Saturday)', () => {
    expect(parkrunDate('11/14/26 | #177', '2026-11-14')).toBe('2026-11-14');
    expect(parkrunDate('14/11/2026 | #177', '2026-11-20')).toBe('2026-11-14');
    expect(parkrunDate('2026/11/14', '2026-11-20')).toBe('2026-11-14');
    expect(parkrunDate('07/11/2026', '2026-11-20')).toBe('2026-11-07');
  });

  it('turns the copied page into one row per finisher', () => {
    const r = parkrunToTable(PAGE, '2026-11-14')!;
    expect(r.event).toBe('Testvale parkrun');
    expect(r.date).toBe('2026-11-14');
    expect(r.finishers).toBe(4);
    const rows = r.text.split('\n').slice(1).map((l) => l.split('\t'));
    expect(rows.map((x) => [x[2], x[3], x[4], x[6]])).toEqual([
      ['1', '延寿 試験', 'M', '17:44'],
      ['2', 'Aiko TESTFIELD', 'F', '20:32'],
      ['21', 'Ben SAMPLETON', 'M', '27:53'],
      ['22', '見本 花子', 'F', '1:02:39'],
    ]);
  });

  it('goes straight through Paste & Match as a parkrun, with everyone else counted', () => {
    const aiko = { id: 'a1', givenName: 'Aiko', familyName: 'Testfield', preferredName: '', aliases: [], sex: 'F', yearGroup: 'Y8', displayMode: 'first_initial', absoluteBoardOptOut: false, avatar: {}, active: true } as unknown as Athlete;
    const plan = buildImportPlan(PAGE, { snapshot: { ...snap, athletes: [aiko] }, config: DEFAULT_CONFIG, today: '2026-11-14' });
    expect(plan.sections[0].perfKind).toBe('parkrun');
    expect(plan.sections[0].date).toBe('2026-11-14');
    const mine = plan.rows.filter((r) => r.athleteId === 'a1');
    expect(mine.map((r) => [r.raw.timeSec, r.raw.place])).toEqual([[1232, 2]]);
    // Juniors not on the roster wait for the coach (a pupil in kanji); adults are outsiders.
    expect(plan.rows.filter((r) => r.status === 'review').map((r) => r.raw.name)).toEqual(['Ben SAMPLETON']);
    expect(plan.rows.filter((r) => r.status === 'outsider').map((r) => r.raw.name)).toEqual(['延寿 試験', '見本 花子']);
    // With the Table switch on, the page is still read as parkrun.
    expect(buildImportPlan(PAGE, { snapshot: snap, config: DEFAULT_CONFIG, today: '2026-11-14', format: 'table' }).sections[0].perfKind).toBe('parkrun');
  });
});
