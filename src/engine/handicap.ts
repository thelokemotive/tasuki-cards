// Circuit handicap start sheet (spec 3.14): slower runners start first so everyone finishes together.
import type { Performance } from '../types';
import type { Config } from './config';
import type { HandicapRow } from './types';
import type { Lookup } from './perf';
import { courseTimeOf } from './pbs';

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
