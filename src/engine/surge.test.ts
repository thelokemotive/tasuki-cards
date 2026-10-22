import { describe, expect, it } from 'vitest';
import type { Course, Performance, TasukiEvent } from '../types';
import { DEFAULT_CONFIG } from './config';
import { makeLookup } from './perf';
import { computeSurges, median, predictLegTime, surgePct } from './surge';

// Fictional runners: Aiko Testfield, Ben Sampleton, Hana Mockridge, Dai Exampleton, Kei Placeholder.
// The spec-literal gate (any group size) for the worked examples; the default minimum group size (3) is tested below.
const cfg = { ...DEFAULT_CONFIG, surge: { ...DEFAULT_CONFIG.surge, sanityMinLegs: 1 } };
const circuit: Course = { id: 'c-circuit', name: 'Campus Circuit', kind: 'circuit', distanceKm: 1.3, climbM: 0, terrainFactor: 1, benchmarkMode: 'age_grade', version: 1 };
// Every relay leg below is 2.0 km with 20 m climb: D_eff = (2.0 + 20 / 100) × 1.00 = 2.20 km.
const ev = (id: string, date: string): TasukiEvent => ({ id, name: `Fictional Ekiden ${id}`, date, kind: 'relay', distanceKm: 2, climbM: 20, official: true });
const E1 = ev('E1', '2026-11-01');
const lookup = makeLookup([circuit], [E1, ev('E2', '2026-11-15'), ev('E3', '2026-11-22')]);

let n = 0;
function perf(athleteId: string, p: Partial<Performance> & Pick<Performance, 'date' | 'kind'>): Performance {
  n++;
  return { id: `p${n}`, athleteId, verified: true, source: 'coach', rawInput: '', history: [], ...p };
}
/** A solo race over the same 2.0 km + 20 m as the legs, so Tpred = Tsolo × (2.2 / 2.2)^1.1 = Tsolo. */
const soloRace = (athleteId: string, date: string, timeSec: number) => perf(athleteId, { date, kind: 'race', distanceKm: 2, climbM: 20, timeSec });
const leg = (athleteId: string, eventId: string, date: string, timeSec: number, extra: Partial<Performance> = {}) =>
  perf(athleteId, { date, kind: 'relay_leg', eventId, timeSec, ...extra });

describe('predictLegTime and TS%', () => {
  it('converts a Circuit time to the leg distance (worked example)', () => {
    // Ben's Circuit 4:52 = 292 s over D_eff 1.30 km; leg D_eff 2.20 km.
    // 2.2 / 1.3 = 1.692308; ^1.10 = 1.783722; × 292 = 520.85 s.
    expect(predictLegTime(292, 1.3, 2.2, false, cfg)).toBeCloseTo(520.847, 2);
    // Raced earlier the same day: × 1.02 = 531.26 s.
    expect(predictLegTime(292, 1.3, 2.2, true, cfg)).toBeCloseTo(531.264, 2);
    // Leg run in 8:10 = 490 s: TS% = (520.85 − 490) / 490 × 100 = +6.30%.
    expect(surgePct(520.847, 490)).toBeCloseTo(6.295, 2);
  });

  it('median', () => {
    expect(median([5, 2, 12, 3])).toBe(4); // sorted 2, 3, 5, 12 → (3 + 5) / 2
    expect(median([1, 4, 2])).toBe(2);
  });
});

describe('computeSurges (spec 3.12)', () => {
  it('sanity gate triggers: subtract (median − 0.7) from every leg of that event and distance', () => {
    const perfs = [
      soloRace('aiko', '2026-10-10', 525),
      soloRace('ben', '2026-10-10', 515),
      soloRace('hana', '2026-10-10', 510),
      soloRace('dai', '2026-10-10', 560),
      leg('aiko', 'E1', '2026-11-01', 500, { legNumber: 1, teamName: 'Peregrine' }),
      leg('ben', 'E1', '2026-11-01', 500, { legNumber: 2 }),
      leg('hana', 'E1', '2026-11-01', 500, { legNumber: 3 }),
      leg('dai', 'E1', '2026-11-01', 500, { legNumber: 4 }),
      leg('kei', 'E1', '2026-11-01', 500, { legNumber: 5 }), // no solo result in the window → no baseline
    ];
    const s = computeSurges({ perfs, lookup, config: cfg });
    const by = Object.fromEntries(s.map((r) => [r.athleteId, r]));
    // Raw TS% = (Tpred − 500) / 500 × 100:
    //   Aiko (525 − 500) / 5 = 5.0; Ben 3.0; Hana 2.0; Dai (560 − 500) / 5 = 12.0.
    expect(by.aiko.rawPct).toBeCloseTo(5, 9);
    expect(by.ben.rawPct).toBeCloseTo(3, 9);
    expect(by.hana.rawPct).toBeCloseTo(2, 9);
    expect(by.dai.rawPct).toBeCloseTo(12, 9);
    // Median of 2.0, 3.0, 5.0, 12.0 = (3.0 + 5.0) / 2 = 4.0 > 2.0 → correction = 4.0 − 0.7 = 3.3.
    for (const r of s) expect(r.gateCorrectionPct).toBeCloseTo(3.3, 9);
    // Adjusted: Aiko 5.0 − 3.3 = 1.7 (no medal; would have been gold); Ben −0.3; Hana −1.3; Dai 8.7 gold.
    expect(by.aiko.pct).toBeCloseTo(1.7, 9);
    expect(by.aiko.medal).toBeUndefined();
    expect(by.ben.pct).toBeCloseTo(-0.3, 9);
    expect(by.hana.pct).toBeCloseTo(-1.3, 9);
    expect(by.dai.pct).toBeCloseTo(8.7, 9);
    expect(by.dai.medal).toBe('gold');
    // No baseline: leg time only.
    expect(by.kei).toMatchObject({ noBaseline: true, legTimeSec: 500, legNumber: 5 });
    expect(by.kei.predictedSec).toBeUndefined();
    expect(by.kei.pct).toBeUndefined();
    expect(by.kei.medal).toBeUndefined();
    expect(by.aiko).toMatchObject({ eventId: 'E1', teamName: 'Peregrine', legNumber: 1, noBaseline: false, predictedSec: 525 });
    expect(by.aiko.legDistanceKmEff).toBeCloseTo(2.2, 9);
  });

  it('sanity gate does not trigger when the median is not above +2.0%', () => {
    const perfs = [
      soloRace('aiko', '2026-11-01', 505),
      soloRace('ben', '2026-11-01', 510),
      soloRace('hana', '2026-11-01', 520),
      leg('aiko', 'E2', '2026-11-15', 500),
      leg('ben', 'E2', '2026-11-15', 500),
      leg('hana', 'E2', '2026-11-15', 500),
    ];
    const s = computeSurges({ perfs, lookup, config: cfg });
    // Raw: Aiko 1.0, Ben 2.0, Hana 4.0. Median = 2.0, which is not above 2.0 → no correction.
    expect(s.map((r) => r.gateCorrectionPct)).toEqual([0, 0, 0]);
    expect(s.map((r) => r.pct)).toEqual([1, 2, 4]);
    expect(s.map((r) => r.medal)).toEqual([undefined, undefined, 'bronze']); // 4.0 ≥ 3.0
  });

  it('medal thresholds: exactly +5.0% is gold and exactly +3.0% is bronze', () => {
    // Two legs only: raw 5.0 and −1.0 → median 2.0 (not above) → no correction.
    const perfs = [soloRace('aiko', '2026-11-01', 525), soloRace('ben', '2026-11-01', 495), leg('aiko', 'E2', '2026-11-15', 500), leg('ben', 'E2', '2026-11-15', 500)];
    expect(computeSurges({ perfs, lookup, config: cfg }).map((r) => r.medal)).toEqual(['gold', undefined]);
    const p2 = [soloRace('aiko', '2026-11-01', 515), soloRace('ben', '2026-11-01', 495), leg('aiko', 'E2', '2026-11-15', 500), leg('ben', 'E2', '2026-11-15', 500)];
    // Raw 3.0 and −1.0 → median 1.0 → no correction; 3.0 → bronze.
    expect(computeSurges({ perfs: p2, lookup, config: cfg }).map((r) => r.medal)).toEqual(['bronze', undefined]);
  });

  it('groups the gate by leg distance within an event', () => {
    const perfs = [
      soloRace('aiko', '2026-11-01', 530),
      soloRace('ben', '2026-11-01', 520),
      soloRace('hana', '2026-11-01', 1010),
      leg('aiko', 'E3', '2026-11-22', 500), // 2.20 km: raw 6.0
      leg('ben', 'E3', '2026-11-22', 500), // 2.20 km: raw 4.0
      // A longer leg: 3.8 km + 20 m → D_eff 4.00 km. Hana's 2.20 km race 1010 s → Tpred = 1010 × (4.0 / 2.2)^1.1.
      leg('hana', 'E3', '2026-11-22', 2000, { distanceKm: 3.8 }),
    ];
    const s = computeSurges({ perfs, lookup, config: cfg });
    // 2.20 km group: median (4.0 + 6.0) / 2 = 5.0 → correction 4.3 → Aiko 1.7, Ben −0.3.
    expect(s[0].gateCorrectionPct).toBeCloseTo(4.3, 9);
    expect(s[0].pct).toBeCloseTo(1.7, 9);
    expect(s[1].pct).toBeCloseTo(-0.3, 9);
    // 4.00 km group: (4.0 / 2.2)^1.1 = 1.930; × 1010 = 1949.5 s → raw (1949.5 − 2000) / 2000 = −2.5%, median −2.5 → no gate.
    const pred = 1010 * Math.pow(4 / 2.2, 1.1);
    expect(s[2].predictedSec).toBeCloseTo(pred, 9);
    expect(s[2].rawPct).toBeCloseTo(((pred - 2000) * 100) / 2000, 9);
    expect(s[2].gateCorrectionPct).toBe(0);
  });

  it('default config: the gate needs at least 3 legs with a baseline (a lone runner can medal)', () => {
    // Lone leg, raw +6.0%: with sanityMinLegs 3 there is no gate, so the leg keeps +6.0% → gold.
    const lone = computeSurges({ perfs: [soloRace('aiko', '2026-11-01', 530), leg('aiko', 'E2', '2026-11-15', 500)], lookup, config: DEFAULT_CONFIG });
    expect(lone[0].gateCorrectionPct).toBe(0);
    expect(lone[0].pct).toBeCloseTo(6, 9);
    expect(lone[0].medal).toBe('gold');
    // Three legs at +6.0, +4.0, +3.0 → median 4.0 > 2.0 → correction 3.3 → 2.7, 0.7, −0.3: no medals.
    const three = computeSurges({
      perfs: [soloRace('aiko', '2026-11-01', 530), soloRace('ben', '2026-11-01', 520), soloRace('hana', '2026-11-01', 515), leg('aiko', 'E2', '2026-11-15', 500), leg('ben', 'E2', '2026-11-15', 500), leg('hana', 'E2', '2026-11-15', 500)],
      lookup,
      config: DEFAULT_CONFIG,
    });
    expect(three.map((r) => r.gateCorrectionPct)).toEqual([3.3, 3.3, 3.3].map((x) => expect.closeTo(x, 9)) as unknown as number[]);
    expect(three.map((r) => r.medal)).toEqual([undefined, undefined, undefined]);
  });

  it('a lone leg on its distance is its own median (spec-literal gate, sanityMinLegs 1)', () => {
    // Raw 6.0 → median 6.0 > 2.0 → correction 5.3 → pct 0.7. Logged as an open question.
    const s = computeSurges({ perfs: [soloRace('aiko', '2026-11-01', 530), leg('aiko', 'E2', '2026-11-15', 500)], lookup, config: cfg });
    expect(s[0].pct).toBeCloseTo(0.7, 9);
  });

  it('applies the raced-earlier-same-day factor', () => {
    // Baseline 500 s at the leg distance; raced earlier: Tpred = 500 × 1.02 = 510 → raw (510 − 500) / 500 = +2.0%.
    const earlier = computeSurges({ perfs: [soloRace('ben', '2026-11-01', 500), leg('ben', 'E2', '2026-11-15', 500, { racedEarlierSameDay: true })], lookup, config: cfg });
    expect(earlier[0].predictedSec).toBeCloseTo(510, 9);
    expect(earlier[0].rawPct).toBeCloseTo(2, 9);
    expect(earlier[0].gateCorrectionPct).toBe(0); // median 2.0 is not above 2.0
    const fresh = computeSurges({ perfs: [soloRace('ben', '2026-11-01', 500), leg('ben', 'E2', '2026-11-15', 500)], lookup, config: cfg });
    expect(fresh[0].rawPct).toBe(0);
  });

  it('uses the baseline giving the fastest prediction (race, parkrun or Circuit)', () => {
    const c = perf('ben', { date: '2026-10-14', kind: 'circuit', courseId: circuit.id, timeSec: 292 });
    const perfs = [
      c, // Circuit 292 s / 1.30 km → 520.85 s
      soloRace('ben', '2026-10-20', 530), // 530 s
      perf('ben', { date: '2026-10-24', kind: 'parkrun', distanceKm: 5, timeSec: 1320 }), // 1320 × (2.2 / 5)^1.1 = 1320 × 0.40532 = 535.0 s
      perf('ben', { date: '2026-10-25', kind: 'long_run', distanceKm: 2.2, timeSec: 400 }), // long runs are not baselines
      leg('ben', 'E1', '2026-11-01', 490),
    ];
    const [r] = computeSurges({ perfs, lookup, config: cfg });
    expect(r.baselinePerfId).toBe(c.id);
    expect(r.predictedSec).toBeCloseTo(520.847, 2);
    expect(r.rawPct).toBeCloseTo(6.295, 2); // (520.85 − 490) / 490 × 100
  });

  it('baseline window: within 90 days strictly before the relay, verified, solo', () => {
    // Relay 1 Nov 2026. 3 Aug is exactly 90 days before (31 + 30 + 29); 2 Aug is 91.
    const inWindow = computeSurges({ perfs: [soloRace('hana', '2026-08-03', 520), leg('hana', 'E1', '2026-11-01', 500)], lookup, config: cfg });
    expect(inWindow[0].noBaseline).toBe(false);
    const cases: Performance[][] = [
      [soloRace('hana', '2026-08-02', 520)], // 91 days: too old
      [soloRace('hana', '2026-11-01', 480)], // same day: not strictly before
      [{ ...soloRace('hana', '2026-10-20', 480), verified: false }], // unverified
      [{ ...soloRace('hana', '2026-10-20', 480), deleted: true }], // deleted
      [leg('hana', 'E2', '2026-10-20', 480)], // an earlier relay leg is not a solo result
      [soloRace('ben', '2026-10-20', 480)], // someone else's
    ];
    for (const base of cases) {
      const [r] = computeSurges({ perfs: [...base, leg('hana', 'E1', '2026-11-01', 500)], lookup, config: cfg }).filter((x) => x.perfId !== base[0].id);
      expect(r.noBaseline).toBe(true);
    }
  });

  it('only counted legs with a time and a distance are assessed', () => {
    const noTime = leg('aiko', 'E1', '2026-11-01', 0);
    delete noTime.timeSec;
    const perfs = [
      soloRace('aiko', '2026-10-10', 520),
      { ...leg('aiko', 'E1', '2026-11-01', 500), verified: false },
      noTime,
      perf('aiko', { date: '2026-11-01', kind: 'relay_leg', timeSec: 500 }), // no event, no distance
    ];
    expect(computeSurges({ perfs, lookup, config: cfg })).toEqual([]);
  });
});
