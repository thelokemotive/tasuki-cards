// Age-graded standard times (spec 3.4).
// Source: Alan Jones 2025 road standards (public domain), converted by scripts/convert-age-tables.mjs.
import type { Sex } from '../types';
import type { Config } from './config';
import tables from './data/ageGradeRoad2025.json';

interface SexTable {
  distancesKm: number[];
  minAge: number;
  maxAge: number;
  /** standardsSec[age - minAge][distanceIndex] */
  standardsSec: number[][];
}

const ROAD: Record<Sex, SexTable> = { M: tables.M, F: tables.F };

export const AGE_GRADE_SOURCE = {
  source: tables.source,
  commit: tables.commit,
  commitDate: tables.commitDate,
  files: tables.files,
  convertedAt: tables.convertedAt,
};

/** True when ratings computed with this config rest on the provisional fallback table. */
export function isAgeGradeProvisional(config: Config): boolean {
  return config.ageGrade.table === 'fallback_provisional';
}

/**
 * Standard time at distance d along one row of the table: log(time) is interpolated against
 * log(distance). Below the shortest distance, extrapolate along the slope of the two shortest;
 * above the longest, along the slope of the two longest.
 */
function alongDistance(row: number[], distances: number[], d: number): number {
  const n = distances.length;
  let i = 0;
  if (d >= distances[n - 1]) i = n - 2;
  else if (d > distances[0]) {
    while (i < n - 2 && d >= distances[i + 1]) i++;
  }
  const x0 = Math.log(distances[i]);
  const x1 = Math.log(distances[i + 1]);
  const y0 = Math.log(row[i]);
  const y1 = Math.log(row[i + 1]);
  const t = (Math.log(d) - x0) / (x1 - x0);
  return Math.exp(y0 + t * (y1 - y0));
}

function tableStandard(age: number, sex: Sex, d: number): number {
  const t = ROAD[sex];
  const a = Math.min(Math.max(age, t.minAge), t.maxAge);
  const lo = Math.floor(a);
  const hi = Math.min(lo + 1, t.maxAge);
  const sLo = alongDistance(t.standardsSec[lo - t.minAge], t.distancesKm, d);
  if (hi === lo) return sLo;
  const sHi = alongDistance(t.standardsSec[hi - t.minAge], t.distancesKm, d);
  return sLo + (a - lo) * (sHi - sLo);
}

/** Linear interpolation over a sparse {age: value} map, clamped to its end keys. */
export function interpolateKeyed(map: Record<number, number>, x: number): number {
  const keys = Object.keys(map).map(Number).sort((p, q) => p - q);
  if (x <= keys[0]) return map[keys[0]];
  if (x >= keys[keys.length - 1]) return map[keys[keys.length - 1]];
  for (let i = 0; i < keys.length - 1; i++) {
    const k0 = keys[i];
    const k1 = keys[i + 1];
    if (x >= k0 && x <= k1) return map[k0] + ((x - k0) / (k1 - k0)) * (map[k1] - map[k0]);
  }
  return map[keys[keys.length - 1]];
}

function fallbackStandard(age: number, sex: Sex, d: number, config: Config): number {
  const fb = config.ageGrade.fallback;
  const exp = d <= 5 ? fb.expShort : fb.expLong;
  const open = fb.open5kSec[sex] * Math.pow(d / 5, exp);
  return open / interpolateKeyed(fb.ageFactors[sex], age);
}

/** Std(age, sex, D): the age- and sex-specific standard time in seconds at distance D (km). */
export function standardTime(age: number, sex: Sex, dKm: number, config: Config): number {
  if (!(dKm > 0 && Number.isFinite(dKm))) throw new Error(`standardTime: distance must be a positive, finite number (got ${dKm})`);
  if (!Number.isFinite(age)) throw new Error(`standardTime: age must be a finite number (got ${age})`);
  if (sex !== 'M' && sex !== 'F') throw new Error(`standardTime: sex must be 'M' or 'F' (got ${String(sex)})`);
  return config.ageGrade.table === 'fallback_provisional' ? fallbackStandard(age, sex, dKm, config) : tableStandard(age, sex, dKm);
}

/** AG% as a fraction (0.80 = 80%): Std(age, sex, D_eff) / timeSec. */
export function ageGrade(age: number, sex: Sex, dEffKm: number, timeSec: number, config: Config): number {
  return standardTime(age, sex, dEffKm, config) / timeSec;
}
