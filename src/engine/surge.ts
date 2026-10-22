// Tasuki Surge (spec 3.12): how much faster a relay leg was than the athlete's recent solo form predicts.
// Surge is a badge and its own board. It never changes RACE or OVR.
import type { Performance } from '../types';
import type { Config } from './config';
import type { SurgeResult } from './types';
import { daysBetween } from './dates';
import { byDate, counts, resolveContext, type Lookup } from './perf';
import { isCircuitPerf } from './streak';

/** Tpred = Tsolo × (DlegEff / DsoloEff)^exponent × (racedEarlierSameDay ? racedEarlierFactor : 1). */
export function predictLegTime(soloSec: number, soloKmEff: number, legKmEff: number, racedEarlierSameDay: boolean, config: Config): number {
  const { exponent, racedEarlierFactor } = config.surge;
  return soloSec * Math.pow(legKmEff / soloKmEff, exponent) * (racedEarlierSameDay ? racedEarlierFactor : 1);
}

/** TS% = (Tpred − Tleg) / Tleg × 100 (positive = faster than predicted). */
export function surgePct(predictedSec: number, legSec: number): number {
  return ((predictedSec - legSec) * 100) / legSec;
}

/** Median of a non-empty list (mean of the two middle values for an even count). */
export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Medal thresholds are compared on the unrounded value, with a tiny tolerance for floating-point noise. */
const EPS = 1e-9;

function isSoloBaselineKind(p: Performance, lookup: Lookup): boolean {
  return p.kind === 'race' || p.kind === 'parkrun' || isCircuitPerf(p, lookup);
}

/**
 * Surge for every counted relay leg with a time and a known distance, oldest first.
 * - Baseline: the same athlete's verified solo race, parkrun or Circuit performances dated within
 *   config.surge.baselineDays days strictly before the relay date; the one giving the fastest Tpred wins.
 * - Sanity gate: legs are grouped by event (or by date when a leg has no event) and leg D_eff rounded to
 *   0.01 km. If a group has at least sanityMinLegs legs with a baseline and their median raw TS% is above
 *   sanityMedianPct, every leg in that group has (median − sanityOffsetPct) subtracted (gateCorrectionPct).
 * - Medal on the adjusted pct: gold ≥ goldPct, bronze ≥ bronzePct. No baseline → leg time only.
 */
export function computeSurges(input: { perfs: Performance[]; lookup: Lookup; config: Config }): SurgeResult[] {
  const { lookup, config } = input;
  const live = input.perfs.filter(counts).sort(byDate);

  const results: { r: SurgeResult; group: string }[] = [];
  for (const leg of live) {
    if (leg.kind !== 'relay_leg' || !(leg.timeSec != null && leg.timeSec > 0)) continue;
    const legEff = resolveContext(leg, lookup).dEff;
    if (legEff == null) continue;

    let best: { pred: number; perf: Performance } | undefined;
    for (const b of live) {
      if (b.athleteId !== leg.athleteId || b.kind === 'relay_leg' || !isSoloBaselineKind(b, lookup)) continue;
      if (!(b.timeSec != null && b.timeSec > 0)) continue;
      const age = daysBetween(b.date, leg.date);
      if (age < 1 || age > config.surge.baselineDays) continue;
      const soloEff = resolveContext(b, lookup).dEff;
      if (soloEff == null) continue;
      const pred = predictLegTime(b.timeSec, soloEff, legEff, leg.racedEarlierSameDay === true, config);
      // Ties keep the later baseline (more recent form); `live` is oldest first.
      if (!best || pred <= best.pred) best = { pred, perf: b };
    }

    const r: SurgeResult = {
      perfId: leg.id,
      athleteId: leg.athleteId,
      eventId: leg.eventId,
      legNumber: leg.legNumber,
      teamName: leg.teamName,
      legTimeSec: leg.timeSec,
      legDistanceKmEff: legEff,
      gateCorrectionPct: 0,
      noBaseline: !best,
    };
    if (best) {
      r.predictedSec = best.pred;
      r.baselinePerfId = best.perf.id;
      r.rawPct = surgePct(best.pred, leg.timeSec);
    }
    results.push({ r, group: `${leg.eventId ?? `date:${leg.date}`}|${legEff.toFixed(2)}` });
  }

  const groups = new Map<string, SurgeResult[]>();
  for (const { r, group } of results) groups.set(group, [...(groups.get(group) ?? []), r]);
  for (const legs of groups.values()) {
    const pcts = legs.filter((r) => r.rawPct != null).map((r) => r.rawPct as number);
    // The gate needs enough legs for a median to mean "the course was fast" rather than "this runner surged".
    const m = pcts.length >= Math.max(1, config.surge.sanityMinLegs) ? median(pcts) : undefined;
    const correction = m != null && m > config.surge.sanityMedianPct ? m - config.surge.sanityOffsetPct : 0;
    for (const r of legs) {
      r.gateCorrectionPct = correction;
      if (r.rawPct == null) continue;
      r.pct = r.rawPct - correction;
      if (r.pct >= config.surge.goldPct - EPS) r.medal = 'gold';
      else if (r.pct >= config.surge.bronzePct - EPS) r.medal = 'bronze';
    }
  }
  return results.map((x) => x.r);
}
