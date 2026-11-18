// ARM (Armour) domain levels, spec 3.9. Shared by the ARM stat and the ARM level-up badges.
import type { ArmMeasures, ArmSide } from '../types';
import type { Config } from './config';
import type { ArmLevels } from './types';

export type ArmDomain = 'ankle' | 'calf' | 'balance';
export const ARM_DOMAINS: ArmDomain[] = ['ankle', 'calf', 'balance'];
/** Plate letters for the compact profile, e.g. 'A3 · C4 · B2'. */
export const ARM_PLATE_LETTER: Record<ArmDomain, string> = { ankle: 'A', calf: 'C', balance: 'B' };
/** The Hop & Freeze ladder (cm). */
export const HOP_LINES_CM = [80, 100, 120, 140] as const;

export type ArmNumeric = 'ankleCm' | 'calfReps' | 'storkSec';
const NUMERIC: ArmNumeric[] = ['ankleCm', 'calfReps', 'storkSec'];

/** The values ARM is scored on: the weaker side of each measure, worked out by the engine. */
export interface ArmEffective {
  ankleCm?: number;
  calfReps?: number;
  storkSec?: number;
  /** Hop & Freeze gate passed on both legs. Undefined = not tested (or only one leg recorded and it passed). */
  hopStickBothLegs?: boolean;
  /** Which leg was weaker for each per-leg measure ('=' when equal). Absent for old single-value records. */
  weakSide?: Partial<Record<ArmNumeric | 'hopLineCm', 'L' | 'R' | '='>>;
}

const finite = (v: number | undefined): v is number => v != null && Number.isFinite(v);

/** True when the record carries any per-leg value. */
export function armHasSides(arm: ArmMeasures | undefined): boolean {
  const has = (s: ArmSide | undefined) => !!s && Object.values(s).some((v) => finite(v as number | undefined));
  return !!arm && (has(arm.left) || has(arm.right));
}

function weaker(l: number | undefined, r: number | undefined): { v?: number; side?: 'L' | 'R' | '=' } {
  if (finite(l) && finite(r)) return { v: Math.min(l, r), side: l === r ? '=' : l < r ? 'L' : 'R' };
  if (finite(l)) return { v: l, side: 'L' };
  if (finite(r)) return { v: r, side: 'R' };
  return {};
}

/** The weaker-side value of one measure (no config needed): per-leg values first, else the old single value. */
export function armWeakerValue(arm: ArmMeasures | undefined, k: ArmNumeric): number | undefined {
  if (!arm) return undefined;
  return weaker(arm.left?.[k], arm.right?.[k]).v ?? (finite(arm[k]) ? arm[k] : undefined);
}

/**
 * The weaker side of every measure. Per-leg values win; a measure with no per-leg value falls back to the
 * old single value (which was always recorded as the weaker side). With only one leg recorded, that leg is
 * used. Hop: yes when the furthest line frozen is at least config.arm.hopGateCm on both legs; no when either
 * recorded leg is short of it; not tested when neither leg (nor the old yes/no) is recorded.
 */
export function armEffective(arm: ArmMeasures | undefined, config: Config): ArmEffective {
  if (!arm) return {};
  const out: ArmEffective = {};
  const sides: ArmEffective['weakSide'] = {};
  for (const k of NUMERIC) {
    const w = weaker(arm.left?.[k], arm.right?.[k]);
    if (w.v != null) {
      out[k] = w.v;
      sides[k] = w.side;
    } else if (finite(arm[k])) out[k] = arm[k];
  }
  const hop = weaker(arm.left?.hopLineCm, arm.right?.hopLineCm);
  const gate = config.arm.hopGateCm;
  if (hop.v != null) {
    sides.hopLineCm = hop.side;
    const both = finite(arm.left?.hopLineCm) && finite(arm.right?.hopLineCm);
    if (hop.v < gate) out.hopStickBothLegs = false;
    else if (both) out.hopStickBothLegs = true;
    else if (arm.hopStickBothLegs != null) out.hopStickBothLegs = arm.hopStickBothLegs;
  } else if (arm.hopStickBothLegs != null) out.hopStickBothLegs = arm.hopStickBothLegs;
  if (Object.keys(sides).length) out.weakSide = sides;
  return out;
}

function levelFrom(value: number | undefined, thresholds: readonly number[]): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  let level = 0;
  thresholds.forEach((t, i) => {
    if (value >= t) level = i + 1;
  });
  return level;
}

/**
 * Level (0–5) for each domain from one test, on the weaker side. Undefined = not measured in this test.
 * Level 0 = measured but below level 1.
 * Balance: L1–L4 from eyes-closed stork seconds; L5 = L4 and Hop & Freeze passed on both legs.
 */
export function armLevelsFromTest(arm: ArmMeasures | undefined, config: Config): Partial<Record<ArmDomain, number>> {
  if (!arm) return {};
  const e = armEffective(arm, config);
  const out: Partial<Record<ArmDomain, number>> = {};
  const ankle = levelFrom(e.ankleCm, config.arm.ankleCm);
  if (ankle != null) out.ankle = ankle;
  const calf = levelFrom(e.calfReps, config.arm.calfReps);
  if (calf != null) out.calf = calf;
  let balance = levelFrom(e.storkSec, config.arm.storkSec);
  if (balance != null) {
    if (balance === 4 && e.hopStickBothLegs === true) balance = 5;
    out.balance = balance;
  }
  return out;
}

/** ARM = round(40 + (sumOfLevels − 3) × 59 / 12), once all three domains have a level. */
export function armScore(levels: Record<ArmDomain, number>): number {
  const sum = levels.ankle + levels.calf + levels.balance;
  return Math.round(40 + ((sum - 3) * 59) / 12);
}

/** 'A3 · C4 · B2' (untested plates show '–'), so the ARM number never hides the profile. */
export function armPlates(levels: Pick<ArmLevels, ArmDomain> | Partial<Record<ArmDomain, number>>): string {
  return ARM_DOMAINS.map((d) => `${ARM_PLATE_LETTER[d]}${levels[d] ?? '–'}`).join(' · ');
}

/** One plate's spread: pupils at each level. below = tested but under L1; untested = no result in the window. */
export interface ArmPlateSpread {
  below: number;
  /** Index 0 = L1 … index 4 = L5. */
  levels: [number, number, number, number, number];
  untested: number;
  /** Pupils with a result on this plate. */
  tested: number;
}

/**
 * For the Season 0 threshold review: how many pupils sit at each level of each plate. A plate where more
 * than about a third of tested pupils are at L5 or below L1 needs its thresholds moved (once, in Settings).
 */
export function armSpread(all: Pick<ArmLevels, ArmDomain>[]): Record<ArmDomain, ArmPlateSpread> {
  const out = {} as Record<ArmDomain, ArmPlateSpread>;
  for (const d of ARM_DOMAINS) {
    const s: ArmPlateSpread = { below: 0, levels: [0, 0, 0, 0, 0], untested: 0, tested: 0 };
    for (const a of all) {
      const l = a[d];
      if (l == null) s.untested++;
      else {
        s.tested++;
        if (l < 1) s.below++;
        else s.levels[Math.min(5, l) - 1]++;
      }
    }
    out[d] = s;
  }
  return out;
}

/** True when more than `share` of tested pupils sit at L5 or below L1 on this plate. */
export function armSpreadSkewed(s: ArmPlateSpread, share = 1 / 3): boolean {
  return s.tested > 0 && (s.below > s.tested * share || s.levels[4] > s.tested * share);
}

/**
 * Short text of one test's raw results, left/right where recorded: 'ankle 9.5/11 cm · calf 22/25 · stork 6/9 s ·
 * hop 100/120'. Older single-value records read 'ankle 11 cm · calf 18 · stork 22 s · hop ✓'.
 */
export function armResultText(arm: ArmMeasures | undefined, sep = ' · '): string {
  if (!arm) return '';
  const pair = (k: keyof ArmSide, single?: number | boolean): string | undefined => {
    const l = arm.left?.[k];
    const r = arm.right?.[k];
    if (l != null || r != null) return `${l ?? '–'}/${r ?? '–'}`;
    if (single == null) return undefined;
    return typeof single === 'boolean' ? (single ? '✓' : '✗') : String(single);
  };
  const parts: string[] = [];
  const a = pair('ankleCm', arm.ankleCm);
  if (a) parts.push(`ankle ${a} cm`);
  const c = pair('calfReps', arm.calfReps);
  if (c) parts.push(`calf ${c}`);
  const s = pair('storkSec', arm.storkSec);
  if (s) parts.push(`stork ${s} s`);
  const h = pair('hopLineCm', arm.hopStickBothLegs);
  if (h) parts.push(`hop ${h}`);
  return parts.join(sep);
}
