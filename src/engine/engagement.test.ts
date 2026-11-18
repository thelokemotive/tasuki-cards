// The engagement rules (Nov 2026): a new stat never lowers OVR; treadmill sessions keep the streak and earn
// km club badges but never move a rating.
import { describe, expect, it } from 'vitest';
import type { Config } from './config';
import type { Calendar } from '../types';
import type { Performance } from '../types';
import { cloneConfig, currentConfig, DEFAULT_CONFIG, engagementMigration, ENGAGEMENT_NOTE, withDefaults } from './config';
import { ovrFrom } from './stats';
import type { StatKey, StatValue } from './types';
import { STAT_KEYS } from './types';
import { computeStreak } from './streak';
import { makeLookup, resolveContext } from './perf';
import { perfFeeds } from './scoring';
import { computeBadges } from './badges';
import { averageKmh, checkTreadmillRun, treadmillClimbM, treadmillRawInput, treadmillSummary } from './treadmill/session';

const cfg = DEFAULT_CONFIG;
const plainRule = (() => {
  const c = cloneConfig(cfg);
  c.ovr.newStatNeverCosts = false;
  return c;
})();

/** Stats with a value and an evidence count (results) for each; the rest locked. */
function stats(vals: Partial<Record<StatKey, [number, number]>>): Record<StatKey, StatValue> {
  const out = {} as Record<StatKey, StatValue>;
  for (const k of STAT_KEYS) {
    const v = vals[k];
    const half = cfg.ovr.evidence.halfResults;
    out[k] = v ? ({ key: k, value: v[0], locked: false, evidence: { results: v[1], weight: v[1], confidence: v[1] / (v[1] + half) } } as unknown as StatValue) : ({ key: k, locked: true } as unknown as StatValue);
  }
  return out;
}

describe('a new stat never lowers OVR', () => {
  it("the coach's example: two strong stats, then a first ARM test at 55", () => {
    const before = ovrFrom(stats({ SPD: [80, 3], END: [76, 4] }), cfg);
    const after = ovrFrom(stats({ SPD: [80, 3], END: [76, 4], ARM: [55, 1] }), cfg);
    // Under the old rule the ARM test cost points.
    expect(ovrFrom(stats({ SPD: [80, 3], END: [76, 4], ARM: [55, 1] }), plainRule).value!).toBeLessThan(before.value!);
    expect(after.value!).toBeGreaterThanOrEqual(before.value!);
    expect(after.counted).toEqual(['SPD', 'END']);
  });

  it('a first try joins the OVR when it lifts it', () => {
    const weak = ovrFrom(stats({ SPD: [80, 3], END: [76, 4], ARM: [55, 1] }), cfg);
    const strong = ovrFrom(stats({ SPD: [80, 3], END: [76, 4], ARM: [85, 1] }), cfg);
    expect(strong.counted).toBeUndefined();
    expect(strong.value!).toBeGreaterThan(weak.value!);
  });

  it('never lower, whichever stat is unlocked, for many squads', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let trial = 0; trial < 400; trial++) {
      const vals: Partial<Record<StatKey, [number, number]>> = {};
      for (const k of STAT_KEYS) if (rnd() < 0.6) vals[k] = [Math.round(45 + rnd() * 50), 1 + Math.floor(rnd() * 8)];
      const locked = STAT_KEYS.filter((k) => !vals[k]);
      if (!locked.length || Object.keys(vals).length < 2) continue;
      const before = ovrFrom(stats(vals), cfg).value!;
      const k = locked[Math.floor(rnd() * locked.length)];
      // A first try (one result): a stat unlocked with more history already behind it is established.
      const after = ovrFrom(stats({ ...vals, [k]: [Math.round(40 + rnd() * 55), 1] }), cfg).value!;
      expect(after).toBeGreaterThanOrEqual(before);
    }
  });

  it('when every stat helps, it is the same OVR as before', () => {
    const s = stats({ SPD: [72, 5], END: [70, 6], CLB: [71, 2] });
    expect(ovrFrom(s, cfg).value).toBe(ovrFrom(s, plainRule).value);
    expect(ovrFrom(s, cfg).counted).toBeUndefined();
  });
});

describe('the engagement config version', () => {
  it('arrives once, as its own version, for a store made before it', () => {
    const stored = { ...JSON.parse(JSON.stringify(cfg)), version: 3 } as Config & Record<string, unknown>;
    delete (stored.ovr as Partial<Config['ovr']>).newStatNeverCosts;
    delete (stored.streak as Partial<Config['streak']>).treadmillCounts;
    // Read with the rules off, so its ratings are reproduced as they were.
    expect(withDefaults(stored).ovr.newStatNeverCosts).toBe(false);
    expect(withDefaults(stored).streak.treadmillCounts).toBe(false);
    const v4 = engagementMigration([stored], '2026-11-18T00:00:00.000Z')!;
    expect(v4.version).toBe(4);
    expect(v4.note).toBe(ENGAGEMENT_NOTE);
    expect(v4.ovr.newStatNeverCosts && v4.streak.treadmillCounts).toBe(true);
    expect(currentConfig([stored, v4]).ovr.newStatNeverCosts).toBe(true);
    expect(engagementMigration([stored, v4], 'later')).toBeUndefined();
  });
  it('a new store starts with the rules on and needs no migration', () => {
    expect(engagementMigration([cfg], 'x')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------------

let n = 0;
const tm = (date: string, km: number, sec: number, extra: Partial<Performance> = {}): Performance => ({ id: `t${++n}`, athleteId: 'a1', date, kind: 'treadmill', distanceKm: km, timeSec: sec, verified: true, source: 'form', rawInput: '', history: [], ...extra });
const lookup = makeLookup([], []);
const calendar: Calendar = { holidayWeeks: [], halfTerms: [] };

describe('treadmill sessions', () => {
  it('keep the weekly streak going once the coach approves them', () => {
    const perfs = [tm('2026-11-02', 3, 1080), tm('2026-11-10', 4, 1500), tm('2026-11-17', 2, 700, { verified: false })];
    const s = computeStreak({ athleteId: 'a1', perfs, participation: [], calendar, config: cfg, asOf: '2026-11-18', lookup });
    expect(s.currentStreak).toBe(2);
    expect(s.weeks.map((w) => w.state)).toEqual(['counted', 'counted', 'current']);
    const off = cloneConfig(cfg);
    off.streak.treadmillCounts = false;
    expect(computeStreak({ athleteId: 'a1', perfs, participation: [], calendar, config: off, asOf: '2026-11-18', lookup }).currentStreak).toBe(0);
  });

  it('a long one feeds END like a long run; a short one feeds nothing; never SPD or CLB', () => {
    expect(perfFeeds(resolveContext(tm('2026-11-02', 10, 3000, { climbM: 500 }), lookup), cfg)).toEqual(['END']);
    expect(perfFeeds(resolveContext(tm('2026-11-02', 4.6, 1500, { climbM: 46 }), lookup), cfg)).toEqual(['END']);
    expect(perfFeeds(resolveContext(tm('2026-11-02', 4, 1500), lookup), cfg)).toEqual([]);
    const off = cloneConfig(cfg);
    off.treadmill.feedsEnd = false;
    expect(perfFeeds(resolveContext(tm('2026-11-02', 10, 3000), lookup), off)).toEqual([]);
  });

  it('earn the km club badge for total treadmill km, and count nothing towards First 5K', () => {
    const perfs = [tm('2026-10-01', 5, 1800), tm('2026-10-08', 4, 1500), tm('2026-10-15', 3, 1100), tm('2026-10-22', 6, 2200)];
    const athlete = { id: 'a1' } as Parameters<typeof computeBadges>[0]['athlete'];
    const streak = computeStreak({ athleteId: 'a1', perfs, participation: [], calendar, config: cfg, asOf: '2026-11-18', lookup });
    const badges = computeBadges({ athlete, perfs, lookup, config: cfg, asOf: '2026-11-18', streak, surges: [], courseRecords: [], achievements: [] });
    expect(badges.filter((b) => b.kind === 'treadmill').map((b) => b.label)).toEqual(['Treadmill 10 km club']);
    expect(badges.some((b) => b.kind === 'distance')).toBe(false);
  });

  it('summary: sessions, km, longest, fastest and the next milestone', () => {
    const perfs = [tm('2026-10-01', 5, 1800), tm('2026-11-08', 3, 900), tm('2026-11-12', 0.5, 120), tm('2026-11-14', 4, 1500, { deleted: true })];
    const s = treadmillSummary(perfs, 'a1', '2026-11-18', cfg, '2026-11-01');
    expect(s).toMatchObject({ sessions: 3, totalKm: 8.5, sessionsSince: 2, kmSince: 3.5, longestKm: 5, fastestKmh: 12, nextMilestone: { km: 10, toGo: 1.5 } });
  });

  it('incline becomes climb; the record keeps every number from the display', () => {
    expect(treadmillClimbM(5, 1)).toBe(50);
    expect(treadmillClimbM(0.024, 2)).toBe(0);
    expect(averageKmh(5, 1500)).toBe(12);
    expect(treadmillRawInput({ distanceKm: 5, timeSec: 1530, inclinePct: 1, speedKmh: 12, effort: 6 }, 'read from a photo')).toBe('Treadmill 5.000 km in 25:30 at 1.0% (12.0 km/h at the end) effort 6/10; read from a photo');
  });

  it('checks: impossible values are refused, odd ones flagged for the coach', () => {
    const ok = checkTreadmillRun({ distanceKm: 5, timeSec: 1530, inclinePct: 1, speedKmh: 12 }, '2026-11-18', '2026-11-18', cfg);
    expect(ok).toEqual({ errors: [], flags: [] });
    expect(checkTreadmillRun({ distanceKm: 5, timeSec: 600 }, '2026-11-18', '2026-11-18', cfg).errors[0]).toMatch(/30.0 km\/h/);
    expect(checkTreadmillRun({ distanceKm: 3, timeSec: 1000 }, '2026-11-19', '2026-11-18', cfg).errors).toEqual(['The date is in the future.']);
    expect(checkTreadmillRun({ distanceKm: 3, timeSec: 1000 }, '2026-10-01', '2026-11-18', cfg).errors[0]).toMatch(/older than 14 days/);
    expect(checkTreadmillRun({ timeSec: 1000 }, '2026-11-18', '2026-11-18', cfg).errors).toEqual(['Enter the distance.']);
    // The photo in fixtures/: 24 m in 37 s, a test of the treadmill rather than a run.
    expect(checkTreadmillRun({ distanceKm: 0.024, timeSec: 37, inclinePct: 2, speedKmh: 2.7 }, '2026-11-18', '2026-11-18', cfg).flags).toEqual(['short: under 1 km']);
    expect(checkTreadmillRun({ distanceKm: 5, timeSec: 1530, speedKmh: 30 }, '2026-11-18', '2026-11-18', cfg).flags).toContain('speed on the display 30 km/h');
  });
});

describe('established stats always count', () => {
  it('a regular with plenty of results keeps every established stat in the OVR, however weak', () => {
    const o = ovrFrom(stats({ SPD: [92, 12], END: [84, 6], NAV: [40, 2], ARM: [74, 1] }), cfg);
    expect(o.counted).toEqual(['SPD', 'END', 'NAV']);
  });
  it('a new stat becomes part of the profile at its second result', () => {
    expect(ovrFrom(stats({ SPD: [80, 3], END: [76, 4], ARM: [55, 1] }), cfg).counted).toEqual(['SPD', 'END']);
    expect(ovrFrom(stats({ SPD: [80, 3], END: [76, 4], ARM: [55, 2] }), cfg).counted).toBeUndefined();
  });
});

describe('a long treadmill run is scored for END', () => {
  it('age-graded like a long run, with the incline counted as climb', async () => {
    const { scorePerformance } = await import('./scoring');
    const athlete = { id: 'a1', givenName: 'Aiko', familyName: 'T', preferredName: 'Aiko', aliases: [], sex: 'F', yearGroup: 'Y10', yearGroupYear: 2026, displayMode: 'full', absoluteBoardOptOut: false, avatar: { seed: 1, skinTone: 0, hairStyle: 0, hairColour: 0, kitColour: 'academy-navy', accessory: 'none' }, active: true } as const;
    const long = scorePerformance(resolveContext(tm('2026-11-10', 6, 2100, { climbM: 60 }), lookup), { ...athlete, aliases: [] }, cfg, '2026-11-18');
    expect(long.feeds).toEqual(['END']);
    expect(long.score).toBeGreaterThan(50);
    expect(long.dEff).toBeCloseTo(6.6, 9);
    const short = scorePerformance(resolveContext(tm('2026-11-10', 3, 1000), lookup), { ...athlete, aliases: [] }, cfg, '2026-11-18');
    expect(short.unscoredReason).toMatch(/treadmill session/);
  });
});
