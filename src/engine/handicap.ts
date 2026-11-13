// Circuit handicap start sheet (spec 3.14): slower runners start first so everyone finishes together.
import type { Performance } from '../types';
import type { Config } from './config';
import type { HandicapRow } from './types';
import type { Lookup } from './perf';
import { courseTimeOf } from './pbs';
import { exponentFor } from './predict';

/**
 * Start sheet for a run on `courseId`, in start order.
 * PB_i = the athlete's best counted raw time on that course (all-time, same rules as course PBs).
 * offset_i = slowestPB − PB_i, rounded to the nearest config.handicap.roundSec (halves round up).
 * Runners without a PB start with the first wave (offset 0).
 * Order: offset ascending; ties put runners without a PB first, then the slower PB; then input order.
 */
export function handicapStartSheet(input: { athleteIds: string[]; perfs: Performance[]; lookup: Lookup; courseId: string; config: Config }): HandicapRow[] {
  const { lookup, courseId } = input;
  const ids = [...new Set(input.athleteIds)];
  const wanted = new Set(ids);
  const pbs = new Map<string, { sec: number; perfId: string }>();
  for (const p of input.perfs) {
    if (!wanted.has(p.athleteId)) continue;
    const ct = courseTimeOf(p, lookup);
    if (!ct || ct.course.id !== courseId) continue;
    const cur = pbs.get(p.athleteId);
    if (!cur || ct.timeSec < cur.sec) pbs.set(p.athleteId, { sec: ct.timeSec, perfId: p.id });
  }

  const slowest = Math.max(0, ...[...pbs.values()].map((x) => x.sec));
  const step = input.config.handicap.roundSec;
  const round = (s: number) => (step > 0 ? Math.round(s / step) * step : s);

  const rows = ids.map((athleteId, i) => {
    const pb = pbs.get(athleteId);
    const row: HandicapRow = pb ? { athleteId, pbSec: pb.sec, offsetSec: round(slowest - pb.sec), pbPerfId: pb.perfId } : { athleteId, offsetSec: 0 };
    return { row, i };
  });
  rows.sort((a, b) => {
    if (a.row.offsetSec !== b.row.offsetSec) return a.row.offsetSec - b.row.offsetSec;
    const pa = a.row.pbSec ?? Infinity;
    const pb = b.row.pbSec ?? Infinity;
    if (pa !== pb) return pb - pa;
    return a.i - b.i;
  });
  return rows.map((r) => r.row);
}

/**
 * Handicap for any course (distance + climb), from each runner's 5 km prediction: the predicted course time is
 * T5 × (D_eff ÷ 5)^b with the youth-adjusted exponent for their age (src/engine/predict.ts), and the head start
 * is slowest − own, rounded as above. Runners with no prediction start in the first wave.
 */
export function handicapFromPredictions(input: {
  athletes: { id: string; age: number; predicted5kSec?: number }[];
  distanceKm: number;
  climbM: number;
  config: Config;
}): HandicapRow[] {
  const cfg = input.config.predict;
  const dEff = input.distanceKm + Math.max(0, input.climbM) / 100;
  const step = input.config.handicap.roundSec;
  const round = (s: number) => (step > 0 ? Math.round(s / step) * step : s);
  const times = input.athletes.map((a) => {
    if (a.predicted5kSec == null || !(dEff > 0)) return { a, t: undefined as number | undefined };
    const b = exponentFor(a.age, Math.min(dEff, cfg.targetKm), cfg);
    return { a, t: a.predicted5kSec * Math.pow(dEff / cfg.targetKm, b) };
  });
  const slowest = Math.max(0, ...times.map((x) => x.t ?? 0));
  return times
    .map(({ a, t }, i) => ({ row: t != null ? { athleteId: a.id, pbSec: t, offsetSec: round(slowest - t) } : { athleteId: a.id, offsetSec: 0 }, i }))
    .sort((x, y) => x.row.offsetSec - y.row.offsetSec || (y.row.pbSec ?? Infinity) - (x.row.pbSec ?? Infinity) || x.i - y.i)
    .map((r) => r.row as HandicapRow);
}
