// Next-5K prediction and targets. Every verified timed result (races, relay legs, parkruns, time trials, the
// Circuit) is converted to a 5 km equivalent with a youth-adjusted Riegel exponent, brought forward to today
// for growth, and combined by inverse-variance weighting into a best estimate with a confidence interval.
// Targets add one term (12–16 weeks) of expected improvement: natural maturation plus a training increment.
//
// Sources (see docs/research and DECISIONS.md): Riegel 1981 (power law); age- and distance-pair-adjusted
// exponents and termly training increments from the coach's 2026 research synthesis (Blythe & Király 2016;
// youth progression literature); course surface factors after Minetti 2002 and grade-adjusted-pace data.
// The constants are model assumptions, all in config.predict, and every step is shown in the explanation.
import type { Athlete, ISODate, Performance, Sex } from '../types';
import type { Config } from './config';
import { ageOnDate } from './age';
import { monthsBetween, daysBetween } from './dates';
import { formatTime } from './format';
import { counts, resolveContext, type Lookup, type PerfContext } from './perf';

export interface PredictConfig {
  enabled: boolean;
  /** Distance predicted (km). */
  targetKm: number;
  /** Riegel exponent b for a 3 km → 5 km projection, by age (school-club runner). */
  exponentByAge: Record<number, number>;
  /** Added to b when projecting from a shorter source distance (km → extra b); interpolated on log distance. */
  shortSourcePenalty: Record<number, number>;
  /** Results shorter than this (km of effort) are not used. */
  minSourceKm: number;
  /** Results older than this (months) are not used. */
  windowMonths: number;
  /** Uncertainty (SD of log time) of a projection, per unit of |ln(5 km ÷ source km)|. */
  sigmaPerLogDistance: number;
  /** Uncertainty by kind of result (SD of log time). */
  sigmaByKind: Record<string, number>;
  /** Extra uncertainty for an unofficial result (a time trial, a stopwatch relay). */
  sigmaUnofficial: number;
  /** Extra uncertainty per year between the result and today (growth and training since). */
  sigmaPerYear: number;
  /** A model-error floor added to the combined uncertainty. */
  sigmaFloor: number;
  /** Natural maturation: % faster per year, by age, for boys and girls (pure growth, no training). */
  maturationPctByAge: Record<Sex, Record<number, number>>;
  /** A projection this % slower than the fastest is treated as not a full effort (listed, not used). */
  notFullEffortPct: number;
  /** Confidence level of the interval (0.9 = 90%). */
  confidence: number;
  /** Training tier for targets: 'pe' (PE only), 'intro' (2 sessions/week), 'club' (3–4), 'academy' (5–6). */
  trainingTier: 'pe' | 'intro' | 'club' | 'academy';
  /** One term's training improvement in 5 km speed (%), realistic (median responder) and stretch (top fifth). */
  termTrainingPct: Record<'pe' | 'intro' | 'club' | 'academy', { realistic: number; stretch: number }>;
  /** A term as a fraction of a year (for the maturation part of a target). */
  termYears: number;
}

export const DEFAULT_PREDICT: PredictConfig = {
  enabled: true,
  targetKm: 5,
  exponentByAge: { 11: 1.115, 12: 1.11, 13: 1.1, 14: 1.09, 15: 1.08, 16: 1.073, 17: 1.068, 18: 1.063 },
  shortSourcePenalty: { 0.5: 0.04, 1: 0.025, 1.5: 0.015, 2: 0.008, 3: 0, 5: 0 },
  minSourceKm: 0.5,
  windowMonths: 18,
  sigmaPerLogDistance: 0.04,
  sigmaByKind: { race: 0.015, parkrun: 0.015, relay_leg: 0.02, circuit: 0.03, long_run: 0.06 },
  sigmaUnofficial: 0.01,
  sigmaPerYear: 0.03,
  sigmaFloor: 0.015,
  maturationPctByAge: {
    M: { 11: 3.6, 12: 3.8, 13: 2.9, 14: 1.8, 15: 1.2, 16: 0.7, 17: 0.4, 18: 0.2 },
    F: { 11: 2.1, 12: 1.2, 13: 0.3, 14: 0.0, 15: 0.2, 16: 0.3, 17: 0.2, 18: 0.1 },
  },
  notFullEffortPct: 12,
  confidence: 0.9,
  trainingTier: 'club',
  termTrainingPct: {
    pe: { realistic: 0.1, stretch: 0.5 },
    intro: { realistic: 0.6, stretch: 1.2 },
    club: { realistic: 1.2, stretch: 2.1 },
    academy: { realistic: 1.6, stretch: 2.7 },
  },
  termYears: 0.3,
};

const TIMED: Performance['kind'][] = ['race', 'relay_leg', 'parkrun', 'circuit', 'long_run'];

function clampAge(age: number): number {
  return Math.max(11, Math.min(18, Math.floor(age + 1e-9)));
}

function byKey(table: Record<number, number>, age: number): number {
  const a = clampAge(age);
  if (table[a] != null) return table[a];
  const keys = Object.keys(table).map(Number).sort((x, y) => x - y);
  return table[keys.reduce((b, k) => (k <= a ? k : b), keys[0])];
}

/** Interpolate the short-source penalty on log distance; 0 at or above the largest key. */
export function shortSourcePenalty(km: number, cfg: PredictConfig): number {
  const pts = Object.entries(cfg.shortSourcePenalty).map(([k, v]) => [Number(k), v] as const).sort((a, b) => a[0] - b[0]);
  if (km <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (km <= pts[i][0]) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const f = (Math.log(km) - Math.log(x0)) / (Math.log(x1) - Math.log(x0));
      return y0 + f * (y1 - y0);
    }
  }
  return 0;
}

/** The Riegel exponent for a runner of this age projecting from `km` to the target distance. */
export function exponentFor(age: number, km: number, cfg: PredictConfig): number {
  const base = byKey(cfg.exponentByAge, age);
  return km < cfg.targetKm ? base + shortSourcePenalty(km, cfg) : base;
}

/** % faster from natural growth between two ages (compounded year by year, pro rata). */
export function maturationBetween(sex: Sex, ageFrom: number, ageTo: number, cfg: PredictConfig): number {
  if (!(ageTo > ageFrom)) return 0;
  let f = 1;
  let a = ageFrom;
  while (a < ageTo - 1e-9) {
    const step = Math.min(ageTo, Math.floor(a) + 1) - a;
    f *= 1 + (byKey(cfg.maturationPctByAge[sex], a) / 100) * step;
    a += step;
  }
  return (f - 1) * 100;
}

export interface PredictionSource {
  perfId: string;
  date: ISODate;
  label: string;
  /** Effective distance (km): distance + climb ÷ 100, × terrain factor. */
  km: number;
  timeSec: number;
  age: number;
  exponent: number;
  /** 5 km time on the day of the result. */
  fiveKThen: number;
  /** % faster from growth since then. */
  growthPct: number;
  /** 5 km equivalent today. */
  fiveKNow: number;
  /** Uncertainty (SD of log time) and the resulting weight. */
  sigma: number;
  weight: number;
  used: boolean;
  /** Why not used, or the share of the estimate. */
  note: string;
}

export interface Prediction {
  athleteId: string;
  asOf: ISODate;
  targetKm: number;
  /** Best estimate of a full-effort 5 km today (seconds). */
  predictedSec: number;
  /** Confidence interval (seconds) at cfg.confidence. */
  lowSec: number;
  highSec: number;
  /** Half-width of the interval as a % of the estimate. */
  plusMinusPct: number;
  confidenceLabel: 'high' | 'medium' | 'low';
  /** Targets for the next 5 km (about one term ahead). */
  realisticSec: number;
  stretchSec: number;
  realisticPct: number;
  stretchPct: number;
  /** Fastest actual 5 km in the window, if any. */
  best5kSec?: number;
  /** 'pb' when the targets start from an actual 5 km faster than the prediction (never set a target slower than a PB). */
  targetBasis: 'prediction' | 'pb';
  sources: PredictionSource[];
}

/** z for a two-sided interval (0.8, 0.9, 0.95, 0.99; nearest). */
function zFor(conf: number): number {
  const t: [number, number][] = [[0.8, 1.2816], [0.9, 1.6449], [0.95, 1.96], [0.99, 2.5758]];
  return t.reduce((b, x) => (Math.abs(x[0] - conf) < Math.abs(b[0] - conf) ? x : b))[1];
}

function labelOf(ctx: PerfContext): string {
  const p = ctx.perf;
  const what = ctx.event?.name ?? ctx.course?.name ?? p.kind.replace('_', ' ');
  const leg = p.kind === 'relay_leg' && p.legNumber ? ` (leg ${p.legNumber})` : '';
  return `${what}${leg}`;
}

/** Predict a 5 km for one athlete from their verified timed results. Undefined with no usable result. */
export function predictFiveK(athlete: Athlete, perfs: Performance[], lookup: Lookup, config: Config, asOf: ISODate): Prediction | undefined {
  const cfg = (config as Config & { predict?: PredictConfig }).predict ?? DEFAULT_PREDICT;
  if (!cfg.enabled) return undefined;
  if (athlete.sex !== 'M' && athlete.sex !== 'F') return undefined;
  const ageNow = ageOnDate(athlete, asOf, config, asOf).age;
  const sources: PredictionSource[] = [];
  for (const p of perfs) {
    if (p.athleteId !== athlete.id || !counts(p) || !TIMED.includes(p.kind) || p.date > asOf || p.timeSec == null || !(p.timeSec > 0)) continue;
    if (monthsBetween(p.date, asOf) > cfg.windowMonths) continue;
    const ctx = resolveContext(p, lookup);
    if (ctx.dEff == null || ctx.dEff < cfg.minSourceKm) continue;
    const age = ageOnDate(athlete, p.date, config, asOf).age;
    if (!Number.isFinite(age)) continue;
    const km = ctx.dEff;
    const b = exponentFor(age, km, cfg);
    const fiveKThen = p.timeSec * Math.pow(cfg.targetKm / km, b);
    const growthPct = maturationBetween(athlete.sex, age, ageNow, cfg);
    const fiveKNow = fiveKThen / (1 + growthPct / 100);
    const years = Math.max(0, daysBetween(p.date, asOf) / 365.25);
    const official = ctx.event ? ctx.event.official !== false : true;
    const sigma = Math.sqrt(
      (cfg.sigmaPerLogDistance * Math.abs(Math.log(cfg.targetKm / km))) ** 2 + (cfg.sigmaByKind[p.kind] ?? 0.03) ** 2 + (official ? 0 : cfg.sigmaUnofficial) ** 2 + (cfg.sigmaPerYear * years) ** 2,
    );
    sources.push({ perfId: p.id, date: p.date, label: labelOf(ctx), km, timeSec: p.timeSec, age, exponent: b, fiveKThen, growthPct, fiveKNow, sigma, weight: 1 / sigma ** 2, used: true, note: '' });
  }
  if (!sources.length) return undefined;

  // Sub-maximal efforts (a jog, a walk) are common in school data: anything much slower than the fastest
  // projection is listed but not used.
  const fastest = Math.min(...sources.map((s) => s.fiveKNow));
  for (const s of sources) {
    if (s.fiveKNow > fastest * (1 + cfg.notFullEffortPct / 100)) {
      s.used = false;
      s.note = `${Math.round((s.fiveKNow / fastest - 1) * 100)}% slower than the best projection: probably not a full effort`;
    }
  }
  const used = sources.filter((s) => s.used);
  const W = used.reduce((a, s) => a + s.weight, 0);
  const mu = used.reduce((a, s) => a + s.weight * Math.log(s.fiveKNow), 0) / W;
  // If the results disagree more than their uncertainties suggest, widen the interval accordingly.
  const chi = used.length > 1 ? used.reduce((a, s) => a + s.weight * (Math.log(s.fiveKNow) - mu) ** 2, 0) / (used.length - 1) : 1;
  const sigma = Math.sqrt((1 / W) * Math.max(1, chi) + cfg.sigmaFloor ** 2);
  for (const s of used) s.note = `${Math.round((s.weight / W) * 100)}% of the estimate`;
  const z = zFor(cfg.confidence);
  const predictedSec = Math.exp(mu);
  const term = cfg.termTrainingPct[cfg.trainingTier];
  const mat = cfg.termYears * byKey(cfg.maturationPctByAge[athlete.sex], ageNow);
  const realisticPct = mat + term.realistic;
  const stretchPct = mat + term.stretch;
  const fives = sources.filter((s) => Math.abs(s.km - cfg.targetKm) < 0.05).map((s) => s.timeSec);
  const plusMinusPct = (Math.exp(z * sigma) - 1) * 100;
  const best5kSec = fives.length ? Math.min(...fives) : undefined;
  let realisticSec = predictedSec / (1 + realisticPct / 100);
  let stretchSec = predictedSec / (1 + stretchPct / 100);
  let targetBasis: Prediction['targetBasis'] = 'prediction';
  // A target slower than a 5 km the runner has actually run would demotivate: start from the PB instead.
  if (best5kSec != null && best5kSec < realisticSec) {
    realisticSec = best5kSec;
    stretchSec = best5kSec / (1 + stretchPct / 100);
    targetBasis = 'pb';
  }
  return {
    athleteId: athlete.id,
    asOf,
    targetKm: cfg.targetKm,
    predictedSec,
    lowSec: Math.exp(mu - z * sigma),
    highSec: Math.exp(mu + z * sigma),
    plusMinusPct,
    confidenceLabel: plusMinusPct <= 3 ? 'high' : plusMinusPct <= 6 ? 'medium' : 'low',
    realisticSec,
    stretchSec,
    realisticPct,
    stretchPct,
    best5kSec,
    targetBasis,
    sources: sources.sort((a, b) => (a.used === b.used ? b.weight - a.weight : a.used ? -1 : 1)),
  };
}

/** Plain-English working, for the athlete page, the student sheet and "Why this number?". */
export function explainPrediction(pr: Prediction, name: string, cfg: PredictConfig = DEFAULT_PREDICT): string[] {
  const conf = Math.round(cfg.confidence * 100);
  const used = pr.sources.filter((s) => s.used);
  const out = [
    `${name}'s predicted 5 km today is ${formatTime(pr.predictedSec)}, and we are ${conf}% confident the true value lies between ${formatTime(pr.lowSec)} and ${formatTime(pr.highSec)} (±${pr.plusMinusPct.toFixed(1)}%, ${pr.confidenceLabel} confidence).`,
    `It combines ${used.length} result${used.length === 1 ? '' : 's'}. Each one is converted to 5 km with Riegel's formula, T5 = T × (5 ÷ distance)^b. Young runners slow down more over longer races than adults, so b is ${used.map((s) => s.exponent.toFixed(3)).filter((x, i, a) => a.indexOf(x) === i).slice(0, 3).join(', ')} here instead of the adult 1.06, and higher still from very short races.`,
    `Hills and grass count as extra distance (effective distance), and older results are made a little faster for growth since then. Results from closer to 5 km, more official and more recent count for more; the list below shows how much each one counts.`,
    pr.targetBasis === 'pb'
      ? `Next 5 km targets: ${name} has already run ${formatTime(pr.best5kSec!)} for 5 km, faster than today's prediction, so the realistic target is to get back to that PB, and the stretch target beats it by ${pr.stretchPct.toFixed(1)}% (${formatTime(pr.stretchSec)}).`
      : `Next 5 km targets (about one term of training): realistic ${formatTime(pr.realisticSec)} (${pr.realisticPct.toFixed(1)}% faster: growth plus what a typical runner gains in a term), stretch ${formatTime(pr.stretchSec)} (${pr.stretchPct.toFixed(1)}% faster: what the most consistent fifth of runners gain).`,
  ];
  if (pr.sources.some((s) => !s.used)) out.push('Results much slower than the rest are treated as not a full effort and left out (a jog with a friend is not a race).');
  return out;
}
