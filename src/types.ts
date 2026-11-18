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
  /** The Silly Lab: optional extras by slot (hat, face, mouth, held, buddy, feet, back, trail), by item key. */
  extras?: Partial<Record<'hat' | 'face' | 'mouth' | 'held' | 'buddy' | 'feet' | 'back' | 'trail', string>>;
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
  /**
   * false: a whole-school runner (e.g. from the Green Long Ducker), kept for matching and the field, not shown
   * as a squad member until they have raced in two different events. Absent or true: squad.
   */
  squad?: boolean;
  /** Family opted out of the website's pupil view: shown there only as "Hidden runner", with no card. */
  hiddenOnline?: boolean;
  /**
   * Coach-only: school sign-ins that have sent this runner's treadmill logs and been approved, so a log from
   * a different account for this card is flagged. Never published.
   */
  schoolAccounts?: string[];
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
  | 'arm'
  /** A session on a school treadmill, logged by the pupil from a photo of the console. Habit, not ratings. */
  | 'treadmill';
export const PERF_KINDS: PerfKind[] = ['race', 'relay_leg', 'parkrun', 'long_run', 'circuit', 'climb', 'descent', 'bleep', 'nav', 'arm', 'treadmill'];

export type PerfSource = 'coach' | 'paste' | 'voice' | 'form';

/**
 * One ARM test (THE ARMOURY). Since Nov 2026 each leg is kept (…L / …R) and the app works out the weaker side;
 * the single fields are the weaker side as typed (older records, or a paste with one number per test).
 */
export interface ArmMeasures {
  /** The Lunge: knee-to-wall, big toe to wall, cm (weaker side) */
  ankleCm?: number;
  ankleCmL?: number;
  ankleCmR?: number;
  /** The Wall: single-leg heel raises, 60 bpm, full height, clean reps (weaker side) */
  calfReps?: number;
  calfRepsL?: number;
  calfRepsR?: number;
  /** The Landing: furthest hop-and-stick rung held 2 of 3 tries, cm (weaker side). 0 = below the first rung. */
  hopCm?: number;
  hopCmL?: number;
  hopCmR?: number;
  /** Legacy (before Nov 2026): eyes-closed single-leg stance, seconds, and the old level-5 hop gate. */
  storkSec?: number;
  hopStickBothLegs?: boolean;
  /** Staff initials who checked the numbers. */
  verifiedBy?: string;
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
  // treadmill (climbM is worked out from the incline: distance × incline)
  inclinePct?: number;
  /** How hard it felt, 1 (very easy) to 10 (flat out): the pupil's own word, never a heart rate. */
  effort?: number;
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
export type ParticipationType = 'circuit' | 'saturday_run' | 'freeze' | 'top_up';

/** What a winter top-up session was. 'run' is outdoors; 'gym' is a coached gym session (e.g. Tuesday mornings). */
export type TopUpActivity = 'run' | 'treadmill' | 'gym' | 'armour' | 'ski';

export type SoreSpot = 'heel' | 'achilles' | 'calf' | 'shin' | 'knee' | 'hip' | 'foot' | 'other';

/**
 * A winter top-up session (Winter Mode). Logged by the pupil through a school form or by the coach.
 * It never feeds a rating, a PB or a prediction: treadmills are not calibrated and the entry is self-reported.
 */
export interface TopUp {
  activity: TopUpActivity;
  minutes: number;
  km?: number;
  /** Surges or strides at spring race pace were done in this session. */
  sharp?: boolean;
  /** 'photo': a photo of the treadmill or watch screen came with the form; 'coach': the coach saw it. */
  proof?: 'photo' | 'coach' | 'link' | 'none';
  /** Soreness or pain afterwards, 0–10. */
  soreness?: number;
  /** Where it is sore. Heel and knee matter most in growing pupils (Sever's, Osgood-Schlatter). */
  soreWhere?: SoreSpot;
  note?: string;
}

export interface Participation {
  id: string;
  athleteId: string;
  isoWeek: ISOWeek;
  type: ParticipationType;
  date: ISODate;
  /** Set when type is 'top_up'. */
  topUp?: TopUp;
  demo?: boolean;
}

/** A stretch of the winter: school holidays (no school runs) or the snow season (skiing, gym). */
export interface WinterPhase {
  id: string;
  name: string;
  start: ISODate;
  end: ISODate;
  kind: 'holiday' | 'snow';
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
  /** Winter Mode: the weeks in which top-up sessions keep the streak alive. Empty or absent: off. */
  winter?: WinterPhase[];
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
