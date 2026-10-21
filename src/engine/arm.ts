// ARM (Armour) domain levels, spec 3.9. Shared by the ARM stat and the ARM level-up badges.
import type { ArmMeasures } from '../types';
import type { Config } from './config';

export type ArmDomain = 'ankle' | 'calf' | 'balance';
export const ARM_DOMAINS: ArmDomain[] = ['ankle', 'calf', 'balance'];

function levelFrom(value: number | undefined, thresholds: readonly number[]): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  let level = 0;
  thresholds.forEach((t, i) => {
    if (value >= t) level = i + 1;
  });
  return level;
}

/**
 * Level (0–5) for each domain from one test. Undefined = not measured in this test.
 * Level 0 = measured but below level 1.
 * Balance: L1–L4 from eyes-closed stork seconds; L5 = L4 and hop-and-stick passed on both legs.
 */
export function armLevelsFromTest(arm: ArmMeasures | undefined, config: Config): Partial<Record<ArmDomain, number>> {
  if (!arm) return {};
  const out: Partial<Record<ArmDomain, number>> = {};
  const ankle = levelFrom(arm.ankleCm, config.arm.ankleCm);
  if (ankle != null) out.ankle = ankle;
  const calf = levelFrom(arm.calfReps, config.arm.calfReps);
  if (calf != null) out.calf = calf;
  let balance = levelFrom(arm.storkSec, config.arm.storkSec);
  if (balance != null) {
    if (balance === 4 && arm.hopStickBothLegs === true) balance = 5;
    out.balance = balance;
  }
  return out;
}

/** ARM = round(40 + (sumOfLevels − 3) × 59 / 12), once all three domains have a level. */
export function armScore(levels: Record<ArmDomain, number>): number {
  const sum = levels.ankle + levels.calf + levels.balance;
  return Math.round(40 + ((sum - 3) * 59) / 12);
}
