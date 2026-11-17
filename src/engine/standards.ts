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

/** The road tables' shortest distance. */
export const MILE_KM = 1.609344;

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
 * log(distance). Below the shortest distance (only with ageGrade.subMile = 'extrapolate'; otherwise the
 * world-record curve below is used), extrapolate along the slope of the two shortest;
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

/**
 * World records on the track (seconds), 200 m to the mile: the shape of the speed–duration curve below the
 * road tables' shortest distance (1 mile). Short efforts draw on anaerobic energy, so pace rises much faster
 * below the mile than the mile–5 km slope suggests: extrapolating that slope made the 550 m standard 10–13%
 * too slow (more for younger runners), and every short time trial that much too good.
 * Men: 19.19, 43.03, 1:40.91, 2:11.96, 3:26.00, 3:43.13. Women: 21.34, 47.60, 1:53.28, 2:28.98, 3:48.68, 4:07.64.
 */
export const SUB_MILE_WR: Record<Sex, [km: number, sec: number][]> = {
  M: [[0.2, 19.19], [0.4, 43.03], [0.8, 100.91], [1, 131.96], [1.5, 206.0], [MILE_KM, 223.13]],
  F: [[0.2, 21.34], [0.4, 47.6], [0.8, 113.28], [1, 148.98], [1.5, 228.68], [MILE_KM, 247.64]],
};

/**
 * World-record time at d (km) as a fraction of the mile record: log time interpolated against log distance
 * between the records (below 200 m, along the 200–400 m slope). 1 at the mile.
 */
export function subMileRatio(sex: Sex, d: number): number {
  const pts = SUB_MILE_WR[sex];
  let i = 0;
  while (i < pts.length - 2 && d >= pts[i + 1][0]) i++;
  const [x0, y0] = pts[i];
  const [x1, y1] = pts[i + 1];
  const t = (Math.log(d) - Math.log(x0)) / (Math.log(x1) - Math.log(x0));
  return Math.exp(Math.log(y0) + t * (Math.log(y1) - Math.log(y0))) / pts[pts.length - 1][1];
}

function tableStandard(age: number, sex: Sex, d: number, subMile: boolean): number {
  // Below the mile: the age- and sex-specific mile standard, scaled along the world-record curve.
  if (subMile && d < MILE_KM) return tableStandard(age, sex, MILE_KM, false) * subMileRatio(sex, d);
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
  return config.ageGrade.table === 'fallback_provisional' ? fallbackStandard(age, sex, dKm, config) : tableStandard(age, sex, dKm, config.ageGrade.subMile !== 'extrapolate');
}

/** AG% as a fraction (0.80 = 80%): Std(age, sex, D_eff) / timeSec. */
export function ageGrade(age: number, sex: Sex, dEffKm: number, timeSec: number, config: Config): number {
  return standardTime(age, sex, dEffKm, config) / timeSec;
}
