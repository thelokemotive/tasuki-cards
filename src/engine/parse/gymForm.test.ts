// §13.10: the holiday Microsoft Form CSV. Fictional runners and addresses only.
import { describe, expect, it } from 'vitest';
import type { Athlete, DataSnapshot } from '../../types';
import { DEFAULT_CONFIG } from '../config';
import { applyChanges } from '../../store/changes';
import { emptySnapshot } from '../../store/Store';
import { deriveAll } from '../derive';
import { whiteRadar } from '../white';
import { evaluateGymImport, gymImportChanges } from './gymLine';
import { cardFromAnswer, formDate, formName, guessMapping, looksLikeGymForm, parseGymForm, readFormTable, unmatchedEntries } from './gymForm';

const cfg = DEFAULT_CONFIG;
function athlete(id: string, given: string, family: string): Athlete {
  return { id, givenName: given, familyName: family, preferredName: given, aliases: [], sex: 'F', yearGroup: 'Y10', displayMode: 'full', absoluteBoardOptOut: false, avatar: {} as Athlete['avatar'], active: true };
}
const roster = [athlete('aiko', 'Aiko', 'Testfield'), athlete('ben', 'Ben', 'Carterson')];
const base: DataSnapshot = { ...emptySnapshot(), athletes: roster, configs: [cfg] };

const CSV = `ID,Start time,Completion time,Email,Name,Date of session,What did you do?,Which level?,Did anything hurt?
1,12/22/2026 10:01,12/22/2026 10:03,aiko.t@school.example,"Testfield, Aiko",22/12/2026,Holiday Express,Mid,No
2,12/23/2026 09:00,12/23/2026 09:02,ben.c@school.example,Ben Carterson,2026-12-23,Run outside (20 min+),,Yes
3,12/24/2026 11:00,12/24/2026 11:01,zed.q@school.example,"Quillfeather, Zed",24/12/2026,Engine,Base,No
4,12/26/2026 08:00,12/26/2026 08:05,aiko.t@school.example,"Testfield, Aiko",26/12/2026,Armour,Summit,No`;

describe('holiday Form CSV', () => {
  it('is recognised, and the columns are found by their questions', () => {
    expect(looksLikeGymForm(CSV)).toBe(true);
    const m = guessMapping(readFormTable(CSV).header);
    expect(m).toMatchObject({ id: 'ID', email: 'Email', name: 'Name', date: 'Date of session', card: 'What did you do?', level: 'Which level?', hurt: 'Did anything hurt?', completed: 'Completion time' });
  });

  it('reads names, dates and answers', () => {
    expect(formName('Testfield, Aiko')).toBe('Aiko Testfield');
    expect(formName('Aiko Testfield')).toBe('Aiko Testfield');
    expect(formDate('22/12/2026')).toBe('2026-12-22');
    expect(formDate('12/22/2026')).toBe('2026-12-22');
    expect(formDate('1/2/2027', 'mdy')).toBe('2027-01-02');
    expect(formDate('1/2/2027', 'dmy')).toBe('2027-02-01');
    expect(formDate('46378')).toBe('2026-12-22');
    expect(cardFromAnswer('Holiday Express', cfg)).toBe('H');
    expect(cardFromAnswer('Express', cfg)).toBe('X');
    expect(cardFromAnswer('Run outside (20 min+)', cfg)).toBe('R');
  });

  it('§13.10 "Family, Given" is matched, the email is stored as an alias, and an unmatched name lands on the radar', () => {
    const imp = parseGymForm(CSV, guessMapping(readFormTable(CSV).header), roster, cfg, '2027-01-04');
    expect(imp.rows.map((r) => r.match.athleteId)).toEqual(['aiko', 'ben', undefined, 'aiko']);
    expect(imp.rows[0].entries[0]).toMatchObject({ card: 'H', tier: 2, hurt: false });
    expect(imp.rows[1].entries[0]).toMatchObject({ card: 'R', hurt: true });
    expect(imp.rows[1].entries[0].tier).toBeUndefined();
    const chosen = Object.fromEntries(imp.rows.map((r) => [r.key, r.match.athleteId]));
    const ev = evaluateGymImport(imp, chosen, base, cfg);
    expect(ev.get(imp.rows[3].key)!.entries[0].warnings).toContain('Summit without a pass');
    const { changes } = gymImportChanges(imp, chosen, base, cfg, '2027-01-04T08:00:00Z');
    const unmatched = unmatchedEntries(imp.rows.filter((r) => !chosen[r.key]), '2027-01-04T08:00:00Z');
    const after = applyChanges(applyChanges(base, changes), { meta: { gymUnmatched: unmatched } });
    expect(after.athletes.find((a) => a.id === 'aiko')!.aliases).toEqual(['aiko.t@school.example']);
    expect(after.performances.every((p) => p.source === 'form' && p.gym!.holiday)).toBe(true);
    expect(after.performances).toHaveLength(3);
    // Next time, the email alone matches confidently.
    const again = parseGymForm(CSV.replace('"Testfield, Aiko"', 'A. Testfield'), guessMapping(readFormTable(CSV).header), after.athletes, cfg, '2027-01-04');
    expect(again.rows[0].match).toMatchObject({ athleteId: 'aiko', type: 'exact_alias' });
    // The unmatched respondent is listed for the coach.
    expect(after.meta.gymUnmatched!.map((u) => u.name)).toEqual(['Quillfeather, Zed']);
    const d = deriveAll(after, '2027-01-04');
    expect(d.athletes.get('aiko')!.white!.holidayCredits['2026-12-14']).toBe(2);
    expect(whiteRadar([d.athletes.get('ben')!.white!], after.athletes, cfg, '2026-W52').hurt).toHaveLength(1);
  });

  it('asks for the required columns when they cannot be found', () => {
    const imp = parseGymForm('Who,When\nAiko,1/1/2027', {}, roster, cfg, '2027-01-04');
    expect(imp.rows).toHaveLength(0);
    expect(imp.warnings[0]).toMatch(/Choose the column for: Name, Date of session, What did you do\?/);
  });
});
