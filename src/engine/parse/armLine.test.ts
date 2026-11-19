// ARM line format, Season 0 (left/right, "-", throne, pistol, height, hop in metres) and the import path that
// saves it. Fictional names only.
import { describe, expect, it } from 'vitest';
import type { Athlete, DataSnapshot } from '../../types';
import { emptySnapshot } from '../../store/Store';
import { applyChanges } from '../../store/changes';
import { DEFAULT_CONFIG } from '../config';
import { deriveAll } from '../derive';
import { parseLineFormat } from './lineFormat';
import { buildImportPlan, planToChanges } from './plan';

const cfg = DEFAULT_CONFIG;
const parse = (t: string) => parseLineFormat(t, { today: '2026-11-19', config: cfg });

describe('ARM line format', () => {
  it('reads left/right pairs, "-" and the Throne', () => {
    const r = parse('# test: arm | 2026-11-19\nKit Fictional ankle 12/9 calf 22/25 throne 3/2 height 172').rows[0];
    expect(r.name).toBe('Kit Fictional');
    expect(r.errors).toEqual([]);
    expect(r.arm).toEqual({ left: { ankleCm: 12, calfReps: 22, throne: 3 }, right: { ankleCm: 9, calfReps: 25, throne: 2 } });
    expect(r.heightCm).toBe(172);
  });
  it('keeps the old single-value lines working (weaker side)', () => {
    const r = parse('# test: arm | 2026-11-10\nKit Fictional ankle 11 calf 18 stork 22 hop yes').rows[0];
    expect(r.arm).toEqual({ ankleCm: 11, calfReps: 18, storkSec: 22, hopStickBothLegs: true });
    expect(r.warnings).toContain('stork is kept but no longer counts (the Throne replaced it)');
  });
  it('"-" means not tested; one leg alone is warned about', () => {
    const r = parse('# test: arm\nKit Fictional ankle 12/- calf -/- throne 2').rows[0];
    expect(r.arm).toEqual({ left: { ankleCm: 12 }, throne: 2 });
    expect(r.warnings.some((w) => /only one leg recorded/.test(w))).toBe(true);
  });
  it('hop distances under 5 are metres; pistol per leg', () => {
    const r = parse('# test: arm\nKit Fictional hop 2.15/1.85 pistol yes/no').rows[0];
    expect(r.arm).toEqual({ left: { hopCm: 215, pistol: true }, right: { hopCm: 185, pistol: false } });
    expect(r.warnings).toContain('hop read as metres and converted to cm');
  });
  it('flags calf over the cap and impossible values', () => {
    expect(parse('# test: arm\nKit Fictional calf 200/90').rows[0].warnings).toContain('calf over 100: counted as 100 (the Wall stops at 100)');
    expect(parse('# test: arm\nKit Fictional throne 6/2').rows[0].errors[0]).toMatch(/Implausible Throne level/);
    expect(parse('# test: arm\nKit Fictional throne 2.5').rows[0].errors[0]).toMatch(/whole number/);
    expect(parse('# test: arm\nKit Fictional ankle 45').rows[0].errors[0]).toMatch(/Implausible ankle/);
    expect(parse('# test: arm\nKit Fictional height 9').rows[0].errors[0]).toMatch(/Implausible height/);
  });
  it('a header note is kept for the event', () => {
    expect(parse('# test: arm | 2026-11-19 | note Season 0, trio sheets\nKit Fictional ankle 10').sections[0].notes).toBe('Season 0, trio sheets');
  });
});

const athlete = (id: string, given: string, family: string): Athlete => ({
  id,
  givenName: given,
  familyName: family,
  preferredName: given,
  aliases: [],
  sex: 'M',
  yearGroup: 'Y12',
  yearGroupYear: 2026,
  displayMode: 'full',
  absoluteBoardOptOut: false,
  avatar: { seed: 1, skinTone: 0, hairStyle: 0, hairColour: 0, kitColour: 'academy-navy', accessory: 'none' },
  active: true,
});

describe('ARM import (Paste & Match path)', () => {
  const snap: DataSnapshot = { ...emptySnapshot(), configs: [cfg], athletes: [athlete('kit', 'Kit', 'Fictional'), athlete('rio', 'Rio', 'Placeholder')] };
  const text = '# test: arm | 2026-11-19 | note Season 0, trio sheets\nKit Fictional ankle 12/9 calf 75/75 hop 215/185 height 181\nRio Placeholder ankle 8/9 calf 30/26 throne 2/3';
  it('matches, saves per-leg records stamped with the protocol, the event note and the height', () => {
    const plan = buildImportPlan(text, { snapshot: snap, config: cfg, today: '2026-11-19' });
    expect(plan.rows.map((r) => [r.athleteId, r.status])).toEqual([
      ['kit', 'ready'],
      ['rio', 'ready'],
    ]);
    const { changes, summary } = planToChanges(plan, {}, snap, { now: '2026-11-19T12:00:00.000Z', by: 'coach', newId: (p) => `${p}-${Math.random().toString(36).slice(2, 8)}` });
    expect(summary).toMatchObject({ performances: 2, newEvents: 1 });
    expect(changes.put!.events![0]).toMatchObject({ name: 'ARM tests', kind: 'test', notes: 'Season 0, trio sheets' });
    const kit = changes.put!.performances!.find((p) => p.athleteId === 'kit')!;
    expect(kit).toMatchObject({ verified: true, arm: { left: { ankleCm: 12, calfReps: 75, hopCm: 215 }, right: { ankleCm: 9, calfReps: 75, hopCm: 185 }, protocol: 'ARM-S0-v2' } });
    expect(changes.put!.performances!.find((p) => p.athleteId === 'rio')!.arm).toMatchObject({ throneSeatsCm: [61, 51, 42, 30.5, 19.5] });
    expect(changes.put!.athletes).toEqual([expect.objectContaining({ id: 'kit', heightCm: 181, heightMeasuredOn: '2026-11-19' })]);

    const after = deriveAll(applyChanges(snap, changes), '2026-11-20');
    expect(after.athletes.get('kit')!.ratings.arm).toMatchObject({ ankle: 2, calf: 5, control: 2, controlInterim: true });
    expect(after.athletes.get('kit')!.ratings.stats.ARM).toMatchObject({ value: 70, provisional: true });
    expect(after.athletes.get('rio')!.ratings.stats.ARM).toMatchObject({ value: 55, provisional: false }); // 2 + 2 + 2
  });
  it('a given name alone is proposed but waits for the coach to confirm it', () => {
    const plan = buildImportPlan('# test: arm | 2026-11-19\nKit ankle 12/9', { snapshot: snap, config: cfg, today: '2026-11-19' });
    expect(plan.rows[0]).toMatchObject({ athleteId: 'kit', status: 'review', warnings: ['given name only: confirm the athlete'] });
  });
  it('a second paste of the same test is skipped as a duplicate', () => {
    const plan = buildImportPlan(text, { snapshot: snap, config: cfg, today: '2026-11-19' });
    const { changes } = planToChanges(plan, {}, snap, { now: '2026-11-19T12:00:00.000Z', by: 'coach', newId: (p) => `${p}-1${Math.random().toString(36).slice(2, 6)}` });
    const again = buildImportPlan(text, { snapshot: applyChanges(snap, changes), config: cfg, today: '2026-11-19' });
    expect(again.rows.every((r) => r.status === 'skip')).toBe(true);
  });
});

describe('Armoury entry grid (saved through the Paste & Match path)', () => {
  it('writes line format and assigns each row to its pupil, even with the same given name twice', async () => {
    const { armGridPlan } = await import('./armGrid');
    const twin = { ...athlete('kit2', 'Kit', 'Another') };
    const s: DataSnapshot = { ...emptySnapshot(), configs: [cfg], athletes: [athlete('kit', 'Kit', 'Fictional'), twin] };
    const { plan, decisions, text } = armGridPlan(
      [
        { athleteId: 'kit', ankleL: '12', ankleR: '9', calfL: '40', calfR: '40', hopL: '215', hopR: '185', height: '181' },
        { athleteId: 'kit2', ankleL: '8', calfL: '30', calfR: '23', throneL: '2', throneR: '3', pistolL: true },
        { athleteId: 'kit' }, // nothing typed: left out
      ],
      '2026-11-19',
      'Season 0 | trio sheets',
      { snapshot: s, config: cfg, today: '2026-11-19' },
    );
    expect(text).toBe('# test: arm | 2026-11-19 | note Season 0 / trio sheets\nKit Fictional ankle 12/9 calf 40/40 hop 215/185 height 181\nKit Another ankle 8/- calf 30/23 throne 2/3 pistol yes/no');
    const { changes } = planToChanges(plan, decisions, s, { now: '2026-11-19T12:00:00.000Z', by: 'coach', newId: (p) => `${p}-${Math.random().toString(36).slice(2, 8)}` });
    expect(changes.put!.performances!.map((p) => p.athleteId).sort()).toEqual(['kit', 'kit2']);
    expect(changes.put!.performances!.find((p) => p.athleteId === 'kit2')!.arm).toMatchObject({ left: { ankleCm: 8, calfReps: 30, throne: 2, pistol: true }, right: { calfReps: 23, throne: 3, pistol: false } });
  });
});
