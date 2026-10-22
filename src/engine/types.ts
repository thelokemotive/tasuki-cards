// Derived (computed) types shared across the engine and UI. Nothing here is stored: every value is
// reproducible from raw inputs + a config version.
import type { ISODate, ISOWeek, PerfKind, YearGroup } from '../types';

export type StatKey = 'SPD' | 'END' | 'CLB' | 'DSC' | 'NAV' | 'ARM';
export const STAT_KEYS: StatKey[] = ['SPD', 'END', 'CLB', 'DSC', 'NAV', 'ARM'];
export type RatingKey = StatKey | 'RACE';

export type Tier = 'bronze' | 'silver' | 'gold' | 'icon';
export type YearBand = 'Y7-8' | 'Y9-11' | 'Y12-13' | 'Staff';
export const YEAR_BANDS: YearBand[] = ['Y7-8', 'Y9-11', 'Y12-13', 'Staff'];

/** Scoring of a single performance. */
export interface PerfScore {
  perfId: string;
  athleteId: string;
  date: ISODate;
  kind: PerfKind;
  /** Ratings this performance counts toward (e.g. a verified 10 km race → ['RACE', 'END']). */
  feeds: RatingKey[];
  /** Unpenalised score 40–99 (RunScore, fixed-benchmark score, bleep rating or NAV score). Undefined = not scorable. */
  score?: number;
  /** Score after freshness decay. Undefined if expired or not scorable. */
  fresh?: number;
  penalty: number;
  monthsOld: number;
  /** Older than expireMonths: excluded from current ratings, kept in the Career Vault. */
  expired: boolean;
  /** Age-grade fraction (0.80 = 80%), when age-graded. */
  ageGrade?: number;
  /** Effective distance in km, when known. */
  dEff?: number;
  standardSec?: number;
  age: number;
  ageEstimated: boolean;
  provisional: boolean;
  /** Why the performance does not count, e.g. 'unverified', 'not a clean run', 'set this course's benchmark in Settings'. */
  unscoredReason?: string;
  configVersion: number;
}

export interface StatBasis {
  perfIds: string[];
  date?: ISODate;
  /** e.g. 'from bleep test, 10 Nov' or 'from 10 km, 12 Aug' */
  label: string;
}

export interface StatValue {
  key: RatingKey;
  locked: boolean;
  /** Displayed value (after freshness and Growth Shield). Never set when locked. */
  value?: number;
  /** Value before the Growth Shield. */
  current?: number;
  /** Highest unpenalised score in the shield window. */
  peak12m?: number;
  shielded: boolean;
  /** Short (≤ 3 words) unlock hint for the card, e.g. 'Run the Circuit'. Set when locked. */
  unlockHint?: string;
  /** One-line how-to-unlock for the coach view, e.g. 'Run Campus Circuit (verified) to unlock SPD.' */
  unlockHelp?: string;
  provisional: boolean;
  basis?: StatBasis;
  configVersion: number;
}

export interface RaceStat extends StatValue {
  key: 'RACE';
  /** Verified race and relay_leg performances (★). */
  caps: number;
  /** e.g. 'Hachimantai XC 4 km · 16:15' */
  bestRaceLine?: string;
  bestRacePerfId?: string;
}

export interface ArmLevels {
  ankle?: number;
  calf?: number;
  balance?: number;
  /** Domains with no level yet: 'ankle' | 'calf' | 'balance'. */
  missing: ('ankle' | 'calf' | 'balance')[];
}

export interface OvrValue {
  value?: number;
  /** Number of unlocked stats among the six. */
  unlocked: number;
  /** '71' or '—' */
  display: string;
}

export interface AthleteRatings {
  athleteId: string;
  configVersion: number;
  asOf: ISODate;
  ageNow: { age: number; estimated: boolean };
  stats: Record<StatKey, StatValue>;
  race: RaceStat;
  ovr: OvrValue;
  tier: Tier;
  /** e.g. 'Gold needs at least 1 race cap' when OVR would qualify but caps do not. */
  tierNote?: string;
  arm: ArmLevels;
  perfScores: PerfScore[];
  /** True when any displayed rating rests on a provisional table or formula. */
  provisionalAny: boolean;
}

export type StreakWeekState = 'counted' | 'holiday' | 'frozen' | 'missed' | 'current';

export interface StreakWeek {
  week: ISOWeek;
  state: StreakWeekState;
  /** A verified parkrun or long run in a holiday week. Adds a flame but does not change the count. */
  holidayBonus: boolean;
}

export interface StreakResult {
  athleteId: string;
  currentStreak: number;
  bestStreak: number;
  /** active: last counted week is this week or last week; frozen: streak held by a freeze; broken/none otherwise. */
  status: 'active' | 'frozen' | 'broken' | 'none';
  holidayBonusFlames: number;
  weeks: StreakWeek[];
}

export interface PersonalBest {
  /** Grouping key, e.g. 'course:<id>', 'dist:5.00', 'bleep', 'arm:ankle'. */
  key: string;
  /** e.g. 'Campus Circuit', '5 km', 'Bleep test' */
  label: string;
  athleteId: string;
  perfId: string;
  date: ISODate;
  /** 'time' (lower is better) or 'count' (higher is better, e.g. bleep laps, ARM measures). */
  measure: 'time' | 'count';
  value: number;
  previousBest?: number;
  previousPerfId?: string;
  /** Improvement as a positive number (seconds faster, or laps more). */
  improvement?: number;
}

export interface InFormEntry {
  athleteId: string;
  perfId: string;
  date: ISODate;
  /** 'raw' = PB on the same course/test/distance; 'score' = new best score for a stat. */
  type: 'raw' | 'score';
  label: string;
  /** e.g. 'PB −12 s' or 'SPD 71 → 74' */
  text: string;
  improvement?: number;
  stat?: RatingKey;
}

export interface SurgeResult {
  perfId: string;
  athleteId: string;
  eventId?: string;
  legNumber?: number;
  teamName?: string;
  legTimeSec: number;
  legDistanceKmEff?: number;
  /** Undefined when there is no baseline (show the leg time only). */
  predictedSec?: number;
  baselinePerfId?: string;
  rawPct?: number;
  /** Sanity-gate correction subtracted for this event (0 if the gate did not trigger). */
  gateCorrectionPct: number;
  pct?: number;
  medal?: 'bronze' | 'gold';
  noBaseline: boolean;
}

export type BadgeKind = 'caps' | 'parkrun' | 'distance' | 'mountain' | 'streak' | 'arm' | 'surge' | 'record' | 'expedition' | 'custom';

export interface Badge {
  /** Stable key, e.g. 'streak-8', 'distance-10k', 'record:<courseId>:F:Y9-11'. */
  key: string;
  kind: BadgeKind;
  label: string;
  /** Emoji or icon key for the badge row. */
  icon: string;
  date?: ISODate;
  perfId?: string;
  /** For counters (caps, parkruns). */
  count?: number;
  tier?: 'bronze' | 'gold';
}

export interface CourseRecord {
  courseId: string;
  sex: 'M' | 'F';
  band: YearBand;
  athleteId: string;
  perfId: string;
  timeSec: number;
  date: ISODate;
  yearGroupAtTime: YearGroup;
}

export interface HandicapRow {
  athleteId: string;
  pbSec?: number;
  /** Seconds after the first wave. */
  offsetSec: number;
  pbPerfId?: string;
}
