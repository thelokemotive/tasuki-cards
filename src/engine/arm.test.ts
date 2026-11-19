// ARM Season 0 (Nov 2026): per-leg results, the weaker side, the calf cap, the Throne (CONTROL plate), the interim
// level from the hop, and old config versions reproducing old ratings. Fictional athletes only.
import { describe, expect, it } from 'vitest';
import type { Athlete, Performance } from '../types';
import { ARM_S0_MIGRATION, armS0Migration, currentConfig, DEFAULT_CONFIG, preArmS0Rules, withDefaults, type Config } from './config';
import { armLevelsFromTest, armSummary, armTestDetail, nextLevelTarget, plateLine, stampArm, weakerSide } from './arm';
import { makeLookup } from './perf';
import { computeAthleteRatings } from './stats';
import { computeBadges } from './badges';
import { explainStat } from './explain';
import { deriveAll } from './derive';
import { emptySnapshot } from '../store/Store';

const cfg = DEFAULT_CONFIG;
const AS_OF = '2026-11-20';
const lookup = makeLookup([], []);

const kit: Athlete = {
  id: 'a-kit',
  givenName: 'Kit',
  familyName: 'Fictional',
  preferredName: 'Kit',
  aliases: [],
  sex: 'M',
  yearGroup: 'Y12',
  yearGroupYear: 2026,
  displayMode: 'full',
  absoluteBoardOptOut: false,
  avatar: { seed: 1, skinTone: 0, hairStyle: 0, hairColour: 0, kitColour: 'academy-navy', accessory: 'none' },
  active: true,
};

let n = 0;
const arm = (a: Performance['arm'], over: Partial<Performance> = {}): Performance => ({
  id: `p${++n}`,
  athleteId: 'a-kit',
  date: '2026-11-19',
  kind: 'arm',
  arm: a,
  verified: true,
  source: 'paste',
  rawInput: '',
  history: [],
  ...over,
});
const rate = (perfs: Performance[], config: Config = cfg, asOf = AS_OF) => computeAthleteRatings({ athlete: kit, perfs, lookup, config, asOf, streakActiveOrFrozen: false });

describe('weaker side', () => {
  it('takes the lower leg when both are recorded', () => {
    expect(weakerSide({ left: { ankleCm: 12 }, right: { ankleCm: 9 } }, 'ankleCm')).toEqual({ value: 9, left: 12, right: 9, weaker: 'R' });
    expect(weakerSide({ left: { throne: 2 }, right: { throne: 2 } }, 'throne')).toMatchObject({ value: 2, weaker: undefined });
  });
  it('a single value is the weaker side (every record before Season 0)', () => {
    expect(weakerSide({ ankleCm: 11 }, 'ankleCm')).toEqual({ value: 11 });
  });
  it('one leg only does not count: the weaker side is unknown', () => {
    expect(weakerSide({ left: { ankleCm: 12 } }, 'ankleCm')).toEqual({ left: 12, oneLegOnly: true });
    expect(armLevelsFromTest({ left: { ankleCm: 12 } }, cfg).ankle).toBeUndefined();
  });
});

describe('Season 0 thresholds', () => {
  it('ankle unchanged: L1 ≥ 5, L2 ≥ 8, L3 ≥ 10, L4 ≥ 12, L5 ≥ 14 cm', () => {
    expect([4.9, 5, 8, 10, 12, 14].map((ankleCm) => armLevelsFromTest({ ankleCm }, cfg).ankle)).toEqual([0, 1, 2, 3, 4, 5]);
  });
  it('calf one level harder: L1 ≥ 15, L2 ≥ 20, L3 ≥ 25, L4 ≥ 30, L5 ≥ 35 reps', () => {
    expect([14, 15, 20, 25, 30, 35].map((calfReps) => armLevelsFromTest({ calfReps }, cfg).calf)).toEqual([0, 1, 2, 3, 4, 5]);
  });
  it('calf is counted up to 40 (the Wall stops there), and whole reps only', () => {
    const d = armTestDetail({ left: { calfReps: 90 }, right: { calfReps: 50 } }, cfg);
    expect(d.calf).toMatchObject({ value: 50, counted: 40, capped: true });
    expect(armTestDetail({ calfReps: 17.9 }, cfg).calf.counted).toBe(17);
  });
  it('control = the Throne level on the weaker leg, 0–5', () => {
    expect(armLevelsFromTest({ left: { throne: 3 }, right: { throne: 2 } }, cfg).control).toBe(2);
    expect(armLevelsFromTest({ throne: 0 }, cfg).control).toBe(0);
    expect(armLevelsFromTest({ throne: 9 }, cfg).control).toBe(5);
  });
  it('the stork no longer feeds ARM', () => {
    expect(armLevelsFromTest({ storkSec: 44, hopStickBothLegs: true }, cfg)).toEqual({});
  });
  it('the next level target names the seat', () => {
    expect(nextLevelTarget('control', 2, cfg)).toBe('T3 · 42 cm');
    expect(nextLevelTarget('control', 0, cfg)).toBe('T1 · 61 cm');
    expect(nextLevelTarget('calf', 1, cfg)).toBe('20 reps');
    expect(nextLevelTarget('ankle', 5, cfg)).toBeUndefined();
  });
});

describe('interim control level from the hop (tested before the Throne existed)', () => {
  it('both hops at least 120 cm → interim T2; the stork earns nothing', () => {
    const d = armTestDetail({ left: { hopCm: 215, storkSec: 30 }, right: { hopCm: 185, storkSec: 44 } }, cfg);
    expect(d.levels.control).toBe(2);
    expect(d.interim).toBe(true);
  });
  it('one hop short of 120 cm, or one leg missing: no interim level', () => {
    expect(armLevelsFromTest({ left: { hopCm: 186 }, right: { hopCm: 110 } }, cfg).control).toBeUndefined();
    expect(armLevelsFromTest({ left: { hopCm: 186 } }, cfg).control).toBeUndefined();
  });
  it('a full Season 0 test with no Throne: unlocks ARM, marked provisional', () => {
    // ankle 12/9 → 9 cm L2; calf 50/90 reps → 40 counted, L5; hop 215/185 → interim T2. 2 + 5 + 2 = 9 → 69.5 → 70.
    const r = rate([arm({ left: { ankleCm: 12, calfReps: 50, hopCm: 215 }, right: { ankleCm: 9, calfReps: 90, hopCm: 185 } })]);
    expect(r.arm).toMatchObject({ ankle: 2, calf: 5, control: 2, controlInterim: true, missing: [] });
    expect(r.stats.ARM).toMatchObject({ locked: false, value: 70, provisional: true });
    expect(plateLine(r.arm, cfg)).toBe('A2 · C5 · T2');
  });
  it('any Throne result in the window replaces it, even a lower one', () => {
    const first = arm({ left: { ankleCm: 12, calfReps: 40, hopCm: 215 }, right: { ankleCm: 9, calfReps: 40, hopCm: 185 } }, { date: '2026-11-19' });
    const throne = arm({ left: { throne: 1 }, right: { throne: 2 } }, { date: '2026-12-01' });
    const r = rate([first, throne], cfg, '2026-12-02');
    expect(r.arm).toMatchObject({ control: 1, missing: [] });
    expect(r.arm.controlInterim).toBeUndefined();
    expect(r.stats.ARM).toMatchObject({ value: 65, provisional: false }); // 2 + 5 + 1 = 8
  });
  it('expires after 6 months without a Throne test', () => {
    const t = arm({ left: { ankleCm: 12, calfReps: 40, hopCm: 215 }, right: { ankleCm: 9, calfReps: 40, hopCm: 185 } }, { date: '2026-11-19' });
    expect(rate([t], cfg, '2027-05-18').stats.ARM.locked).toBe(false);
    const later = rate([t], cfg, '2027-05-20');
    expect(later.stats.ARM).toMatchObject({ locked: true, unlockHint: 'Do the Throne' });
  });
  it('never earns a permanent badge', () => {
    const t = arm({ left: { ankleCm: 12, calfReps: 40, hopCm: 215 }, right: { ankleCm: 9, calfReps: 40, hopCm: 185 } });
    const badges = computeBadges({ athlete: kit, perfs: [t], lookup, config: cfg, asOf: AS_OF, streak: { currentStreak: 0, bestStreak: 0, weeks: [], holidayBonusFlames: 0 } as never, surges: [], courseRecords: [], achievements: [] });
    expect(badges.map((b) => b.key)).toEqual(['arm-ankle', 'arm-calf']);
  });
  it('can be switched off in config', () => {
    const off = withDefaults({ ...cfg, arm: { ...cfg.arm, interim: { ...cfg.arm.interim, enabled: false } } });
    expect(armLevelsFromTest({ left: { hopCm: 215 }, right: { hopCm: 185 } }, off).control).toBeUndefined();
  });
});

describe('locked ARM names the plate', () => {
  it('missing calf', () => {
    expect(rate([arm({ left: { ankleCm: 10, throne: 2 }, right: { ankleCm: 10, throne: 3 } })]).stats.ARM).toMatchObject({ locked: true, unlockHint: 'Test calf' });
  });
  it('calf below level 1', () => {
    const r = rate([arm({ left: { ankleCm: 7, calfReps: 11, hopCm: 150 }, right: { ankleCm: 12, calfReps: 12, hopCm: 158 } })]);
    expect(r.arm).toMatchObject({ ankle: 1, calf: 0, control: 2, missing: ['calf'] });
    expect(r.stats.ARM).toMatchObject({ locked: true, unlockHint: 'Calf below L1' });
    expect(r.stats.ARM.unlockHelp).toContain('calf (15 heel raises)');
  });
  it('the Throne not done yet', () => {
    expect(rate([arm({ ankleCm: 10, calfReps: 20 })]).stats.ARM).toMatchObject({ locked: true, unlockHint: 'Do the Throne' });
  });
  it('a calf missing and control below T1', () => {
    expect(rate([arm({ ankleCm: 10, throne: 0 })]).stats.ARM.unlockHint).toBe('Missing calf');
  });
});

describe('pistol mastery', () => {
  it('a full pistol on both legs earns "No Throne", and never changes ARM', () => {
    const t = arm({ left: { ankleCm: 10, calfReps: 25, throne: 5, pistol: true }, right: { ankleCm: 10, calfReps: 25, throne: 5, pistol: true } });
    const badges = computeBadges({ athlete: kit, perfs: [t], lookup, config: cfg, asOf: AS_OF, streak: { currentStreak: 0, bestStreak: 0, weeks: [], holidayBonusFlames: 0 } as never, surges: [], courseRecords: [], achievements: [] });
    expect(badges.find((b) => b.key === 'arm-pistol')).toMatchObject({ label: 'No Throne (pistol)' });
    const without = arm({ left: { ankleCm: 10, calfReps: 25, throne: 5 }, right: { ankleCm: 10, calfReps: 25, throne: 5 } });
    expect(rate([t]).stats.ARM.value).toBe(rate([without]).stats.ARM.value);
  });
});

describe('earlier config versions reproduce earlier ratings', () => {
  const old = { ankleCm: 11, calfReps: 18, storkSec: 22 };
  it('a stored version from before Season 0 reads as the stork rules', () => {
    const stored = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as Config;
    delete (stored.arm as Partial<Config['arm']>).plate3;
    stored.arm.calfReps = [10, 15, 20, 25, 30];
    const v = withDefaults(stored);
    expect(v.arm.plate3).toBe('balance');
    expect(rate([arm(old)], v).stats.ARM.value).toBe(65); // L3 + L2 + L3, as before
  });
  it('the same record under Season 0: calf 18 drops from L2 to L1, and the Throne is needed', () => {
    expect(rate([arm(old)]).arm).toMatchObject({ ankle: 3, calf: 1, control: undefined });
  });
  it('preArmS0Rules gives the old thresholds', () => {
    const p = preArmS0Rules(DEFAULT_CONFIG);
    expect(p.arm).toMatchObject({ calfReps: [10, 15, 20, 25, 30], plate3: 'balance' });
    expect(armLevelsFromTest({ storkSec: 30, hopStickBothLegs: true }, p).control).toBe(5);
  });
});

describe('armS0Migration', () => {
  const stored = (): Config => {
    const c = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as Config;
    delete (c.arm as Partial<Config['arm']>).plate3;
    c.arm.calfReps = [10, 15, 20, 25, 30];
    return c;
  };
  it('adds one version with the Season 0 rules, once', () => {
    const v1 = stored();
    const v2 = armS0Migration([v1], '2026-11-19T00:00:00.000Z')!;
    expect(v2).toMatchObject({ version: 2, migration: ARM_S0_MIGRATION });
    expect(v2.arm).toMatchObject({ calfReps: [15, 20, 25, 30, 35], plate3: 'control', calfRepCap: 40, ankleCm: [5, 8, 10, 12, 14] });
    expect(currentConfig([v1, v2]).arm.plate3).toBe('control');
    expect(armS0Migration([v1, v2], '2026-11-20T00:00:00.000Z')).toBeUndefined();
  });
  it('does nothing for a store that started with the Season 0 rules', () => {
    expect(armS0Migration([DEFAULT_CONFIG], '2026-11-19T00:00:00.000Z')).toBeUndefined();
  });
  it('the old version keeps its thresholds after the migration', () => {
    const v1 = stored();
    expect(withDefaults(v1).arm).toMatchObject({ calfReps: [10, 15, 20, 25, 30], plate3: 'balance' });
  });
});

describe('records and wording', () => {
  it('stamps the protocol and the seat heights on a new Throne record', () => {
    expect(stampArm({ throne: 2 }, cfg)).toEqual({ throne: 2, protocol: 'ARM-S0-v2', throneSeatsCm: [61, 51, 42, 30.5, 19.5] });
    expect(stampArm({ ankleCm: 10 }, cfg)).toEqual({ ankleCm: 10, protocol: 'ARM-S0-v2' });
    expect(stampArm({ ankleCm: 10 }, preArmS0Rules(cfg))).toEqual({ ankleCm: 10 });
  });
  it('summarises a test leg by leg', () => {
    expect(armSummary({ left: { ankleCm: 12, calfReps: 40, hopCm: 215 }, right: { ankleCm: 9, calfReps: 40, hopCm: 185 } })).toBe('ankle 12/9 cm · calf 40/40 · hop 215/185 cm');
  });
  it('"Why?" shows both legs, the cap and the interim rule', () => {
    const s = emptySnapshot();
    s.configs = [cfg];
    s.athletes = [kit];
    s.performances = [arm({ left: { ankleCm: 12, calfReps: 50, hopCm: 215 }, right: { ankleCm: 9, calfReps: 90, hopCm: 185 } })];
    const derived = deriveAll(s, AS_OF);
    const e = explainStat(derived.athletes.get('a-kit')!, 'ARM', derived.config, derived.lookup);
    const t = e.paragraphs.join(' ');
    expect(t).toContain('ankle level 2 (left 12, right 9 → weaker 9 cm');
    expect(t).toContain('counted as 40 (the Wall stops at 40)');
    expect(t).toContain('interim level 2 from the hop');
    expect(t).not.toMatch(/undefined|NaN/);
  });
});

describe('the Armour guide', () => {
  it('the lookup strip matches the sheet: 3→40 … 15→99', async () => {
    const { armHowWorkedOut } = await import('./armGuide');
    const strip = armHowWorkedOut(cfg).lookup.map((x) => `${x.sum}→${x.arm}`).join(' · ');
    expect(strip).toBe('3→40 · 4→45 · 5→50 · 6→55 · 7→60 · 8→65 · 9→70 · 10→74 · 11→79 · 12→84 · 13→89 · 14→94 · 15→99');
  });
  it('advice puts the weakest plate first and names the next seat', async () => {
    const { plateAdvice } = await import('./armGuide');
    const a = plateAdvice({ ankle: 2, calf: 1, control: 2, controlInterim: true, missing: [] }, cfg);
    expect(a.map((x) => x.domain)).toEqual(['calf', 'ankle', 'control']);
    expect(a[0].next).toBe('Next: 20 reps (level 2)');
    expect(a[2]).toMatchObject({ interim: true, next: 'Next: T3 · 42 cm' });
  });
});
