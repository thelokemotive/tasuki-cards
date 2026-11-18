// ARM (Armour) plate levels: THE ARMOURY. Shared by the ARM stat, the ARM level-up badges and the Armoury page.
//
// Three plates, one test each (Nov 2026 battery):
//   ankle   = The Lunge   (knee-to-wall, cm)
//   calf    = The Wall    (single-leg heel raises at 60 bpm, reps)
//   balance = The Landing (single-leg hop-and-stick ladder, furthest rung held, cm). Shown to pupils as "Landing".
// Each leg is recorded; the WEAKER leg sets the level. Raw numbers are kept, so new thresholds re-derive every level.
import type { ArmMeasures } from '../types';
import type { Config } from './config';

export type ArmDomain = 'ankle' | 'calf' | 'balance';
export const ARM_DOMAINS: ArmDomain[] = ['ankle', 'calf', 'balance'];
/** What pupils see: the balance plate is tested by landing, so it is called Landing. */
export const ARM_PLATE_NAME: Record<ArmDomain, string> = { ankle: 'Ankle', calf: 'Calf', balance: 'Landing' };
export const ARM_TEST_NAME: Record<ArmDomain, string> = { ankle: 'The Lunge', calf: 'The Wall', balance: 'The Landing' };
export const ARM_UNIT: Record<ArmDomain, string> = { ankle: 'cm', calf: 'reps', balance: 'cm' };

export function levelFrom(value: number | undefined, thresholds: readonly number[]): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  let level = 0;
  thresholds.forEach((t, i) => {
    if (value >= t) level = i + 1;
  });
  return level;
}

/** The weaker of two legs, or the single value when only the weaker side was typed. One leg alone counts for nothing. */
function weaker(single: number | undefined, l: number | undefined, r: number | undefined): number | undefined {
  const ok = (v: number | undefined): v is number => v != null && Number.isFinite(v);
  if (ok(l) && ok(r)) return Math.min(l, r);
  if (ok(l) || ok(r)) return undefined;
  return ok(single) ? single : undefined;
}

export interface ArmWeaker {
  ankle?: number;
  calf?: number;
  hop?: number;
  /** Legacy stork seconds (only when the test had no hop ladder). */
  stork?: number;
  /** Which leg was weaker per plate, when both legs were recorded and differ. */
  weakerLeg: Partial<Record<ArmDomain, 'L' | 'R'>>;
}

/** Weaker-side value per plate from one test. */
export function armWeaker(arm: ArmMeasures | undefined): ArmWeaker {
  if (!arm) return { weakerLeg: {} };
  const side = (l?: number, r?: number): 'L' | 'R' | undefined => (l != null && r != null && l !== r ? (l < r ? 'L' : 'R') : undefined);
  const weakerLeg: ArmWeaker['weakerLeg'] = {};
  const a = side(arm.ankleCmL, arm.ankleCmR);
  if (a) weakerLeg.ankle = a;
  const c = side(arm.calfRepsL, arm.calfRepsR);
  if (c) weakerLeg.calf = c;
  const h = side(arm.hopCmL, arm.hopCmR);
  if (h) weakerLeg.balance = h;
  return {
    ankle: weaker(arm.ankleCm, arm.ankleCmL, arm.ankleCmR),
    calf: weaker(arm.calfReps, arm.calfRepsL, arm.calfRepsR),
    hop: weaker(arm.hopCm, arm.hopCmL, arm.hopCmR),
    stork: arm.storkSec,
    weakerLeg,
  };
}

/** Level (0–5) for one plate from a weaker-side value. */
export function plateLevel(domain: ArmDomain, value: number | undefined, config: Config): number | undefined {
  const a = config.arm;
  if (domain === 'ankle') return levelFrom(value, a.ankleCm);
  if (domain === 'calf') return levelFrom(value, a.calfReps);
  return levelFrom(value, a.hopCm);
}

/**
 * Level (0–5) for each plate from one test. Undefined = not measured in this test (or only one leg).
 * Level 0 = measured but below level 1.
 * Landing: from the hop-and-stick ladder. A legacy test with only a stork time keeps the old rule
 * (L1–L4 from eyes-closed seconds; L5 = L4 and hop-and-stick passed on both legs).
 */
export function armLevelsFromTest(arm: ArmMeasures | undefined, config: Config): Partial<Record<ArmDomain, number>> {
  if (!arm) return {};
  const w = armWeaker(arm);
  const out: Partial<Record<ArmDomain, number>> = {};
  const ankle = plateLevel('ankle', w.ankle, config);
  if (ankle != null) out.ankle = ankle;
  const calf = plateLevel('calf', w.calf, config);
  if (calf != null) out.calf = calf;
  if (w.hop != null) {
    out.balance = plateLevel('balance', w.hop, config);
  } else {
    let balance = levelFrom(w.stork, config.arm.storkSec);
    if (balance != null) {
      if (balance === 4 && arm.hopStickBothLegs === true) balance = 5;
      out.balance = balance;
    }
  }
  return out;
}

/** ARM = round(40 + (sumOfLevels − 3) × 59 / 12), once all three plates have a level. */
export function armScore(levels: Record<ArmDomain, number>): number {
  const sum = levels.ankle + levels.calf + levels.balance;
  return Math.round(40 + ((sum - 3) * 59) / 12);
}

/** ARM for each possible sum of levels (3–15): the lookup strip on the posters. */
export function armLookup(): { sum: number; arm: number }[] {
  const out: { sum: number; arm: number }[] = [];
  for (let sum = 3; sum <= 15; sum++) out.push({ sum, arm: Math.round(40 + ((sum - 3) * 59) / 12) });
  return out;
}

/** Short text of one test, per leg where recorded: "Lunge 9.5/11 cm · Wall 24/27 · Landing 95/110 cm". */
export function armMeasuresText(a: ArmMeasures | undefined, sep = ' · '): string {
  if (!a) return '';
  const pair = (s: number | undefined, l: number | undefined, r: number | undefined, unit: string) =>
    l != null && r != null ? `L${l} R${r}${unit}` : l != null ? `L${l}${unit} (R —)` : r != null ? `R${r}${unit} (L —)` : s != null ? `${s}${unit}` : '';
  const parts = [
    ['Lunge', pair(a.ankleCm, a.ankleCmL, a.ankleCmR, ' cm')],
    ['Wall', pair(a.calfReps, a.calfRepsL, a.calfRepsR, '')],
    ['Landing', pair(a.hopCm, a.hopCmL, a.hopCmR, ' cm')],
    ['Stork', a.storkSec != null ? `${a.storkSec} s` : ''],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `${k} ${v}`);
  if (a.hopStickBothLegs != null) parts.push(`hop gate ${a.hopStickBothLegs ? '✓' : '✗'}`);
  return parts.join(sep);
}
