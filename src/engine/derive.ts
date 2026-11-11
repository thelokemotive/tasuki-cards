// The engine's single entry point for the UI: every derived value for every athlete, from raw inputs
// + one config version. Pure and deterministic: the same snapshot, asOf and config give the same result.
import type { Athlete, DataSnapshot, ISODate, Participation, Performance } from '../types';
import { currentConfig, type Config } from './config';
import type { AthleteRatings, Badge, CourseRecord, InFormEntry, PersonalBest, RatingKey, StreakResult, SurgeResult } from './types';
import { STAT_KEYS } from './types';
import { byDate, makeLookup, type Lookup } from './perf';
import { computeStreak } from './streak';
import { computeAthleteRatings } from './stats';
import { computeSurges } from './surge';
import { computeCourseRecords, computeInForm, computePersonalBests } from './pbs';
import { badgeRow, computeBadges } from './badges';
import { computeAvatarUnlocks, type AvatarUnlocks } from './avatarUnlocks';
import { predictFiveK, type Prediction } from './predict';

/** Badges shown on the card's badge row (spec 5: "badge row (up to 5 icons)"). */
export const CARD_BADGE_ROW = 5;

export interface AthleteDerived {
  athlete: Athlete;
  /** All of this athlete's performances (including deleted and unverified ones), oldest first. */
  perfs: Performance[];
  ratings: AthleteRatings;
  streak: StreakResult;
  /** Standing PB on each course, distance, test and ARM measure (all-time, expired results included). */
  pbs: PersonalBest[];
  /** Every PB-setting result, oldest first. */
  pbHistory: PersonalBest[];
  /** PBs in the last config.inForm.days days; inForm[0] is the card's headline. */
  inForm: InFormEntry[];
  badges: Badge[];
  /** Up to 5 badges for the card, most prestigious first. */
  badgeRow: Badge[];
  /** This athlete's relay legs (with or without a baseline), oldest first. */
  surges: SurgeResult[];
  avatarUnlocks: AvatarUnlocks;
  /** Next-5K prediction and targets; undefined with no usable timed result. */
  prediction?: Prediction;
}

export interface Derived {
  asOf: ISODate;
  config: Config;
  /** Version of the config every rating here was computed with. */
  configVersion: number;
  lookup: Lookup;
  /** Every athlete (active and inactive), in roster order. */
  athletes: Map<string, AthleteDerived>;
  /** Every counted relay leg on or before asOf, oldest first. */
  surges: SurgeResult[];
  courseRecords: CourseRecord[];
}

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = out.get(k);
    if (list) list.push(r);
    else out.set(k, [r]);
  }
  return out;
}

/**
 * Derive everything as of `asOf`. Config = configOverride ?? the highest stored config version.
 * Order: lookup → per athlete streak → ratings (Growth Shield on when the streak is active or frozen)
 * → surges (all athletes; the sanity gate needs every leg of an event) → course records (all)
 * → per athlete PBs, In-Form (from the ratings' perfScores), badges and avatar unlocks.
 * Performances of athletes not on the roster are ignored, and results dated after asOf never count.
 */
export function deriveAll(snapshot: DataSnapshot, asOf: ISODate, configOverride?: Config): Derived {
  const config = configOverride ?? currentConfig(snapshot.configs);
  const lookup = makeLookup(snapshot.courses, snapshot.events);
  const roster = new Set(snapshot.athletes.map((a) => a.id));
  const perfs = snapshot.performances.filter((p) => roster.has(p.athleteId)).sort(byDate);
  const perfsBy = groupBy(perfs, (p) => p.athleteId);
  const partBy = groupBy<Participation>(snapshot.participation, (q) => q.athleteId);
  const calendar = snapshot.calendar ?? { holidayWeeks: [], halfTerms: [] };

  const base = snapshot.athletes.map((athlete) => {
    const own = perfsBy.get(athlete.id) ?? [];
    const streak = computeStreak({ athleteId: athlete.id, perfs: own, participation: partBy.get(athlete.id) ?? [], calendar, config, asOf, lookup });
    const ratings = computeAthleteRatings({
      athlete,
      perfs: own,
      lookup,
      config,
      asOf,
      streakActiveOrFrozen: streak.status === 'active' || streak.status === 'frozen',
    });
    return { athlete, own, streak, ratings };
  });

  const surges = computeSurges({ perfs: perfs.filter((p) => p.date <= asOf), lookup, config });
  const surgesBy = groupBy(surges, (s) => s.athleteId);
  const courseRecords = computeCourseRecords({ athletes: snapshot.athletes, perfs, lookup, config, asOf });

  const athletes = new Map<string, AthleteDerived>();
  for (const { athlete, own, streak, ratings } of base) {
    const upToDate = own.filter((p) => p.date <= asOf);
    const { current, history } = computePersonalBests(upToDate, lookup);
    const inForm = computeInForm({ athleteId: athlete.id, perfs: own, perfScores: ratings.perfScores, lookup, config, asOf });
    const mySurges = surgesBy.get(athlete.id) ?? [];
    const badges = computeBadges({ athlete, perfs: own, lookup, config, asOf, streak, surges: mySurges, courseRecords, achievements: snapshot.achievements });
    athletes.set(athlete.id, {
      athlete,
      perfs: own,
      ratings,
      streak,
      pbs: current,
      pbHistory: history,
      inForm,
      badges,
      badgeRow: badgeRow(badges, CARD_BADGE_ROW),
      surges: mySurges,
      avatarUnlocks: computeAvatarUnlocks(ratings, streak, mySurges, config),
      prediction: predictFiveK(athlete, own, lookup, config, asOf),
    });
  }

  return { asOf, config, configVersion: config.version, lookup, athletes, surges, courseRecords };
}

export interface RatingChange {
  athleteId: string;
  stat: RatingKey | 'OVR';
  /** Undefined = locked (or no OVR) before. */
  before?: number;
  /** Undefined = locked (or no OVR) after. */
  after?: number;
  /** after − before when both are numbers; 0 when the stat locks or unlocks. */
  delta: number;
}

const DIFF_KEYS: (RatingKey | 'OVR')[] = ['RACE', ...STAT_KEYS, 'OVR'];

function ratingValue(r: AthleteRatings | undefined, key: RatingKey | 'OVR'): number | undefined {
  if (!r) return undefined;
  if (key === 'OVR') return r.ovr.value;
  const s = key === 'RACE' ? r.race : r.stats[key];
  return s.locked ? undefined : s.value;
}

/**
 * Every displayed rating that differs between two derivations (for the Settings impact preview:
 * "14 ratings change; largest +4 for …"). Includes stats that lock or unlock (delta 0). Sorted by the
 * size of the change (largest first), then athlete id, then RACE, SPD … ARM, OVR.
 */
export function diffRatings(before: Derived, after: Derived): RatingChange[] {
  const ids = [...new Set([...before.athletes.keys(), ...after.athletes.keys()])];
  const out: RatingChange[] = [];
  for (const athleteId of ids) {
    const rb = before.athletes.get(athleteId)?.ratings;
    const ra = after.athletes.get(athleteId)?.ratings;
    for (const stat of DIFF_KEYS) {
      const b = ratingValue(rb, stat);
      const a = ratingValue(ra, stat);
      if (a === b) continue;
      out.push({ athleteId, stat, before: b, after: a, delta: a != null && b != null ? a - b : 0 });
    }
  }
  return out.sort(
    (x, y) =>
      Math.abs(y.delta) - Math.abs(x.delta) ||
      (x.athleteId < y.athleteId ? -1 : x.athleteId > y.athleteId ? 1 : 0) ||
      DIFF_KEYS.indexOf(x.stat) - DIFF_KEYS.indexOf(y.stat),
  );
}
