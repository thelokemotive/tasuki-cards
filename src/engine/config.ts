// Every scoring constant lives here, in one versioned object (spec section 0 and 8).
// Settings edits create a new version; every derived rating records the version it used.
import type { Sex, YearGroup } from '../types';
import { DEFAULT_PREDICT as DEFAULT_PREDICT_VALUES } from './predict';

/** Percentile points for the bleep (20 m shuttle run) table columns. */
export const BLEEP_PERCENTILES = [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95] as const;

export type AgeGradeTableId = 'alan_jones_2025' | 'fallback_provisional';

export interface Config {
  version: number;
  createdAt: string;
  /** Free-text note shown in the config history ("Raised anchor to 0.82"). */
  note?: string;
  /** Set on a version the app created by itself (a one-off migration), so it is never applied twice. */
  migration?: string;

  ageGrade: {
    /** Which standard table to use. 'fallback_provisional' marks every age-graded rating provisional. */
    table: AgeGradeTableId;
    /**
     * Standards below 1 mile (the road tables' shortest distance). 'world_record_curve': the runner's mile
     * standard scaled along the track world records (200 m to the mile), so short efforts are judged against
     * what is really possible over that distance. 'extrapolate': the mile–5 km slope carried downwards (the
     * rule before November 2026; 10–13% too generous at 550 m).
     */
    subMile: 'world_record_curve' | 'extrapolate';
    /** Fallback (provisional) table, spec 3.4. */
    fallback: {
      open5kSec: Record<Sex, number>;
      /** Distance scaling exponent from 5 km for D <= 5 km. */
      expShort: number;
      /** Distance scaling exponent from 5 km for D > 5 km. */
      expLong: number;
      /** Age factor (multiplies speed): Std = OpenStd / AF. Keys are ages; 18–30 = 1.000. Linear between keys. */
      ageFactors: Record<Sex, Record<number, number>>;
    };
  };

  age: {
    /** Age on 1 September of the academic year, by year group. */
    yearGroupAgeOnSept1: Record<Exclude<YearGroup, 'Staff'>, number>;
    /** Added for an assumed mid-year birthday. */
    midYearOffset: number;
    /** Staff without a date of birth. */
    staffDefaultAge: number;
    /** Month (1–12) and day the academic year starts. */
    academicYearStartMonth: number;
    academicYearStartDay: number;
    /** Reference age for the open standard in fixed-benchmark mode (spec 3.6: Std(25, sex, 5)). */
    fixedReferenceAge: number;
    /** Reference distance (km) for the fixed-benchmark age adjustment (spec 3.6: Std(age, sex, 5)). */
    fixedReferenceKm: number;
  };

  runScore: {
    /** 80% age grade ("national class") = 99. */
    anchorAG: number;
    min: number;
    max: number;
  };

  freshness: {
    decayGraceMonths: number;
    decayPointsPerMonth: number;
    expireMonths: number;
  };

  growthShield: {
    enabled: boolean;
    /** Displayed stat = max(current, peak12m − margin). */
    margin: number;
    windowMonths: number;
  };

  race: {
    /** Weights for the top 3 / 2 / 1 race FreshScores. */
    weights3: [number, number, number];
    weights2: [number, number];
  };

  spd: {
    /** Short races also feed SPD (go-live plan 1): SPD = best of the Circuit and short races. */
    allowRaces: boolean;
    /** A verified race, relay leg or parkrun with D_eff at or below this (km) feeds SPD. */
    raceMaxKmEff: number;
  };

  clb: {
    /** Hill races also feed CLB (go-live plan 1). The climb course still counts. */
    allowRaces: boolean;
    /** A verified race, relay leg, parkrun or long run needs at least this much climb (m)… */
    raceMinClimbM: number;
    /** …and at least this much climb per km of distance (m/km) to feed CLB. */
    raceMinClimbPerKm: number;
  };

  end: {
    allowLongRuns: boolean;
    /** Minimum D_eff (km) for a race/parkrun/long run to set END. */
    longRunMinKmEff: number;
    /** Bleep table (laps at each percentile in BLEEP_PERCENTILES), by sex and age 11–18 (18 = 18+). PROVISIONAL. */
    bleepTable: Record<Sex, Record<number, number[]>>;
    bleepMinAge: number;
    bleepMaxAge: number;
    /** Rating = clamp(round(base + slope × P), base, capAtP95) up to P95. */
    bleepBase: number;
    bleepSlope: number;
    bleepCapAtP95: number;
    /** Above P95: linear from capAtP95 at L_P95 to topScore at topMultiplier × L_P95. */
    bleepTopMultiplier: number;
    bleepTopScore: number;
    bleepProvisional: boolean;
  };

  nav: {
    allowance: number;
    penaltySecPerError: number;
    /** navErrors >= this → NAV 40. */
    maxErrors: number;
    /** Fallback reference pace: best verified race pace with D_eff <= this (km). */
    refRaceMaxKmEff: number;
    /** Efficiency that scores the minimum (spec 3.9: NAV = 40 + 59 × (eff − 0.5) / 0.5). */
    effAtMin: number;
    /**
     * Riegel exponent for predicting a nav route time from a race of another distance (go-live plan 6):
     * T_route = T_race × (route ÷ race D_eff)^riegelExponent. Used only with no Circuit and no short race.
     */
    riegelExponent: number;
    provisional: boolean;
  };

  arm: {
    /** Minimum value for levels 1..5. */
    ankleCm: [number, number, number, number, number];
    calfReps: [number, number, number, number, number];
    /** Levels 1..4 (seconds). Level 5 = level-4 threshold and Hop & Freeze passed on both legs. */
    storkSec: [number, number, number, number];
    /** Hop & Freeze counts as passed when the furthest line frozen is at least this (cm) on both legs. */
    hopGateCm: number;
    windowMonths: number;
    provisional: boolean;
  };

  ovr: {
    /** Fewer unlocked stats than this → OVR shows "—". */
    minUnlocked: number;
    /**
     * Evidence-weighted OVR. Every separate result behind an unlocked stat is a piece of evidence (n in total,
     * weighted). The stats are averaged, each in proportion to its own confidence c = n_stat ÷ (n_stat + halfResults),
     * and that average is trusted only as far as the evidence goes:
     * OVR = priorScore + proven × (average − priorScore), proven = n ÷ (n + ovrHalfResults).
     * This is the standard small-sample correction (regression to the mean, as in empirical-Bayes and
     * Glicko-style ratings): one run is a first estimate, not a proven level. Off: the plain average.
     */
    evidence: {
      enabled: boolean;
      /** The score assumed before there is evidence: about a 40% age grade, an untrained pupil. */
      priorScore: number;
      /** Results at which a single stat is half proven (its weight in the average). */
      halfResults: number;
      /** Results, across all stats, at which the OVR is half proven. */
      ovrHalfResults: number;
      /** A place with no time (the Green Long Ducker) counts as this fraction of a result. */
      placeOnlyWeight: number;
      /** A result at an unofficial event (a stopwatch time trial, a training relay). */
      unofficialWeight: number;
      /** An effort shorter than shortEffortKm of effort says less about a distance runner. */
      shortEffortKm: number;
      shortEffortWeight: number;
      /** Results older than this many months count for less. */
      olderThanMonths: number;
      olderWeight: number;
      /** Proven share (0–1) below which the OVR is marked as a first estimate, and above which it is proven. */
      estimateBelow: number;
      provenFrom: number;
    };
    /**
     * Unlocking a stat never lowers OVR. A new stat (fewer than newStatResults results behind it) counts in
     * the OVR only when it lifts it; once it has newStatResults results it is part of the runner's profile
     * and always counts, like every established stat. So a first nav run or a first ARM test is never a loss.
     * Off: every unlocked stat counts from its first result.
     */
    newStatNeverCosts: boolean;
    newStatResults: number;
  };

  tiers: {
    silverMin: number;
    goldMin: number;
    goldMinCaps: number;
    iconMinCaps: number;
    iconMinRace: number;
  };

  inForm: {
    days: number;
  };

  /** Winter Mode (top-up sessions over the holidays and the snow season). See src/engine/winter.ts. */
  winter: {
    /** Sessions a pupil needs in a winter week, at least one of them a run (outdoors or treadmill). */
    sessionsPerWeek: number;
    /** The same for staff (the coach's own maintenance target). */
    staffSessionsPerWeek: number;
    /** A session shorter than this does not count (armour: armourMinMinutes). */
    minRunMinutes: number;
    armourMinMinutes: number;
    /** Weeks the app lets slide per winter without breaking the flame (Duolingo's freeze, equipped in advance). */
    restPasses: number;
    /** A kept winter week counts as a streak week in the main streak (missed holiday weeks still never break it). */
    countsTowardStreak: boolean;
    /** Weeks kept, as a share of winter weeks so far, to be "spring ready". */
    springReadyShare: number;
    /** No run for this many days: the first week back is easy, at most firstBackMinutes a session. */
    returnAfterDays: number;
    firstBackMinutes: number;
    /** This week's running minutes above spikeRatio × the average of the previous 4 weeks (and above spikeMinMinutes): ease off. */
    spikeRatio: number;
    spikeMinMinutes: number;
    /** Running minutes in one week above this (pupils) is flagged to the coach. */
    weeklyMinutesFlag: number;
    /** Soreness at or above this: the next session should be armour, not a run. At or above painFlag: tell the coach. */
    sorenessSwap: number;
    painFlag: number;
    /** Soreness at or above sorenessSwap in the heel or knee goes to the coach for these year groups (growth plates). */
    growthYears: string[];
    /** Treadmill incline (%) that makes belt pace roughly match outdoor pace (Jones & Doust 1996). */
    treadmillInclinePct: number;
  };

  streak: {
    milestones: number[];
    /** Freezes allowed per half-term. */
    freezesPerHalfTerm: number;
    /** A verified treadmill session keeps the week's streak going, like a Circuit run. */
    treadmillCounts: boolean;
  };

  treadmill: {
    /**
     * A verified treadmill run at least end.longRunMinKmEff of effort (distance + incline as climb) feeds END,
     * age-graded like a long run. Shorter sessions keep the streak and count for the km club only.
     */
    feedsEnd: boolean;
    /** Treadmill km club badges: total verified treadmill km. */
    kmMilestones: number[];
    /** A log is flagged (not refused) outside these. */
    minKm: number;
    maxSpeedKmh: number;
    maxInclinePct: number;
    /** Logs dated more than this many days ago are refused on the pupil page. */
    maxDaysOld: number;
  };

  surge: {
    exponent: number;
    racedEarlierFactor: number;
    baselineDays: number;
    bronzePct: number;
    goldPct: number;
    sanityMedianPct: number;
    sanityOffsetPct: number;
    /**
     * The sanity gate applies only to groups (same event and leg distance) with at least this many legs
     * that have a baseline. A lone runner would otherwise be their own median and could never medal.
     */
    sanityMinLegs: number;
  };

  handicap: {
    roundSec: number;
  };

  badges: {
    /** Distance badge thresholds in km (first verified run at or beyond). Ultra is strictly greater than ultraKm. */
    distances: { key: string; label: string; km: number }[];
    ultraKm: number;
    mountainClimbM: number;
  };

  avatarUnlocks: {
    navCompass: number;
    navCompassFloat: number;
    armGuards: number;
    armGlow: number;
    spdLines: number;
    spdLightning: number;
    clbWings: number;
    dscDust: number;
    sashCaps: number;
    goldSashCaps: number;
    headbandStreak: number;
  };

  input: {
    /** Pace sanity (s/km): faster than this is flagged implausible. 2:30/km. */
    fastestPaceSecPerKm: number;
    /** Slower than this is flagged implausible. 12:00/km. */
    slowestPaceSecPerKm: number;
    /** Jaro–Winkler threshold for fuzzy suggestions. */
    fuzzyThreshold: number;
    /** Distance assumed for a parkrun entered without one (km). */
    parkrunDefaultKm: number;
    /** Any parsed time outside this range is rejected with a warning. */
    minTimeSec: number;
    maxTimeSec: number;
  };

  boards: {
    topN: number;
  };

  /** Next-5K prediction and targets (src/engine/predict.ts). */
  predict: import('./predict').PredictConfig;

  backup: {
    reminderDays: number;
  };
}

export const DEFAULT_CONFIG: Config = {
  version: 1,
  createdAt: '2026-10-22T00:00:00.000Z',
  note: 'Initial defaults from Build Spec v1',

  ageGrade: {
    table: 'alan_jones_2025',
    subMile: 'world_record_curve',
    fallback: {
      open5kSec: { M: 769, F: 834 },
      expShort: 1.1,
      expLong: 1.06,
      ageFactors: {
        M: { 10: 0.837, 11: 0.855, 12: 0.882, 13: 0.91, 14: 0.94, 15: 0.966, 16: 0.985, 17: 0.994, 18: 1, 30: 1, 35: 0.985, 40: 0.955, 45: 0.92, 50: 0.885, 55: 0.848, 60: 0.81 },
        F: { 10: 0.855, 11: 0.878, 12: 0.905, 13: 0.93, 14: 0.952, 15: 0.968, 16: 0.982, 17: 0.992, 18: 1, 30: 1, 35: 0.982, 40: 0.952, 45: 0.915, 50: 0.875, 55: 0.835, 60: 0.795 },
      },
    },
  },

  age: {
    yearGroupAgeOnSept1: { Y7: 11, Y8: 12, Y9: 13, Y10: 14, Y11: 15, Y12: 16, Y13: 17 },
    midYearOffset: 0.5,
    staffDefaultAge: 30,
    academicYearStartMonth: 9,
    academicYearStartDay: 1,
    fixedReferenceAge: 25,
    fixedReferenceKm: 5,
  },

  runScore: { anchorAG: 0.8, min: 40, max: 99 },

  freshness: { decayGraceMonths: 6, decayPointsPerMonth: 1, expireMonths: 24 },

  growthShield: { enabled: true, margin: 2, windowMonths: 12 },

  race: { weights3: [0.5, 0.3, 0.2], weights2: [0.6, 0.4] },

  // 3.5, not 3.0: the coach's own example (a 3 km race with 40 m of climb = 3.4 km effort) counts for SPD.
  spd: { allowRaces: true, raceMaxKmEff: 3.5 },

  clb: { allowRaces: true, raceMinClimbM: 150, raceMinClimbPerKm: 50 },

  end: {
    allowLongRuns: true,
    longRunMinKmEff: 5.0,
    // Provisional, attributed to Tomkinson et al. 2017 (BJSM) international 20 m shuttle run norms.
    // Columns: P5, P10, P20, P30, P40, P50, P60, P70, P80, P90, P95. Needs checking against the paper.
    bleepTable: {
      M: {
        11: [9, 15, 22, 27, 31, 36, 40, 45, 51, 60, 67],
        12: [9, 16, 24, 29, 34, 39, 45, 50, 57, 67, 75],
        13: [11, 18, 26, 33, 39, 44, 50, 56, 64, 75, 84],
        14: [13, 20, 29, 36, 43, 48, 55, 62, 70, 81, 92],
        15: [14, 22, 31, 39, 45, 52, 58, 66, 74, 86, 97],
        16: [15, 23, 33, 41, 48, 54, 61, 69, 78, 91, 102],
        17: [16, 25, 35, 43, 50, 57, 64, 72, 81, 95, 107],
        18: [17, 26, 37, 45, 52, 60, 67, 75, 84, 99, 112],
      },
      F: {
        11: [6, 11, 16, 21, 24, 28, 31, 35, 40, 46, 52],
        12: [5, 10, 16, 21, 25, 28, 32, 36, 41, 48, 54],
        13: [5, 10, 17, 21, 25, 29, 33, 37, 42, 50, 56],
        14: [5, 10, 17, 21, 25, 29, 33, 38, 43, 50, 57],
        15: [5, 10, 17, 22, 26, 30, 34, 38, 44, 51, 58],
        16: [5, 10, 17, 22, 26, 30, 34, 39, 44, 52, 59],
        17: [5, 11, 17, 22, 26, 30, 35, 39, 45, 53, 60],
        18: [5, 11, 17, 22, 26, 30, 35, 40, 46, 54, 61],
      },
    },
    bleepMinAge: 11,
    bleepMaxAge: 18,
    bleepBase: 40,
    bleepSlope: 0.59,
    bleepCapAtP95: 96,
    bleepTopMultiplier: 1.2,
    bleepTopScore: 99,
    bleepProvisional: false,
  },

  nav: { allowance: 1.15, penaltySecPerError: 120, maxErrors: 3, refRaceMaxKmEff: 5, effAtMin: 0.5, riegelExponent: 1.06, provisional: false },

  arm: {
    ankleCm: [5, 8, 10, 12, 14],
    calfReps: [15, 20, 25, 30, 35],
    storkSec: [3, 6, 10, 15],
    hopGateCm: 120,
    windowMonths: 12,
    provisional: false,
  },

  ovr: {
    minUnlocked: 2,
    evidence: { enabled: true, priorScore: 50, halfResults: 1.5, ovrHalfResults: 1.5, placeOnlyWeight: 0.5, unofficialWeight: 0.75, shortEffortKm: 1, shortEffortWeight: 0.5, olderThanMonths: 12, olderWeight: 0.5, estimateBelow: 0.5, provenFrom: 0.75 },
    newStatNeverCosts: true,
    newStatResults: 2,
  },

  tiers: { silverMin: 65, goldMin: 75, goldMinCaps: 1, iconMinCaps: 3, iconMinRace: 85 },

  inForm: { days: 7 },

  streak: { milestones: [4, 8, 12, 20], freezesPerHalfTerm: 1, treadmillCounts: true },

  treadmill: { feedsEnd: true, kmMilestones: [10, 25, 50, 100, 200], minKm: 1, maxSpeedKmh: 22, maxInclinePct: 15, maxDaysOld: 14 },

  winter: {
    sessionsPerWeek: 2,
    staffSessionsPerWeek: 3,
    minRunMinutes: 15,
    armourMinMinutes: 10,
    restPasses: 1,
    countsTowardStreak: true,
    springReadyShare: 0.75,
    returnAfterDays: 14,
    firstBackMinutes: 20,
    spikeRatio: 1.5,
    spikeMinMinutes: 60,
    weeklyMinutesFlag: 240,
    sorenessSwap: 4,
    painFlag: 6,
    growthYears: ['Y7', 'Y8', 'Y9', 'Y10'],
    treadmillInclinePct: 1,
  },

  surge: {
    exponent: 1.1,
    racedEarlierFactor: 1.02,
    baselineDays: 90,
    bronzePct: 3.0,
    goldPct: 5.0,
    sanityMedianPct: 2.0,
    sanityOffsetPct: 0.7,
    sanityMinLegs: 3,
  },

  handicap: { roundSec: 5 },

  badges: {
    distances: [
      { key: '5k', label: 'First 5K', km: 5 },
      { key: '10k', label: 'First 10K', km: 10 },
      { key: 'half', label: 'First half marathon', km: 21.0975 },
      { key: 'marathon', label: 'First marathon', km: 42.195 },
    ],
    ultraKm: 42.2,
    mountainClimbM: 1000,
  },

  avatarUnlocks: {
    navCompass: 70,
    navCompassFloat: 85,
    armGuards: 70,
    armGlow: 85,
    spdLines: 70,
    spdLightning: 85,
    clbWings: 75,
    dscDust: 75,
    sashCaps: 1,
    goldSashCaps: 3,
    headbandStreak: 8,
  },

  input: {
    fastestPaceSecPerKm: 150,
    slowestPaceSecPerKm: 720,
    fuzzyThreshold: 0.88,
    parkrunDefaultKm: 5,
    minTimeSec: 20,
    maxTimeSec: 48 * 3600,
  },

  boards: { topN: 10 },

  predict: DEFAULT_PREDICT_VALUES,

  backup: { reminderDays: 7 },
};

/** The current config is the highest version in the list (falls back to defaults). */
export function currentConfig(configs: Config[] | undefined): Config {
  if (!configs || configs.length === 0) return DEFAULT_CONFIG;
  // Stored versions from an older app may lack constants added since: fill them from the defaults.
  return withDefaults(configs.reduce((a, b) => (b.version > a.version ? b : a)));
}

/** Marks the go-live config version (go-live plan 2). */
export const GO_LIVE_MIGRATION = 'go-live-2026-11';
export const GO_LIVE_NOTE = 'Go-live: provisional markers removed';

/**
 * One-off go-live migration (plan 2): if the current stored config still marks the bleep table, NAV or ARM
 * provisional, return a new version with those markers off, so the change shows in the version history.
 * Runs at most once: a store that already holds the go-live version is left alone, so a coach who turns a
 * marker back on later keeps it. Returns undefined when nothing needs doing.
 */
export function goLiveMigration(configs: Config[] | undefined, createdAt: string): Config | undefined {
  if (!configs || configs.length === 0) return undefined;
  if (configs.some((c) => c.migration === GO_LIVE_MIGRATION)) return undefined;
  const cur = currentConfig(configs);
  if (!cur.end.bleepProvisional && !cur.nav.provisional && !cur.arm.provisional) return undefined;
  const draft = cloneConfig(cur);
  draft.end.bleepProvisional = false;
  draft.nav.provisional = false;
  draft.arm.provisional = false;
  return { ...nextConfigVersion(cur, draft, createdAt, GO_LIVE_NOTE), migration: GO_LIVE_MIGRATION };
}

/** Marks the version that brought in evidence-weighted OVR and the sub-mile standards. */
export const EVIDENCE_MIGRATION = 'evidence-2026-11';
export const EVIDENCE_NOTE = 'Evidence-weighted OVR; standards below 1 mile follow the world-record curve';

/**
 * One-off: a store created before these rules gets a new config version with them switched on, so the change
 * is in the version history and the earlier versions keep the rules they were made with. Runs at most once.
 */
export function evidenceMigration(configs: Config[] | undefined, createdAt: string): Config | undefined {
  if (!configs || configs.length === 0) return undefined;
  if (configs.some((c) => c.migration === EVIDENCE_MIGRATION)) return undefined;
  const on = (c: Config) => c.ovr.evidence.enabled && c.ageGrade.subMile === 'world_record_curve';
  // A store first created with these rules has them in its first version: nothing to migrate (and a coach
  // who later switches them off keeps that choice).
  const first = withDefaults(configs.reduce((a, b) => (b.version < a.version ? b : a)));
  const cur = currentConfig(configs);
  if (on(first) || on(cur)) return undefined;
  const draft = cloneConfig(cur);
  draft.ageGrade.subMile = DEFAULT_CONFIG.ageGrade.subMile;
  draft.ovr.evidence = { ...DEFAULT_CONFIG.ovr.evidence };
  return { ...nextConfigVersion(currentConfig(configs), draft, createdAt, EVIDENCE_NOTE), migration: EVIDENCE_MIGRATION };
}

/**
 * A stored version from before the evidence rules is read with them off, so its ratings can be reproduced.
 * (withDefaults would otherwise fill the new keys with today's defaults.)
 */
function legacyRules(stored: Partial<Config>): Partial<Config> {
  // Versions from before the race rule in the 5K prediction (18 Nov 2026) are read with it off.
  const c: Partial<Config> =
    stored.predict?.raceOnlyRuledOutByLonger === undefined
      ? { ...stored, predict: { ...DEFAULT_PREDICT_VALUES, ...stored.predict, raceOnlyRuledOutByLonger: false } }
      : stored;
  // Versions from before the engagement rules (Nov 2026) are read with them off, likewise.
  const engaged: Partial<Config> =
    c.ovr && c.ovr.newStatNeverCosts === undefined
      ? { ...c, ovr: { ...c.ovr, newStatNeverCosts: false }, streak: { ...(c.streak as Config['streak']), treadmillCounts: c.streak?.treadmillCounts ?? false }, treadmill: { ...DEFAULT_CONFIG.treadmill, ...c.treadmill, feedsEnd: c.treadmill?.feedsEnd ?? false } }
      : c;
  if (engaged.ovr?.evidence && engaged.ageGrade?.subMile) return engaged;
  return {
    ...engaged,
    ageGrade: { ...(engaged.ageGrade as Config['ageGrade']), subMile: engaged.ageGrade?.subMile ?? 'extrapolate' },
    ovr: { ...(engaged.ovr as Config['ovr']), evidence: engaged.ovr?.evidence ?? { ...DEFAULT_CONFIG.ovr.evidence, enabled: false } },
  };
}

/** Marks the version that brought in "a new stat never lowers OVR" and treadmill sessions in streaks. */
export const ENGAGEMENT_MIGRATION = 'engagement-2026-11';
export const ENGAGEMENT_NOTE = 'A new stat never lowers OVR; treadmill sessions keep the weekly streak, and long ones feed END';

/** One-off, as evidenceMigration: switches both rules on in a new version, once, for a store made before them. */
export function engagementMigration(configs: Config[] | undefined, createdAt: string): Config | undefined {
  if (!configs || configs.length === 0) return undefined;
  if (configs.some((c) => c.migration === ENGAGEMENT_MIGRATION)) return undefined;
  const on = (c: Config) => c.ovr.newStatNeverCosts && c.streak.treadmillCounts && c.treadmill.feedsEnd;
  const first = withDefaults(configs.reduce((a, b) => (b.version < a.version ? b : a)));
  const cur = currentConfig(configs);
  if (on(first) || on(cur)) return undefined;
  const draft = cloneConfig(cur);
  draft.ovr.newStatNeverCosts = true;
  draft.streak.treadmillCounts = true;
  draft.treadmill.feedsEnd = true;
  return { ...nextConfigVersion(cur, draft, createdAt, ENGAGEMENT_NOTE), migration: ENGAGEMENT_MIGRATION };
}

/** Marks the version in which a short result can no longer rule out an official race in the 5K prediction. */
export const RACE_ANCHOR_MIGRATION = 'race-anchor-2026-11';
export const RACE_ANCHOR_NOTE = '5K prediction: only a result at least as long can mark an official race as not a full effort';

/** One-off, as engagementMigration: switches the race rule on in a new version, once, for a store made before it. */
export function raceAnchorMigration(configs: Config[] | undefined, createdAt: string): Config | undefined {
  if (!configs || configs.length === 0) return undefined;
  if (configs.some((c) => c.migration === RACE_ANCHOR_MIGRATION)) return undefined;
  const on = (c: Config) => c.predict.raceOnlyRuledOutByLonger;
  const first = withDefaults(configs.reduce((a, b) => (b.version < a.version ? b : a)));
  const cur = currentConfig(configs);
  if (on(first) || on(cur)) return undefined;
  const draft = cloneConfig(cur);
  draft.predict.raceOnlyRuledOutByLonger = true;
  return { ...nextConfigVersion(cur, draft, createdAt, RACE_ANCHOR_NOTE), migration: RACE_ANCHOR_MIGRATION };
}

/** The rules as they were before November 2026 (plain-average OVR, mile–5 km slope below the mile). */
export function preEvidenceRules(c: Config): Config {
  const out = cloneConfig(c);
  out.ageGrade.subMile = 'extrapolate';
  out.ovr.evidence.enabled = false;
  return out;
}

/** Deep clone a config for editing. */
export function cloneConfig(c: Config): Config {
  return JSON.parse(JSON.stringify(c)) as Config;
}

/** Create the next version from an edited draft. */
export function nextConfigVersion(previous: Config, draft: Config, createdAt: string, note?: string): Config {
  const next: Config = { ...cloneConfig(draft), version: previous.version + 1, createdAt, note };
  delete next.migration; // only the version a migration created carries its marker
  return next;
}

/**
 * Fill in any keys missing from a stored/imported config with defaults (forward compatibility when
 * new constants are added in later versions of the app).
 */
export function withDefaults(c: Partial<Config>): Config {
  const merge = (def: unknown, val: unknown): unknown => {
    if (val === undefined) return def;
    if (def && typeof def === 'object' && !Array.isArray(def) && val && typeof val === 'object' && !Array.isArray(val)) {
      const out: Record<string, unknown> = { ...(val as Record<string, unknown>) };
      for (const k of Object.keys(def as Record<string, unknown>)) out[k] = merge((def as Record<string, unknown>)[k], (val as Record<string, unknown>)[k]);
      return out;
    }
    return val;
  };
  return merge(DEFAULT_CONFIG, legacyRules(c)) as Config;
}
