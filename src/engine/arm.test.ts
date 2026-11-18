import { describe, expect, it } from 'vitest';
import type { Athlete, DataSnapshot, Performance } from '../types';
import { SCHEMA_VERSION } from '../types';
import { cloneConfig, DEFAULT_CONFIG, withDefaults } from './config';
import { armEffective, armLevelsFromTest, armPlates, armResultText, armSpread, armSpreadSkewed, armWeakerValue } from './arm';
import { deriveAll } from './derive';
import { explainStat } from './explain';
import { buildCardData } from '../ui/cards/cardData';
import { pupilArmSpread } from '../ui/pages/settings/ArmSpread';

const cfg = DEFAULT_CONFIG;

describe('ARM Season 0 config defaults', () => {
  it('calf 15/20/25/30/35 reps, stork 3/6/10/15 s, ankle unchanged, hop gate 120 cm', () => {
    expect(cfg.arm.ankleCm).toEqual([5, 8, 10, 12, 14]);
    expect(cfg.arm.calfReps).toEqual([15, 20, 25, 30, 35]);
    expect(cfg.arm.storkSec).toEqual([3, 6, 10, 15]);
    expect(cfg.arm.hopGateCm).toBe(120);
  });

  it('a stored config from before the hop gate is read with the default gate, keeping its own thresholds', () => {
    const old = cloneConfig(cfg) as unknown as { arm: Record<string, unknown> };
    delete old.arm.hopGateCm;
    old.arm.calfReps = [10, 15, 20, 25, 30];
    const c = withDefaults(old as never);
    expect(c.arm.hopGateCm).toBe(120);
    expect(c.arm.calfReps).toEqual([10, 15, 20, 25, 30]);
  });
});

describe('ARM lookup (levels added → ARM), as printed on the thresholds card', () => {
  it('3→40 … 15→99', async () => {
    const { armScoreClamped } = await import('./scoring');
    const table: Record<number, number> = { 3: 40, 4: 45, 5: 50, 6: 55, 7: 60, 8: 65, 9: 70, 10: 74, 11: 79, 12: 84, 13: 89, 14: 94, 15: 99 };
    for (const [sum, arm] of Object.entries(table)) {
      const s = Number(sum);
      const ankle = Math.min(5, s - 2);
      const calf = Math.min(5, s - ankle - 1);
      expect(armScoreClamped({ ankle, calf, balance: s - ankle - calf }, cfg)).toBe(arm);
    }
  });
});

describe('armEffective: the engine works out the weaker side', () => {
  it('takes the lower leg on every measure and says which leg it was', () => {
    const e = armEffective({ left: { ankleCm: 9.5, calfReps: 25, storkSec: 6 }, right: { ankleCm: 11, calfReps: 22, storkSec: 6 } }, cfg);
    expect(e).toMatchObject({ ankleCm: 9.5, calfReps: 22, storkSec: 6 });
    expect(e.weakSide).toEqual({ ankleCm: 'L', calfReps: 'R', storkSec: '=' });
  });

  it('old single-value records still work (already the weaker side)', () => {
    expect(armEffective({ ankleCm: 11, calfReps: 23, storkSec: 12, hopStickBothLegs: true }, cfg)).toEqual({ ankleCm: 11, calfReps: 23, storkSec: 12, hopStickBothLegs: true });
    expect(armLevelsFromTest({ ankleCm: 11, calfReps: 23, storkSec: 16, hopStickBothLegs: true }, cfg)).toEqual({ ankle: 3, calf: 2, balance: 5 });
  });

  it('per-leg values win over an old single value; a measure with no per-leg value falls back to it', () => {
    const e = armEffective({ ankleCm: 14, calfReps: 30, left: { ankleCm: 8 }, right: { ankleCm: 9 } }, cfg);
    expect(e.ankleCm).toBe(8);
    expect(e.calfReps).toBe(30);
  });

  it('with one leg recorded, that leg is used', () => {
    expect(armEffective({ left: { calfReps: 26 } }, cfg)).toMatchObject({ calfReps: 26, weakSide: { calfReps: 'L' } });
    expect(armWeakerValue({ right: { storkSec: 7 } }, 'storkSec')).toBe(7);
    expect(armWeakerValue({ storkSec: 7 }, 'storkSec')).toBe(7);
    expect(armWeakerValue(undefined, 'storkSec')).toBeUndefined();
  });

  it('hop = yes only when the line frozen is at least the gate on both legs', () => {
    const hop = (l?: number, r?: number, extra = {}) => armEffective({ left: { hopLineCm: l }, right: { hopLineCm: r }, ...extra }, cfg).hopStickBothLegs;
    expect(hop(120, 140)).toBe(true);
    expect(hop(120, 120)).toBe(true);
    expect(hop(100, 140)).toBe(false);
    expect(hop(0, 140)).toBe(false);
    expect(hop(140, undefined)).toBeUndefined(); // one leg only: not proven
    expect(hop(100, undefined)).toBe(false); // one leg already short of the gate
    expect(hop(undefined, undefined)).toBeUndefined();
    expect(hop(140, undefined, { hopStickBothLegs: true })).toBe(true); // an old yes stands until both legs are recorded
    expect(hop(100, 140, { hopStickBothLegs: true })).toBe(false); // per-leg lines win
  });

  it('the gate comes from config.arm.hopGateCm', () => {
    const c = cloneConfig(cfg);
    c.arm.hopGateCm = 100;
    expect(armEffective({ left: { hopLineCm: 100 }, right: { hopLineCm: 100 } }, c).hopStickBothLegs).toBe(true);
    expect(armEffective({ left: { hopLineCm: 100 }, right: { hopLineCm: 100 } }, cfg).hopStickBothLegs).toBe(false);
  });
});

describe('armLevelsFromTest with per-leg results', () => {
  it('levels the weaker leg: ankle 9.5/11 → L2, calf 22/25 → L2, stork 6/9 → L2', () => {
    expect(armLevelsFromTest({ left: { ankleCm: 9.5, calfReps: 22, storkSec: 6 }, right: { ankleCm: 11, calfReps: 25, storkSec: 9 } }, cfg)).toEqual({ ankle: 2, calf: 2, balance: 2 });
  });

  it('balance L5 = stork 15 s on the weaker leg + hop yes (120 cm frozen on both legs)', () => {
    const t = (stork: [number, number], hop: [number, number]) => armLevelsFromTest({ left: { storkSec: stork[0], hopLineCm: hop[0] }, right: { storkSec: stork[1], hopLineCm: hop[1] } }, cfg).balance;
    expect(t([15, 20], [120, 140])).toBe(5);
    expect(t([15, 20], [100, 140])).toBe(4); // hop short on one leg
    expect(t([14, 30], [140, 140])).toBe(3); // weaker leg below 15 s: the hop only lifts L4
  });
});

describe('armPlates, armResultText', () => {
  it("'A3 · C4 · B2', with '–' for an untested plate and 0 for below L1", () => {
    expect(armPlates({ ankle: 3, calf: 4, balance: 2 })).toBe('A3 · C4 · B2');
    expect(armPlates({ ankle: 0, balance: 5 })).toBe('A0 · C– · B5');
  });

  it('shows left/right where recorded, and old single values as before', () => {
    expect(armResultText({ left: { ankleCm: 9.5, calfReps: 22, storkSec: 6, hopLineCm: 100 }, right: { ankleCm: 11, calfReps: 25, storkSec: 9, hopLineCm: 120 } })).toBe('ankle 9.5/11 cm · calf 22/25 · stork 6/9 s · hop 100/120');
    expect(armResultText({ ankleCm: 11, calfReps: 18, storkSec: 22, hopStickBothLegs: true })).toBe('ankle 11 cm · calf 18 · stork 22 s · hop ✓');
    expect(armResultText({ left: { ankleCm: 9 } })).toBe('ankle 9/– cm');
    expect(armResultText(undefined)).toBe('');
  });
});

describe('armSpread (Season 0 threshold review)', () => {
  it('counts pupils per plate at each level, below L1 and untested', () => {
    const s = armSpread([
      { ankle: 3, calf: 5, balance: 0 },
      { ankle: 3, calf: 5, balance: 1 },
      { ankle: 5, calf: 2 },
      {},
    ]);
    expect(s.ankle).toEqual({ below: 0, levels: [0, 0, 2, 0, 1], untested: 1, tested: 3 });
    expect(s.calf).toEqual({ below: 0, levels: [0, 1, 0, 0, 2], untested: 1, tested: 3 });
    expect(s.balance).toEqual({ below: 1, levels: [1, 0, 0, 0, 0], untested: 2, tested: 2 });
  });

  it('flags a plate where more than a third of tested pupils are at L5 or below L1', () => {
    const s = armSpread([{ calf: 5 }, { calf: 3 }, { calf: 2 }]);
    expect(armSpreadSkewed(s.calf)).toBe(false); // exactly a third
    expect(armSpreadSkewed(armSpread([{ calf: 5 }, { calf: 5 }, { calf: 2 }]).calf)).toBe(true);
    expect(armSpreadSkewed(armSpread([{ calf: 0 }, { calf: 0 }, { calf: 2 }]).calf)).toBe(true);
    expect(armSpreadSkewed(armSpread([{}]).calf)).toBe(false); // nobody tested
  });
});

describe('ARM on the card, the explanation and the spread view', () => {
  const athlete = (id: string, over: Partial<Athlete> = {}): Athlete => ({
    id, givenName: id, familyName: 'Testfield', preferredName: id, aliases: [], sex: 'F', yearGroup: 'Y9', yearGroupYear: 2026, dob: '2013-02-20',
    displayMode: 'first_initial', absoluteBoardOptOut: false, avatar: { seed: 1, skinTone: 0, hairStyle: 0, hairColour: 0, kitColour: 'academy-navy', accessory: 'none' }, active: true, ...over,
  });
  let n = 0;
  const arm = (athleteId: string, a: Performance['arm']): Performance => ({ id: `a${++n}`, athleteId, date: '2026-11-10', kind: 'arm', arm: a, verified: true, source: 'coach', rawInput: '', history: [] });
  const snap = (athletes: Athlete[], perfs: Performance[]): DataSnapshot => ({
    schemaVersion: SCHEMA_VERSION, athletes, courses: [], events: [], performances: perfs, participation: [], achievements: [], configs: [cfg], calendar: { holidayWeeks: [], halfTerms: [] }, meta: {},
  });
  const full = { left: { ankleCm: 9.5, calfReps: 31, storkSec: 6, hopLineCm: 100 }, right: { ankleCm: 11, calfReps: 33, storkSec: 9, hopLineCm: 120 } };

  it('the card shows the plate levels next to ARM', () => {
    const d = deriveAll(snap([athlete('aiko')], [arm('aiko', full)]), '2026-11-18');
    const ad = d.athletes.get('aiko')!;
    expect(ad.ratings.arm).toEqual({ ankle: 2, calf: 4, balance: 2, missing: [] });
    const s = buildCardData(ad).stats.find((x) => x.key === 'ARM')!;
    expect(s).toMatchObject({ locked: false, value: 65, plates: 'A2·C4·B2' }); // 2 + 4 + 2 = 8 levels → 65
    expect(buildCardData(ad).stats.find((x) => x.key === 'SPD')!.plates).toBeUndefined();
  });

  it('a locked ARM has no plates on the card', () => {
    const d = deriveAll(snap([athlete('aiko')], [arm('aiko', { left: { ankleCm: 9 } })]), '2026-11-18');
    expect(buildCardData(d.athletes.get('aiko')!).stats.find((x) => x.key === 'ARM')!.plates).toBeUndefined();
  });

  it('the explanation names the weaker leg', () => {
    const d = deriveAll(snap([athlete('aiko')], [arm('aiko', full)]), '2026-11-18');
    const t = explainStat(d.athletes.get('aiko')!, 'ARM', cfg, d.lookup).paragraphs.join(' ');
    expect(t).toContain('ankle level 2 (9.5 cm, left, 10 Nov); calf level 4 (31 heel raises, left, 10 Nov); balance level 2 (6 s, left, 10 Nov)');
  });

  it('the spread view counts active pupils only (no staff, no inactive)', () => {
    const d = deriveAll(
      snap(
        [athlete('aiko'), athlete('ben'), athlete('coach', { yearGroup: 'Staff' }), athlete('gone', { active: false })],
        [arm('aiko', full), arm('coach', full), arm('gone', full), arm('ben', { ankleCm: 3 })],
      ),
      '2026-11-18',
    );
    const s = pupilArmSpread(d);
    expect(s.ankle).toEqual({ below: 1, levels: [0, 1, 0, 0, 0], untested: 0, tested: 2 });
    expect(s.calf).toEqual({ below: 0, levels: [0, 0, 0, 1, 0], untested: 1, tested: 1 });
  });
});
