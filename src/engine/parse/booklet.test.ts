import { describe, expect, it } from 'vitest';
import { bookletToTable, ekidenToLineFormat } from './booklet';
import { buildImportPlan } from './plan';
import { DEFAULT_CONFIG } from '../config';
import { SCHEMA_VERSION } from '../../types';

const snap = { schemaVersion: SCHEMA_VERSION, athletes: [], courses: [], events: [], performances: [], participation: [], achievements: [], configs: [DEFAULT_CONFIG], calendar: { holidayWeeks: [], halfTerms: [] }, meta: {} };

// The ISTS layout as text from a PDF viewer (invented names; columns separated by runs of spaces).
const BOOKLET = `                                                         2026Testクロスカントリー大会
一般男子4km                                                       2026年10月4日
順位 ﾅﾝﾊﾞｰ 氏 名              氏名(ｶﾅ)        市区町村県名     所属クラブ名        記 録
1      202     試験 太郎        ｼｹﾝ ﾀﾛｳ          青森県 八戸市                        0:15:21
2      212     Ｔｅｓｔｆｉｅｌｄ Ａｉｋｏ ﾃｽﾄﾌｨｰﾙﾄﾞ ｱｲｺ  岩手県 八幡平市   ハロウ安比校       0:17:29
中学生女子4km
順位 ﾅﾝﾊﾞｰ 氏 名 氏名(ｶﾅ) 市区町村県名 所属クラブ名 記 録
1 354 Sample Hana ｻﾝﾌﾟﾙ ﾊﾅ 岩手県 八幡平市 ハロウ安比校 0:19:48
2 357 見本 花子 ﾐﾎﾝ ﾊﾅｺ 秋田県 大館市 T.F.C.E 0:20:09`;

describe('results booklets (ISTS layout)', () => {
  it('reads each category as its own event, with place, name, club, distance and time, in either spacing', () => {
    const b = bookletToTable(BOOKLET)!;
    expect(b.categories).toEqual(['一般男子4km', '中学生女子4km']);
    expect(b.rows).toBe(4);
    const rows = b.text.split('\n').slice(1).map((l) => l.split('\t'));
    expect(rows[0]).toEqual(['2026Testクロスカントリー大会 一般男子4km', '2026-10-04', '1', '試験 太郎', '', '一般男子4km', '4 km', '15:21']);
    expect(rows[1].slice(3, 5)).toEqual(['Testfield Aiko', 'ハロウ安比校']);
    expect(rows[2].slice(3, 5)).toEqual(['Sample Hana', 'ハロウ安比校']);
    expect(rows[3].slice(3, 5)).toEqual(['見本 花子', 'T.F.C.E']);
  });

  it('goes straight through Paste & Match: our runners flagged, sex from the category', () => {
    const plan = buildImportPlan(BOOKLET, { snapshot: snap, config: DEFAULT_CONFIG, today: '2026-11-11', ourSchool: ['ハロウ'] });
    expect(plan.sections.map((s) => [s.date, s.resolvedDistanceKm])).toEqual([
      ['2026-10-04', 4],
      ['2026-10-04', 4],
    ]);
    expect(plan.rows.filter((r) => r.academy).map((r) => [r.raw.name, r.raw.timeSec, r.newAthlete?.sex])).toEqual([
      ['Testfield Aiko', 1049, 'M'],
      ['Sample Hana', 1188, 'F'],
    ]);
    expect(plan.warnings[0]).toMatch(/^Read as a results booklet: 4 runners in 2 categories/);
  });

  it('ordinary tables are left alone', () => {
    expect(bookletToTable('Name\tTime\nAiko Testfield\t16:15')).toBeUndefined();
  });
});

describe('ekiden write-ups', () => {
  const TEXT = `results (flat 2 km legs)🥇 Peregrine (1st, general): 34:25
Aiko (9:18) → Ben (8:26) → Hana (8:35)
Ben ran the fastest leg.

🥈 Kestrel (2nd, open): 37:45
Kai (9:04) → Ren (8:41)`;
  it('one relay leg per runner, numbered, with the team and the leg distance from the text', () => {
    const r = ekidenToLineFormat(TEXT, { name: 'Test Ekiden', date: '2026-11-01' })!;
    expect(r).toMatchObject({ teams: 2, legs: 5 });
    expect(r.text.split('\n')).toEqual([
      '# event: Test Ekiden | 2026-11-01 | relay_leg | 2 km',
      'Aiko, 9:18, leg 1, team Peregrine',
      'Ben, 8:26, leg 2, team Peregrine',
      'Hana, 8:35, leg 3, team Peregrine',
      'Kai, 9:04, leg 1, team Kestrel',
      'Ren, 8:41, leg 2, team Kestrel',
    ]);
  });
  it('parses through Paste & Match as relay legs', () => {
    const plan = buildImportPlan(TEXT, { snapshot: snap, config: DEFAULT_CONFIG, today: '2026-11-11', defaults: { name: 'Test Ekiden', date: '2026-11-01' } });
    expect(plan.rows.map((r) => [r.kind, r.raw.legNumber, r.raw.teamName, r.raw.timeSec])[1]).toEqual(['relay_leg', 2, 'Peregrine', 506]);
  });
});
