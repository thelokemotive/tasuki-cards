// "Faster than X% of Japanese teenagers your age": the 5K prediction converted to the national fitness
// survey's endurance run (boys 1,500 m, girls 1,000 m) and compared with the national mean and spread for the
// runner's age and sex. Most school runners are fitter than most of the country; this lets every runner see it.
//
// Source: スポーツ庁「令和7年度 体力・運動能力調査」表1-2 持久走 (秒), 年齢別 平均値・標準偏差 (n ≈ 150–370 per
// age and sex). Times are compared as speeds (distance ÷ time), which are close to normally distributed
// (the coach's research synthesis, LMS with L = −1).
import type { Sex } from '../types';
import type { PredictConfig } from './predict';
import { exponentFor } from './predict';

export const PEER_SOURCE = 'スポーツ庁 令和7年度 体力・運動能力調査 (Japan Sports Agency national fitness survey 2025), table 1-2, endurance run';

/** Age → [mean seconds, SD seconds, sample size]. Boys 1,500 m; girls 1,000 m. */
export const JAPAN_ENDURANCE_R7: Record<Sex, { km: number; byAge: Record<number, [number, number, number]> }> = {
  M: { km: 1.5, byAge: { 12: [430.44, 60.51, 321], 13: [387.38, 53.96, 338], 14: [373.73, 52.51, 332], 15: [396.37, 54.32, 323], 16: [382.74, 57.9, 359], 17: [379.61, 56.54, 361], 18: [399.14, 57.14, 258], 19: [428.15, 65.08, 320] } },
  F: { km: 1.0, byAge: { 12: [311.62, 40.4, 317], 13: [299.17, 41.91, 337], 14: [299.16, 47.69, 314], 15: [315.98, 42.33, 322], 16: [310.34, 43.22, 359], 17: [317.6, 44.86, 367], 18: [324.48, 48.88, 153], 19: [326.18, 46.61, 146] } },
};

/** Standard normal CDF (Abramowitz–Stegun 7.1.26 via erf). */
export function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

export interface PeerComparison {
  /** Share of Japanese teenagers of this age and sex who are slower (1–99.9). */
  fasterThanPct: number;
  age: number;
  sex: Sex;
  /** The survey distance and the runner's equivalent time over it. */
  km: number;
  equivalentSec: number;
  nationalMeanSec: number;
  sample: number;
}

/** Compare a predicted 5 km with the national endurance-run results; undefined outside ages 12–19. */
export function peerComparison(predicted5kSec: number, age: number, sex: Sex, cfg: PredictConfig): PeerComparison | undefined {
  const a = Math.floor(age + 1e-9);
  const t = JAPAN_ENDURANCE_R7[sex];
  const row = t.byAge[a];
  if (!row || !(predicted5kSec > 0)) return undefined;
  const [mean, sd, n] = row;
  const equivalentSec = predicted5kSec * Math.pow(t.km / cfg.targetKm, exponentFor(age, t.km, cfg));
  // Compare speeds: v = d/T, mean speed ≈ d/mean, SD of speed ≈ d·SD/mean² (delta method).
  const v = t.km / equivalentSec;
  const vMean = t.km / mean;
  const vSd = (t.km * sd) / (mean * mean);
  const pct = normalCdf((v - vMean) / vSd) * 100;
  return { fasterThanPct: Math.min(99.9, Math.max(1, Math.round(pct * 10) / 10)), age: a, sex, km: t.km, equivalentSec, nationalMeanSec: mean, sample: n };
}
