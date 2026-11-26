// Shared helpers for reading performances: resolving course/event context and effective distance.
import type { Course, Performance, TasukiEvent } from '../types';

/** D_eff = (distanceKm + climbM / 100) × terrainFactor (ITRA km-effort convention, spec 3.3). */
export function effectiveDistance(distanceKm: number, climbM = 0, terrainFactor = 1): number {
  return (distanceKm + climbM / 100) * terrainFactor;
}

export interface PerfContext {
  perf: Performance;
  course?: Course;
  event?: TasukiEvent;
  distanceKm?: number;
  climbM: number;
  terrainFactor: number;
  /** Effective distance (km), when a distance is known. */
  dEff?: number;
}

export interface Lookup {
  courses: Map<string, Course>;
  events: Map<string, TasukiEvent>;
}

export function makeLookup(courses: Course[], events: TasukiEvent[]): Lookup {
  return { courses: new Map(courses.map((c) => [c.id, c])), events: new Map(events.map((e) => [e.id, e])) };
}

/**
 * Resolve where a performance was run. Course: performance.courseId, else the event's courseId.
 * Distance/climb: the performance's own values, else the course's, else the event's.
 * Terrain factor: the performance's, else the course's, else 1.00.
 * dEff is left undefined unless it is a positive, finite number (a terrain factor of 0 or a large
 * negative climb entered by mistake must not reach the standards table or a division).
 */
export function resolveContext(perf: Performance, lookup: Lookup): PerfContext {
  const event = perf.eventId ? lookup.events.get(perf.eventId) : undefined;
  const courseId = perf.courseId ?? event?.courseId;
  const course = courseId ? lookup.courses.get(courseId) : undefined;
  const distanceKm = perf.distanceKm ?? course?.distanceKm ?? event?.distanceKm;
  const climbM = perf.climbM ?? course?.climbM ?? event?.climbM ?? 0;
  const terrainFactor = perf.terrainFactor ?? course?.terrainFactor ?? 1;
  const raw = distanceKm != null && distanceKm > 0 ? effectiveDistance(distanceKm, climbM, terrainFactor) : undefined;
  const dEff = raw != null && Number.isFinite(raw) && raw > 0 ? raw : undefined;
  return { perf, course, event, distanceKm, climbM, terrainFactor, dEff };
}

/** Not soft-deleted. */
export function isLive(p: Performance): boolean {
  return !p.deleted;
}

/**
 * Live and verified: the only performances that count toward ratings, caps and badges. A White Season gym
 * session never counts here (it never feeds a rating, PB, cap, prediction or the ordinary streak): the White
 * Season engine (src/engine/white.ts) reads gym sessions with isGymSession instead.
 */
export function counts(p: Performance): boolean {
  return !p.deleted && p.verified && p.kind !== 'gym_session';
}

/** A live White Season gym session. */
export function isGymSession(p: Performance): boolean {
  return !p.deleted && p.kind === 'gym_session' && !!p.gym;
}

/** Names that mean a stopwatch effort, not a race: "550 m time trial", "TT", タイムトライアル, 記録会. */
const NOT_A_RACE = /time[\s-]*trial|\bTT\b|タイムトライアル|記録会|\btrial\b|\btraining\b|\bpractice\b/i;

/**
 * An official race: the event is marked official and is not a time trial, session or test (by its kind, or by
 * its name when a pasted table arrived as a "race"). Only these feed RACE and earn race caps.
 */
export function isOfficialRace(ev: TasukiEvent | undefined): boolean {
  if (!ev) return true;
  if (ev.official === false) return false;
  return !(ev.kind === 'time_trial' || ev.kind === 'session' || ev.kind === 'test' || NOT_A_RACE.test(ev.name ?? ''));
}

/**
 * Race caps ★: verified races and relay legs at official events. With a lookup, an unofficial event (a training
 * relay, a stopwatch time trial) earns no cap, and running two legs of one relay is one cap, not two.
 */
export function isRaceCap(p: Performance, lookup?: Lookup): boolean {
  if (!(counts(p) && (p.kind === 'race' || p.kind === 'relay_leg'))) return false;
  const ev = lookup && p.eventId ? lookup.events.get(p.eventId) : undefined;
  return isOfficialRace(ev);
}

/** One performance per capped event (the first, oldest first), plus every capped result with no event. */
export function raceCapPerfs(perfs: Performance[], lookup?: Lookup): Performance[] {
  const seen = new Set<string>();
  return [...perfs].sort(byDate).filter((p) => {
    if (!isRaceCap(p, lookup)) return false;
    if (!p.eventId) return true;
    if (seen.has(p.eventId)) return false;
    seen.add(p.eventId);
    return true;
  });
}

export function raceCaps(perfs: Performance[], lookup?: Lookup): number {
  return raceCapPerfs(perfs, lookup).length;
}

/** Performances whose time is a running result over a distance (for pace, PBs, END pathway, Surge baselines). */
export const TIMED_KINDS = ['race', 'relay_leg', 'parkrun', 'long_run', 'circuit', 'climb', 'descent', 'nav'] as const;

/** Sort helper: oldest first, then by createdAt, then id (deterministic). */
export function byDate(a: Performance, b: Performance): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const ca = a.createdAt ?? '';
  const cb = b.createdAt ?? '';
  if (ca !== cb) return ca < cb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
