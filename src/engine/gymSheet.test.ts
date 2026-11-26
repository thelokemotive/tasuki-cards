// §8 / §13.11: the Gym Log sheet. Fictional runners only. (The Chrome print check is scripts/check-print.mjs.)
import { describe, expect, it } from 'vitest';
import type { Athlete } from '../types';
import { DEFAULT_CONFIG } from './config';
import { GYM_SHEET_FOOTER, gymSheetDays, gymSheetLegend, gymSheetPages, gymSheetRows, gymSheetTitle, gymSheetWeeks } from './gymSheet';

function athlete(id: string, preferred: string, family: string, yearGroup: Athlete['yearGroup'], extra: Partial<Athlete> = {}): Athlete {
  return { id, givenName: preferred, familyName: family, preferredName: preferred, aliases: [], sex: 'M', yearGroup, displayMode: 'full', absoluteBoardOptOut: false, avatar: {} as Athlete['avatar'], active: true, ...extra };
}

describe('Gym Log sheet', () => {
  it('lists the winter roster by year group (Y7 → Y13, then Staff) and preferred name, with ▲ for a Summit pass', () => {
    const rows = gymSheetRows([
      athlete('a', 'Ren', 'Testwood', 'Y9'),
      athlete('b', 'Aoi', 'Hillside', 'Y9', { summitPass: { date: '2027-01-12' } }),
      athlete('c', 'Mika', 'Riverstone', 'Y7'),
      athlete('d', 'Coach', 'Fieldman', 'Staff', { winterProgramme: true }),
      athlete('e', 'Off', 'Staffer', 'Staff'),
      athlete('f', 'Gone', 'Leaver', 'Y13', { active: false }),
      athlete('g', 'Sora', 'Opted', 'Y8', { winterProgramme: false }),
    ]);
    expect(rows.map((r) => r.label)).toEqual(['Mika R.', 'Aoi H. ▲', 'Ren T.', 'Coach F.']);
  });

  it('§13.11 40 runners fit on one page; 45 make two', () => {
    const rows = Array.from({ length: 45 }, (_, i) => i);
    expect(gymSheetPages(rows.slice(0, 40))).toHaveLength(1);
    expect(gymSheetPages(rows.slice(0, 40))[0].map((h) => h.length)).toEqual([20, 20]);
    expect(gymSheetPages(rows).map((p) => p.flat().length)).toEqual([40, 5]);
  });

  it('prints counted weeks only (holiday weeks are skipped)', () => {
    expect(gymSheetWeeks(DEFAULT_CONFIG, '2026-12-07', '2027-01-18')).toEqual(['2026-W50', '2027-W02', '2027-W03']);
  });

  it('has the header, dated columns, legend and footer the spec asks for', () => {
    expect(gymSheetTitle('2027-W02')).toBe("Runners' Gym Log · week of Mon 11 Jan 2027");
    expect(gymSheetDays('2027-W02').map((d) => d.label)).toEqual(['11 Jan', '12 Jan', '13 Jan', '14 Jan', '15 Jan', '16 Jan', '17 Jan']);
    expect(gymSheetLegend(DEFAULT_CONFIG)).toEqual({
      legend: 'E Engine · A Armour · S Ski Fix · X Express · 1 Base · 2 Mid · 3 Summit (▲ only) · ! something hurt · RF recovery week',
      example: 'A2 = Armour, Mid',
    });
    expect(GYM_SHEET_FOOTER).toMatch(/Write your code in today’s box\. Keep this sheet in the folder\./);
  });
});
