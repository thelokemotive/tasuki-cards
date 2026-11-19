// THE ARMOURY battery (Nov 2026): both legs kept, weaker leg sets the level, the Landing ladder replaces the stork.
import { describe, expect, it } from 'vitest';
import { armLevelsFromTest, armLookup, armMeasuresText, armScore, armWeaker } from './arm';
import { ARMOURY_MIGRATION, armouryMigration, cloneConfig, DEFAULT_CONFIG, preArmouryRules, type Config } from './config';
import { parseLineFormat } from './parse/lineFormat';

const cfg = DEFAULT_CONFIG;

describe('Armoury thresholds', () => {
  it('Lunge 6/8/10/12/14 cm, Wall 20/25/30/35/40 reps, Landing 80/95/110/125/140 cm', () => {
    const lv = (arm: object) => armLevelsFromTest(arm, cfg);
    expect([5.5, 6, 7.5, 8, 10, 12, 14, 20].map((ankleCm) => lv({ ankleCm }).ankle)).toEqual([0, 1, 1, 2, 3, 4, 5, 5]);
    expect([19, 20, 24, 25, 30, 35, 39, 40, 60].map((calfReps) => lv({ calfReps }).calf)).toEqual([0, 1, 1, 2, 3, 4, 4, 5, 5]);
    expect([0, 65, 80, 95, 110, 125, 140, 160].map((hopCm) => lv({ hopCm }).balance)).toEqual([0, 0, 1, 2, 3, 4, 5, 5]);
  });

  it('the weaker leg sets the level, and both legs are needed', () => {
    const t = { ankleCmL: 13, ankleCmR: 9.5, calfRepsL: 31, calfRepsR: 36, hopCmL: 125, hopCmR: 95 };
    expect(armLevelsFromTest(t, cfg)).toEqual({ ankle: 2, calf: 3, balance: 2 });
    expect(armWeaker(t).weakerLeg).toEqual({ ankle: 'R', calf: 'L', balance: 'R' });
    // One leg only: that plate is not measured yet (never a level from the stronger side alone).
    expect(armLevelsFromTest({ ankleCmL: 13, calfReps: 30 }, cfg)).toEqual({ calf: 3 });
  });

  it('a hop ladder result wins over a legacy stork time in the same test; stork-only tests keep the old rule', () => {
    expect(armLevelsFromTest({ hopCm: 110, storkSec: 4 }, cfg).balance).toBe(3);
    expect(armLevelsFromTest({ storkSec: 31, hopStickBothLegs: true }, cfg).balance).toBe(5);
    expect(armLevelsFromTest({ storkSec: 22 }, cfg).balance).toBe(3);
  });

  it('the lookup strip on the posters matches the formula: 13 levels = 89, the first Armour Glow score', () => {
    expect(armLookup().map((x) => x.arm)).toEqual([40, 45, 50, 55, 60, 65, 70, 74, 79, 84, 89, 94, 99]);
    expect(armScore({ ankle: 5, calf: 4, balance: 4 })).toBe(89);
    expect(armLookup().find((x) => x.arm >= cfg.avatarUnlocks.armGlow)?.sum).toBe(13);
    expect(armLookup().find((x) => x.arm >= cfg.avatarUnlocks.armGuards)?.sum).toBe(9);
  });

  it('a test from before the Armoury, typed the old way, keeps its old levels (the new thresholds never lower it)', () => {
    const old = { ankleCm: 5, calfReps: 30, storkSec: 22 };
    expect(armLevelsFromTest(old, cfg, '2026-10-12')).toEqual({ ankle: 1, calf: 5, balance: 3 });
    // The same numbers on or after the first Armoury day are read by the new levels.
    expect(armLevelsFromTest(old, cfg, '2026-11-19')).toEqual({ ankle: 0, calf: 3, balance: 3 });
    // An early test already typed with both legs is an Armoury test.
    expect(armLevelsFromTest({ calfRepsL: 30, calfRepsR: 31 }, cfg, '2026-11-18')).toEqual({ calf: 3 });
  });

  it('text shows both legs', () => {
    expect(armMeasuresText({ ankleCmL: 9.5, ankleCmR: 11, calfRepsL: 24, calfRepsR: 27, hopCmL: 95, hopCmR: 110 })).toBe('Lunge L9.5 R11 cm · Wall L24 R27 · Landing L95 R110 cm');
  });
});

describe('ARM paste line', () => {
  const parse = (body: string) => parseLineFormat(`# test: arm | 2026-11-18\n${body}`, { today: '2026-11-18', config: cfg }).rows[0];

  it('left/right pairs with the test names, any order, and staff initials', () => {
    const r = parse('Aiko Tanaka lunge 9.5/11 wall 24/27 landing 95/110 by FL');
    expect(r.name).toBe('Aiko Tanaka');
    expect(r.errors).toEqual([]);
    expect(r.arm).toEqual({ ankleCmL: 9.5, ankleCmR: 11, calfRepsL: 24, calfRepsR: 27, hopCmL: 95, hopCmR: 110, verifiedBy: 'FL' });
  });

  it('old words and single (weaker-side) numbers still work', () => {
    expect(parse('Ben Ito ankle 12 calf 30 stork 30 hop yes').arm).toEqual({ ankleCm: 12, calfReps: 30, storkSec: 30, hopStickBothLegs: true });
    expect(parse('Ben Ito hop 110').arm).toEqual({ hopCm: 110 });
  });

  it('flags implausible numbers', () => {
    expect(parse('Ben Ito lunge 9/90').errors.join()).toMatch(/Implausible lunge: 90/);
  });
});

describe('armouryMigration', () => {
  const old = (): Config => {
    const c = preArmouryRules(DEFAULT_CONFIG);
    delete (c.arm as Partial<Config['arm']>).hopCm;
    return c;
  };
  it('adds one version with the Armoury thresholds to a store made before them, once', () => {
    const v2 = armouryMigration([old()], '2026-11-18T00:00:00.000Z')!;
    expect(v2.version).toBe(2);
    expect(v2.migration).toBe(ARMOURY_MIGRATION);
    expect(v2.arm.hopCm).toEqual([80, 95, 110, 125, 140]);
    expect(v2.arm.calfReps).toEqual([20, 25, 30, 35, 40]);
    expect(armouryMigration([old(), v2], 'x')).toBeUndefined();
  });
  it('leaves a store first made with the Armoury battery alone', () => {
    expect(armouryMigration([cloneConfig(DEFAULT_CONFIG)], 'x')).toBeUndefined();
  });
});
