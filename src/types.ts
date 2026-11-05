// Tasuki Cards data model (spec section 2). Raw inputs only: every rating is derived by src/engine.
// Names are never keys. Every record created by "Load demo data" carries demo: true.

export type Sex = 'M' | 'F';
export type YearGroup = 'Y7' | 'Y8' | 'Y9' | 'Y10' | 'Y11' | 'Y12' | 'Y13' | 'Staff';
export const YEAR_GROUPS: YearGroup[] = ['Y7', 'Y8', 'Y9', 'Y10', 'Y11', 'Y12', 'Y13', 'Staff'];
export type DisplayMode = 'full' | 'first_initial' | 'alias';

/** ISO date 'YYYY-MM-DD' (a calendar date in Asia/Tokyo). */
export type ISODate = string;
/** ISO timestamp, e.g. new Date().toISOString(). */
export type ISOTimestamp = string;
/** ISO week id 'YYYY-Www', weeks Monday–Sunday. */
export type ISOWeek = string;

export type Accessory = 'cap' | 'headband' | 'glasses' | 'none';
export const ACCESSORIES: Accessory[] = ['cap', 'headband', 'glasses', 'none'];

export interface Avatar {
  seed: number;
  /** 0..5 */
  skinTone: number;
  /** 0..7 */
  hairStyle: number;
  /** 0..5 */
  hairColour: number;
  /** key into the kit palette (src/ui/avatar/palette.ts), e.g. 'academy-navy' */
  kitColour: string;
  accessory: Accessory;
}

export interface Athlete {
  id: string;
  givenName: string;
  familyName: string;
  preferredName: string;
  /** Any script (romaji, kanji, katakana), any order, nicknames, typos learned from imports. */
  aliases: string[];
  sex: Sex;
  yearGroup: YearGroup;
  /**
   * Start year of the academic year the yearGroup refers to (2026 = Sept 2026–Aug 2027).
   * Used to estimate age for results from earlier years. Absent: the academic year of the as-of date.
   */
  yearGroupYear?: number;
  /** ISO date. Coach-only: never displayed on cards, boards or print exports. */
  dob?: ISODate;
  displayMode: DisplayMode;
  publicAlias?: string;
  /** Excluded from absolute boards; still appears on In-Form, Streak and Surge boards. */
  absoluteBoardOptOut: boolean;
  house?: string;
  avatar: Avatar;
  active: boolean;
  notes?: string;
  demo?: boolean;
  createdAt?: ISOTimestamp;
}

export type CourseKind = 'circuit' | 'climb' | 'descent' | 'nav' | 'race_course' | 'other';
export type BenchmarkMode = 'age_grade' | 'fixed';

export interface Course {
  id: string;
  name: string;
  kind: CourseKind;
  distanceKm: number;
  climbM: number;
  /** Default 1.00 */
  terrainFactor: number;
  benchmarkMode: BenchmarkMode;
  /** Fixed mode: 99-point open (18–30) standard in seconds. */
  t99OpenM?: number;
  t99OpenF?: number;
  version: number;
  notes?: string;
  demo?: boolean;
}

export type EventKind = 'race' | 'relay' | 'parkrun' | 'time_trial' | 'session' | 'test';

export interface CategoryWinner {
  category: string;
  /** Winning time for reference (outsiders are never stored as athletes, and their names are not kept). */
  timeSec: number;
}

/** Spec "Event". Named TasukiEvent to avoid clashing with the DOM Event type. */
export interface TasukiEvent {
  id: string;
  name: string;
  date: ISODate;
  kind: EventKind;
  courseId?: string;
  distanceKm?: number;
  climbM?: number;
  official: boolean;
  notes?: string;
  /** Total finishers including outsiders (non-roster competitors). */
  fieldSize?: number;
  categoryWinners?: CategoryWinner[];
  demo?: boolean;
}

export type PerfKind =
  | 'race'
  | 'relay_leg'
  | 'parkrun'
  | 'long_run'
  | 'circuit'
  | 'climb'
  | 'descent'
  | 'bleep'
  | 'nav'
  | 'arm';
export const PERF_KINDS: PerfKind[] = ['race', 'relay_leg', 'parkrun', 'long_run', 'circuit', 'climb', 'descent', 'bleep', 'nav', 'arm'];

export type PerfSource = 'coach' | 'paste' | 'voice' | 'form';

/** All measured on the weaker side. */
export interface ArmMeasures {
  /** Knee-to-wall, cm */
  ankleCm?: number;
  /** Single-leg heel raises, full range, steady tempo, capped count */
  calfReps?: number;
  /** Eyes-closed single-leg stance, seconds */
  storkSec?: number;
  hopStickBothLegs?: boolean;
}

export interface HistoryEntry {
  at: ISOTimestamp;
  by: string;
  before: Partial<Performance> | null;
  after: Partial<Performance> | null;
  reason: string;
}

export interface Performance {
  id: string;
  athleteId: string;
  eventId?: string;
  /** Course the result was run on. Resolution order: performance.courseId, then the event's courseId. */
  courseId?: string;
  date: ISODate;
  kind: PerfKind;
  distanceKm?: number;
  climbM?: number;
  /** Overrides the course terrainFactor when set. */
  terrainFactor?: number;
  timeSec?: number;
  place?: number;
  fieldSize?: number;
  category?: string;
  // relay
  legNumber?: number;
  teamName?: string;
  racedEarlierSameDay?: boolean;
  // bleep
  bleepLaps?: number;
  // nav
  navErrors?: number;
  navVariant?: string;
  routeKmEff?: number;
  // arm
  arm?: ArmMeasures;
  // descent
  cleanRun?: boolean;
  /** Coach entry defaults true; student-reported defaults false until the coach ticks it. */
  verified: boolean;
  source: PerfSource;
  /** The exact text the result came from (raw input is kept as entered). */
  rawInput: string;
  /** Corrections are never destructive. */
  history: HistoryEntry[];
  /** Soft delete: a deleted performance is kept (with history) but ignored by every calculation. */
  deleted?: boolean;
  createdAt?: ISOTimestamp;
  demo?: boolean;
}

/** Circuit performances count as participation automatically (derived, not stored). */
export type ParticipationType = 'circuit' | 'saturday_run' | 'freeze';

export interface Participation {
  id: string;
  athleteId: string;
  isoWeek: ISOWeek;
  type: ParticipationType;
  date: ISODate;
  demo?: boolean;
}

export interface HalfTerm {
  id: string;
  name: string;
  start: ISODate;
  end: ISODate;
}

export interface Calendar {
  /** Holiday weeks neither count toward nor break a streak. */
  holidayWeeks: ISOWeek[];
  /** One streak freeze allowed per half-term. */
  halfTerms: HalfTerm[];
}

export interface ManualAchievement {
  id: string;
  athleteId: string;
  type: 'expedition' | 'custom';
  name: string;
  date: ISODate;
  /** An emoji or short icon key. */
  icon: string;
  demo?: boolean;
}

export interface AppMeta {
  lastBackupAt?: ISOTimestamp;
  demoLoaded?: boolean;
  /** Who is recorded in correction history. */
  coachName?: string;
  /**
   * "Our school" names (Harrow, ハロウ, 安比, Appi): a pasted result whose club column contains one of these
   * is offered as a new athlete instead of being treated as an outsider.
   */
  ourSchoolNames?: string[];
}

/** Everything the app stores. Export/import uses exactly this shape. */
export interface DataSnapshot {
  schemaVersion: number;
  athletes: Athlete[];
  courses: Course[];
  events: TasukiEvent[];
  performances: Performance[];
  participation: Participation[];
  achievements: ManualAchievement[];
  /** Every config version ever applied; the current config is the highest version. */
  configs: import('./engine/config').Config[];
  calendar: Calendar;
  meta: AppMeta;
}

export const SCHEMA_VERSION = 1;
