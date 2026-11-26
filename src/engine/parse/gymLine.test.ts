// §13.9: the Gym Log sheet paste block. Fictional runners only.
import { describe, expect, it } from 'vitest';
import type { Athlete, DataSnapshot } from '../../types';
import { DEFAULT_CONFIG } from '../config';
import { applyChanges } from '../../store/changes';
import { emptySnapshot } from '../../store/Store';
import { evaluateGymImport, GYM_WARN, gymImportChanges, looksLikeGymFormat, parseGymLines } from './gymLine';
import { deriveAll } from '../derive';

const cfg = DEFAULT_CONFIG;

function athlete(id: string, given: string, family: string, extra: Partial<Athlete> = {}): Athlete {
  return {
    id,
    givenName: given,
    familyName: family,
    preferredName: given,
    aliases: [],
    sex: 'F',
    yearGroup: 'Y9',
    displayMode: 'full',
    absoluteBoardOptOut: false,
    avatar: { seed: 1, skinTone: 0, hairStyle: 0, hairColour: 0, kitColour: 'academy-navy', accessory: 'none' },
    active: true,
    ...extra,
  };
}

const roster = [athlete('aiko', 'Aiko', 'Testfield'), athlete('ben', 'Ben', 'Carterson'), athlete('chika', 'Chika', 'Morimoto'), athlete('dai', 'Dai', 'Hillcrest', { summitPass: { date: '2027-01-04' } })];
const base: DataSnapshot = { ...emptySnapshot(), athletes: roster, configs: [cfg] };

const BLOCK = `# gym | 2027-01-11
Aiko Testfeild | Mon A2 | Thu E1!
Ben Carterson | Tue S1 | Tue X2 | Fri Q2 | Sat A3
Chika Morimoto | Mon E1 | Wed A1 | RF
Dai Hillcrest | wed x2 | FRI A3`;

/** What the coach would choose: confident matches, and the top suggestion for a fuzzy one (after checking). */
function chooseAll(imp: ReturnType<typeof parseGymLines>): Record<string, string | undefined> {
  return Object.fromEntries(imp.rows.map((r) => [r.key, r.match.athleteId ?? r.match.candidates[0]?.athleteId]));
}

describe('gym line format', () => {
  it('is recognised by its header', () => {
    expect(looksLikeGymFormat(BLOCK)).toBe(true);
    expect(looksLikeGymFormat('# event: Campus Circuit | 2026-11-04 | circuit')).toBe(false);
    expect(looksLikeGymFormat('# summit | 2027-01-12\nAiko')).toBe(true);
  });

  it('parses days in any case, several codes on one day, tierless cards, "!" and RF', () => {
    const imp = parseGymLines('# gym | 2027-01-11\nAiko Testfield | mon A2 E1 | THU R! | Sun x3\nChika Morimoto | RF', roster, cfg, '2027-01-18');
    const a = imp.rows[0];
    expect(a.entries.map((e) => [e.date, e.card, e.tier, e.hurt])).toEqual([
      ['2027-01-11', 'A', 2, false],
      ['2027-01-11', 'E', 1, false],
      ['2027-01-14', 'R', undefined, true],
      ['2027-01-17', 'X', 3, false],
    ]);
    expect(imp.rows[1]).toMatchObject({ rf: true, entries: [] });
  });

  it('snaps a header date to its Monday, with a warning', () => {
    const imp = parseGymLines('# gym | 2027-01-13\nAiko Testfield | Mon A1', roster, cfg, '2027-01-18');
    expect(imp.rows[0].date).toBe('2027-01-11');
    expect(imp.warnings.join(' ')).toMatch(/not a Monday/);
  });

  it('§13.9 the fixture: the right warnings, nothing before approval, and a second import adds nothing', () => {
    const imp = parseGymLines(BLOCK, roster, cfg, '2027-01-18');
    const [aiko, ben, chika, dai] = imp.rows;
    // A fuzzy name is suggested, never matched confidently.
    expect(aiko.match.type).toBe('fuzzy');
    expect(aiko.match.candidates[0].athleteId).toBe('aiko');
    const chosen = chooseAll(imp);
    const ev = evaluateGymImport(imp, chosen, base, cfg);
    const w = (rowKey: string) => ev.get(rowKey)!;
    // "!" present (amber).
    expect(w(aiko.key).entries[1]).toMatchObject({ amber: true, credited: true });
    expect(w(aiko.key).entries[1].warnings).toContain(GYM_WARN.hurt);
    // Same date twice: the second is not credited. Unknown code Q2: not imported. Summit without a pass.
    const benE = w(ben.key).entries;
    expect(benE[0]).toMatchObject({ action: 'import', credited: true });
    expect(benE[1].warnings).toContain(GYM_WARN.sameDate);
    expect(benE[1].credited).toBe(false);
    expect(benE[2]).toMatchObject({ action: 'skip' });
    expect(benE[2].warnings.join(' ')).toMatch(/Unknown code “Q2”/);
    expect(benE[3].warnings).toContain(GYM_WARN.summit);
    // An RF in a week that already qualifies.
    expect(w(chika.key).rf!.warnings).toContain(GYM_WARN.rfQualified);
    // A Summit pass holder: no warning.
    expect(w(dai.key).entries.flatMap((e) => e.warnings)).toEqual([]);

    // Nothing commits before approval: evaluating changed nothing.
    expect(base.performances).toHaveLength(0);

    const { changes, summary } = gymImportChanges(imp, chosen, base, cfg, '2027-01-18T08:00:00Z');
    expect(summary).toMatchObject({ sessions: 9, credited: 8, rfs: 1, aliases: 1 });
    const after = applyChanges(base, changes);
    expect(after.performances.every((p) => p.kind === 'gym_session' && p.source === 'sheet' && p.verified)).toBe(true);
    expect(after.athletes.find((a) => a.id === 'aiko')!.aliases).toContain('Aiko Testfeild');
    expect(after.participation).toEqual([expect.objectContaining({ athleteId: 'chika', type: 'freeze', freezeKind: 'self_rf' })]);
    const d = deriveAll(after, '2027-01-18');
    expect(d.athletes.get('chika')!.white!.weeks.find((x) => x.week === '2027-W02')!.status).toBe('qualifying');

    // Importing the same block again adds nothing.
    const again = parseGymLines(BLOCK, after.athletes, cfg, '2027-01-18');
    const second = gymImportChanges(again, chooseAll(again), after, cfg, '2027-01-18T09:00:00Z');
    expect(second.changes.put?.performances ?? []).toHaveLength(0);
    expect(second.changes.put?.participation ?? []).toHaveLength(0);
    expect(evaluateGymImport(again, chooseAll(again), after, cfg).get(again.rows[0].key)!.entries.every((e) => e.warnings.includes(GYM_WARN.already))).toBe(true);
  });

  it('warns about the weekly cap, an RF over the allowance and a date outside White Season', () => {
    const block = `# gym | 2027-01-11
Aiko Testfield | Mon A1 | Tue A1 | Wed A1 | Thu A1
# gym | 2027-01-18
Chika Morimoto | RF
# gym | 2027-01-25
Chika Morimoto | RF
# gym | 2027-02-01
Chika Morimoto | RF
# gym | 2026-11-30
Ben Carterson | Mon E1`;
    const imp = parseGymLines(block, roster, cfg, '2027-02-08');
    const ev = evaluateGymImport(imp, chooseAll(imp), base, cfg);
    expect(ev.get(imp.rows[0].key)!.entries[3].warnings).toContain(GYM_WARN.overCap);
    expect(ev.get(imp.rows[1].key)!.rf!.warnings).toEqual([]);
    expect(ev.get(imp.rows[2].key)!.rf!.warnings).toEqual([]);
    expect(ev.get(imp.rows[3].key)!.rf!.warnings).toContain(GYM_WARN.rfOver);
    expect(ev.get(imp.rows[4].key)!.entries[0].warnings).toContain(GYM_WARN.outside);
    expect(imp.warnings.join(' ')).toMatch(/outside White Season/);
  });
});

describe('# summit and # freeze: medical (9c)', () => {
  it('gives Summit passes and medical freezes, once', () => {
    const block = `# summit | 2027-01-12
Aiko Testfield, Ben Carterson
# freeze: medical | 2027-01-18
Chika Morimoto`;
    const imp = parseGymLines(block, roster, cfg, '2027-01-18');
    expect(imp.rows.map((r) => [r.action, r.match.athleteId, r.date])).toEqual([
      ['summit', 'aiko', '2027-01-12'],
      ['summit', 'ben', '2027-01-12'],
      ['freeze', 'chika', '2027-01-18'],
    ]);
    const { changes, summary } = gymImportChanges(imp, chooseAll(imp), base, cfg, '2027-01-18T08:00:00Z');
    expect(summary).toMatchObject({ summitPasses: 2, freezes: 1 });
    const after = applyChanges(base, changes);
    expect(after.athletes.find((a) => a.id === 'aiko')!.summitPass).toEqual({ date: '2027-01-12' });
    expect(after.participation[0]).toMatchObject({ freezeKind: 'medical', isoWeek: '2027-W03' });
    // A freeze stores no reason.
    expect(Object.keys(after.participation[0]).sort()).toEqual(['athleteId', 'date', 'freezeKind', 'id', 'isoWeek', 'type']);
    const again = gymImportChanges(parseGymLines(block, after.athletes, cfg, '2027-01-18'), chooseAll(imp), after, cfg, 'x');
    expect(again.summary).toMatchObject({ summitPasses: 0, freezes: 0 });
  });

  it('a Summit pass in the same block clears the Summit warning from its date', () => {
    const imp = parseGymLines('# summit | 2027-01-11\nBen Carterson\n# gym | 2027-01-11\nBen Carterson | Wed A3', roster, cfg, '2027-01-18');
    const ev = evaluateGymImport(imp, chooseAll(imp), base, cfg);
    expect(ev.get(imp.rows[1].key)!.entries[0].warnings).not.toContain(GYM_WARN.summit);
  });
});
