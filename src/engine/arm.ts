// ARM (Armour) plate levels, spec 3.9, as changed for Season 0 (Nov 2026). Shared by the ARM stat, the ARM
// badges, the explanations, the Armoury spread and the entry grid.
//
// Three plates, each level 0–5 on the WEAKER side:
//   ANKLE   — the Lunge (knee-to-wall, cm)
//   CALF    — the Wall (single-leg heel raises at 60 bpm, reps, counted up to config.arm.calfRepCap)
//   CONTROL — the Throne (one-leg squat to a rigid seat; the level is the lowest seat passed, 0–5)
// Config versions from before Season 0 score the third plate as BALANCE from the eyes-closed stork instead
// (config.arm.plate3 = 'balance'), so old ratings are reproduced exactly.
import type { ArmLeg, ArmMeasures } from '../types';
import type { Config } from './config';

export type ArmDomain = 'ankle' | 'calf' | 'control';
export const ARM_DOMAINS: ArmDomain[] = ['ankle', 'calf', 'control'];

/** The measures that can be recorded per leg. */
export type ArmMeasure = 'ankleCm' | 'calfReps' | 'throne' | 'storkSec' | 'hopCm';

/** Plate names for the config in force ('balance' before Season 0). */
export function plateName(d: ArmDomain, config: Config): string {
  if (d === 'ankle') return 'ankle';
  if (d === 'calf') return 'calf';
  return config.arm.plate3 === 'balance' ? 'balance' : 'control';
}

/** One-letter plate tags for the card: A (ankle), C (calf), T (the Throne) or B (balance, before Season 0). */
export function plateTag(d: ArmDomain, config: Config): string {
  if (d === 'ankle') return 'A';
  if (d === 'calf') return 'C';
  return config.arm.plate3 === 'balance' ? 'B' : 'T';
}

function levelFrom(value: number | undefined, thresholds: readonly number[]): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  let level = 0;
  thresholds.forEach((t, i) => {
    if (value >= t) level = i + 1;
  });
  return level;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export interface WeakerSide {
  /** The value that counts (the lower of the two legs, or the single value). */
  value?: number;
  left?: number;
  right?: number;
  /** Which leg is weaker, when both were measured and differ. */
  weaker?: 'L' | 'R';
  /** Only one leg was measured: the measure does not count until both are (the weaker side is unknown). */
  oneLegOnly?: boolean;
}

/** The weaker side of one measure: the lower leg when both are recorded, else the single (weaker-side) value. */
export function weakerSide(arm: ArmMeasures | undefined, m: ArmMeasure): WeakerSide {
  if (!arm) return {};
  // Hop lines stored by the 18 Nov 2026 build (hopLineCm) read as hop distances.
  const l = m === 'hopCm' ? (arm.left?.hopCm ?? arm.left?.hopLineCm) : arm.left?.[m];
  const r = m === 'hopCm' ? (arm.right?.hopCm ?? arm.right?.hopLineCm) : arm.right?.[m];
  if (finite(l) && finite(r)) return { value: Math.min(l, r), left: l, right: r, weaker: l < r ? 'L' : r < l ? 'R' : undefined };
  const single = arm[m];
  if (finite(single)) return { value: single };
  if (finite(l)) return { left: l, oneLegOnly: true };
  if (finite(r)) return { right: r, oneLegOnly: true };
  return {};
}

export interface ArmTestDetail {
  /** Level per plate (undefined = not measured in this test; 0 = measured, below level 1). */
  levels: Partial<Record<ArmDomain, number>>;
  ankle: WeakerSide;
  calf: WeakerSide & { counted?: number; capped?: boolean };
  /** The Throne (or the stork, under the 'balance' rules). */
  control: WeakerSide;
  /** The CONTROL level is the interim level from the hop (no Throne result). */
  interim?: boolean;
  hop: WeakerSide;
  /** Both legs passed a full pistol squat (the "No Throne" badge). */
  pistol: boolean;
}

/** Both legs' hops at or past the interim line. */
function hopsPass(arm: ArmMeasures, cm: number): boolean {
  const h = weakerSide(arm, 'hopCm');
  return h.left != null && h.right != null && h.left >= cm && h.right >= cm;
}

/**
 * Everything the engine reads from one test: the weaker side of each measure, the level of each plate, and
 * whether the CONTROL level is an interim one. `opts.interim: false` ignores the interim rule (used when a real
 * Throne result exists in the ARM window, which always replaces it).
 */
export function armTestDetail(arm: ArmMeasures | undefined, config: Config, opts: { interim?: boolean } = {}): ArmTestDetail {
  const a = config.arm;
  const out: ArmTestDetail = { levels: {}, ankle: weakerSide(arm, 'ankleCm'), calf: weakerSide(arm, 'calfReps'), control: {}, hop: weakerSide(arm, 'hopCm'), pistol: !!(arm?.left?.pistol && arm?.right?.pistol) };
  if (!arm) return out;
  const ankle = levelFrom(out.ankle.value, a.ankleCm);
  if (ankle != null) out.levels.ankle = ankle;
  if (out.calf.value != null) {
    const cap = finite(a.calfRepCap) && a.calfRepCap > 0 ? a.calfRepCap : Infinity;
    out.calf.counted = Math.min(Math.floor(out.calf.value), cap);
    out.calf.capped = out.calf.value > cap;
    out.levels.calf = levelFrom(out.calf.counted, a.calfReps);
  }
  if (a.plate3 === 'balance') {
    out.control = weakerSide(arm, 'storkSec');
    let balance = levelFrom(out.control.value, a.storkSec);
    if (balance != null) {
      // Level 5 = level 4 + hop: per-leg hop lines past the gate on both legs (18 Nov 2026 build), else hop-and-stick yes.
      const perLeg = out.hop.left != null || out.hop.right != null;
      const hop = perLeg ? hopsPass(arm, finite(a.hopGateCm) ? a.hopGateCm : 120) : arm.hopStickBothLegs === true;
      if (balance === 4 && hop) balance = 5;
      out.levels.control = balance;
    }
    return out;
  }
  out.control = weakerSide(arm, 'throne');
  if (out.control.value != null) {
    out.levels.control = Math.max(0, Math.min(5, Math.floor(out.control.value)));
  } else if (opts.interim !== false && a.interim.enabled && hopsPass(arm, a.interim.hopCm)) {
    out.levels.control = Math.max(0, Math.min(5, a.interim.level));
    out.interim = true;
  }
  return out;
}

/**
 * Level (0–5) for each plate from one test. Undefined = not measured in this test; 0 = measured but below level 1.
 * See armTestDetail for the rules.
 */
export function armLevelsFromTest(arm: ArmMeasures | undefined, config: Config, opts: { interim?: boolean } = {}): Partial<Record<ArmDomain, number>> {
  return armTestDetail(arm, config, opts).levels;
}

/** True when the test has a real Throne result (either a weaker-leg value or both legs). */
export function hasThrone(arm: ArmMeasures | undefined): boolean {
  return weakerSide(arm, 'throne').value != null;
}

/** ARM = round(40 + (sumOfLevels − 3) × 59 / 12), once all three plates have a level. */
export function armScore(levels: Record<ArmDomain, number>): number {
  const sum = levels.ankle + levels.calf + levels.control;
  return Math.round(40 + ((sum - 3) * 59) / 12);
}

/** What the next level of a plate needs ('20 reps', 'T3 · 42 cm'), or undefined at level 5. */
export function nextLevelTarget(d: ArmDomain, level: number | undefined, config: Config): string | undefined {
  const l = level ?? 0;
  if (l >= 5) return undefined;
  const a = config.arm;
  if (d === 'ankle') return `${a.ankleCm[l]} cm`;
  if (d === 'calf') return `${a.calfReps[l]} reps`;
  if (a.plate3 === 'balance') return l < 4 ? `${a.storkSec[l]} s` : `${a.storkSec[3]} s + hop-and-stick`;
  return throneLabel(l + 1, config);
}

/** 'T2 · 51 cm' */
export function throneLabel(level: number, config: Config, seats: readonly number[] = config.arm.throneSeatsCm): string {
  if (level < 1) return 'below T1';
  return `T${level} · ${seats[level - 1]} cm`;
}

/** 'A2 · C5 · T2' (plates with no level yet show '–'). */
export function plateLine(levels: Partial<Record<ArmDomain, number>>, config: Config): string {
  return ARM_DOMAINS.map((d) => `${plateTag(d, config)}${levels[d] ?? '–'}`).join(' · ');
}

/** Stamp a new ARM record with the protocol and seat heights in force (only Season 0 configs). */
export function stampArm(arm: ArmMeasures, config: Config): ArmMeasures {
  if (config.arm.plate3 !== 'control') return arm;
  const out: ArmMeasures = { ...arm, protocol: arm.protocol ?? config.arm.protocol };
  if (hasThrone(arm) && !arm.throneSeatsCm) out.throneSeatsCm = [...config.arm.throneSeatsCm];
  return out;
}

/** Plain-language summary of one test, e.g. 'ankle 12/9 cm · calf 40/40 · Throne 3/2 · hop 215/185 cm'. */
export function armSummary(arm: ArmMeasures | undefined): string {
  if (!arm) return '';
  const lr = (m: ArmMeasure): string | undefined => {
    const l = arm.left?.[m];
    const r = arm.right?.[m];
    if (finite(l) || finite(r)) return `${finite(l) ? l : '–'}/${finite(r) ? r : '–'}`;
    const s = arm[m];
    return finite(s) ? String(s) : undefined;
  };
  const parts: string[] = [];
  const add = (m: ArmMeasure, label: string, unit = '') => {
    const v = lr(m);
    if (v != null) parts.push(`${label} ${v}${unit}`);
  };
  add('ankleCm', 'ankle', ' cm');
  add('calfReps', 'calf');
  add('throne', 'Throne');
  add('storkSec', 'stork', ' s');
  add('hopCm', 'hop', ' cm');
  if (arm.hopStickBothLegs != null) parts.push(`hop ${arm.hopStickBothLegs ? '✓' : '✗'}`);
  if (arm.left?.pistol || arm.right?.pistol) parts.push(`pistol ${arm.left?.pistol ? '✓' : '✗'}/${arm.right?.pistol ? '✓' : '✗'}`);
  return parts.join(' · ');
}

export type { ArmLeg };

/** How many pupils sit at each level of one plate (Settings → Scoring → ARM spread, before and after a change). */
export interface ArmPlateSpread {
  below: number;
  /** Index 0 = L1 … index 4 = L5. */
  levels: [number, number, number, number, number];
  untested: number;
  /** Pupils with a result on this plate. */
  tested: number;
}

export function armSpread(all: Partial<Record<ArmDomain, number>>[]): Record<ArmDomain, ArmPlateSpread> {
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

/** More than `share` of the tested pupils at L5 or below L1: the thresholds may need moving. */
export function armSpreadSkewed(s: ArmPlateSpread, share = 1 / 3): boolean {
  return s.tested > 0 && (s.below > s.tested * share || s.levels[4] > s.tested * share);
}
