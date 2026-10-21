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
 */
export function resolveContext(perf: Performance, lookup: Lookup): PerfContext {
  const event = perf.eventId ? lookup.events.get(perf.eventId) : undefined;
  const courseId = perf.courseId ?? event?.courseId;
  const course = courseId ? lookup.courses.get(courseId) : undefined;
  const distanceKm = perf.distanceKm ?? course?.distanceKm ?? event?.distanceKm;
  const climbM = perf.climbM ?? course?.climbM ?? event?.climbM ?? 0;
  const terrainFactor = perf.terrainFactor ?? course?.terrainFactor ?? 1;
  const dEff = distanceKm != null && distanceKm > 0 ? effectiveDistance(distanceKm, climbM, terrainFactor) : undefined;
  return { perf, course, event, distanceKm, climbM, terrainFactor, dEff };
}

/** Not soft-deleted. */
export function isLive(p: Performance): boolean {
  return !p.deleted;
}

/** Live and verified: the only performances that count toward ratings, caps and badges. */
export function counts(p: Performance): boolean {
  return !p.deleted && p.verified;
}

/** Race caps ★: verified race and relay_leg performances. */
export function isRaceCap(p: Performance): boolean {
  return counts(p) && (p.kind === 'race' || p.kind === 'relay_leg');
}

export function raceCaps(perfs: Performance[]): number {
  return perfs.filter(isRaceCap).length;
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
