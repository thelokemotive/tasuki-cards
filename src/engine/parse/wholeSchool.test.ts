import { describe, expect, it } from 'vitest';
import { wholeSchoolToTable } from './wholeSchool';
import { buildImportPlan } from './plan';
import { DEFAULT_CONFIG } from '../config';
import { SCHEMA_VERSION, type Athlete } from '../../types';
import type { SheetRead } from './xlsx';

// Invented pupils, laid out like the house sheets of a Green Long Ducker workbook.
const sheet = (name: string, rows: string[][]): SheetRead => ({ sheetName: name, rows, text: '' });
const H26 = ['Racing?', 'Preferred Name', 'Full Name', 'Year', 'Score (position)', 'Notes'];
const book2026 = [
  sheet('Churchill', [H26, ['TRUE', 'Aki', 'Akihiro Testfield', '7', '1', ''], ['TRUE', 'Ben', 'Benjamin Sampleton', '8', '2', ''], ['TRUE', 'Cal', 'Calum Mock', '10', '3', ''], ['FALSE', 'Dan', 'Dan Absent', '9', '', 'Approved Leave']]),
  sheet('Nitobe', [H26, ['TRUE', 'Eli', 'Eli Demo', '7', '2', ''], ['TRUE', 'Fin', 'Finley Fake', '8', '1', ''], ['TRUE', 'Gus', 'Gus Sample', '11', '1', ''], ['TRUE', 'Hal', 'Hal Trial', '12', '1', '']]),
  sheet('Elizabeth', [H26, ['TRUE', 'Ivy', 'Ivy Testwood', '7', '2', ''], ['TRUE', 'Jo', 'Joanna Mockley', '8', '1', ''], ['TRUE', 'Kay', 'Kay Demoson', '12', '1', '']]),
  sheet('Final Standings', [['', 'Churchill', '18.8']]),
  sheet('Sixth Form', [['House', 'Name']]),
];

describe('whole-school race workbooks (Green Long Ducker)', () => {
  it('splits races by boys/girls and section, by year where places restart, and skips pupils not racing', () => {
    const r = wholeSchoolToTable(book2026, 'Green Long Ducker 2026')!;
    expect(r.skipped).toBe(1);
    expect(r.groups.map((g) => [g.label, g.finishers])).toEqual([
      ['Y7 boys', 2],
      ['Y8 boys', 2],
      ['senior boys', 2],
      ['sixth form boys', 1],
      ['junior girls', 2],
      ['sixth form girls', 1],
    ]);
    expect(r.text.split('\n')[1].split('\t')).toEqual(['Green Long Ducker 2026 Y7 boys', '1', 'Aki Testfield', 'M', 'Y7', 'Y7 boys', 'Churchill']);
  });

  it('reads first/last name sheets, and Y12 runs with the seniors when there is no Sixth Form sheet', () => {
    const H = ['Year', 'Last Name', 'First Name', 'Position', 'Time', 'Notes'];
    const r = wholeSchoolToTable([sheet('Churchill', [H, ['9', 'Testfield', 'Aki', '1'], ['12', 'Mock', 'Cal', '2']]), sheet('Masamune', [H, ['10', 'Demo', 'Eli', '3']]), sheet('Lyons', [H, ['7', 'Fake', 'Ivy', 'NA']])], 'Green Long Ducker 2025')!;
    expect(r.groups).toEqual([{ label: 'senior boys', finishers: 3, byYear: false }]);
    expect(r.skipped).toBe(1);
  });

  it('saves our runners with their place and the size of their race; everyone else only counts', () => {
    const aki = { id: 'a1', givenName: 'Akihiro', familyName: 'Testfield', preferredName: 'Aki', aliases: [], sex: 'M', yearGroup: 'Y7', displayMode: 'first_initial', absoluteBoardOptOut: false, avatar: {}, active: true } as unknown as Athlete;
    const snap = { schemaVersion: SCHEMA_VERSION, athletes: [aki], courses: [], events: [], performances: [], participation: [], achievements: [], configs: [DEFAULT_CONFIG], calendar: { holidayWeeks: [], halfTerms: [] }, meta: {} };
    const plan = buildImportPlan(wholeSchoolToTable(book2026, 'Green Long Ducker 2026')!.text, { snapshot: snap, config: DEFAULT_CONFIG, today: '2026-11-14', defaults: { date: '2026-11-13' } });
    expect(plan.sections.flatMap((s) => s.warnings)).toEqual([]);
    const mine = plan.rows.filter((r) => r.athleteId === 'a1');
    expect(mine.map((r) => [r.raw.place, plan.sections.find((s) => s.key === r.sectionKey)?.name])).toEqual([[1, 'Green Long Ducker 2026 Y7 boys']]);
    expect(plan.rows.filter((r) => r.status === 'outsider').length).toBe(9);
  });
});
