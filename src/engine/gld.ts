// The Green Long Ducker: the school's hill race, three courses by section (measured by the coach).
// Its results are places only, so it is not scored; it gets courses (for the climb and for predictions)
// and a predicted time for every squad runner with a Next-5K prediction.
import type { Course, DataSnapshot, ISODate, TasukiEvent, YearGroup } from '../types';
import type { Config } from './config';
import type { AthleteDerived } from './derive';
import { exponentFor } from './predict';
import { yearGroupOn } from './display';

export const GLD_COURSES: Course[] = [
  { id: 'course-gld-prep', name: 'Green Long Ducker (Prep, Y7–8)', kind: 'race_course', distanceKm: 3.0, climbM: 148.5, terrainFactor: 1, benchmarkMode: 'age_grade', version: 1, notes: '3,000 m with a 1,389 m climb from about 683 m to 831.5 m (~10.7%), then flatter return terrain.' },
  { id: 'course-gld-senior', name: 'Green Long Ducker (Senior, Y9–11)', kind: 'race_course', distanceKm: 3.535, climbM: 526.4, terrainFactor: 1, benchmarkMode: 'age_grade', version: 1, notes: 'Point-to-point climb from 758 m to the 1,284.4 m summit (14.9% average; steepest just past halfway).' },
  { id: 'course-gld-sixth', name: 'Green Long Ducker (Sixth Form)', kind: 'race_course', distanceKm: 4.497, climbM: 658.4, terrainFactor: 1, benchmarkMode: 'age_grade', version: 1, notes: 'Point-to-point climb from 626 m to the 1,284.4 m summit (14.6% average; steepest between ~2.5 and 3.4 km).' },
];

export const isGld = (name: string): boolean => /green\s*long\s*ducker|\bgld\b/i.test(name);

/** The course for a Long Ducker race name ("… junior girls", "… Y8 boys", "… sixth form boys"). */
export function gldCourseFor(name: string): Course | undefined {
  if (!isGld(name)) return undefined;
  if (/sixth/i.test(name)) return GLD_COURSES[2];
  if (/junior|prep|\bY[78]\b/i.test(name)) return GLD_COURSES[0];
  if (/senior|\bY(9|10|11)\b/i.test(name)) return GLD_COURSES[1];
  return undefined;
}

/** One-off additions to stored data: the three courses, and every Long Ducker event linked to its course. */
export function gldMigration(s: DataSnapshot): { courses: Course[]; events: TasukiEvent[] } {
  const courses = GLD_COURSES.filter((c) => !s.courses.some((x) => x.id === c.id));
  const events = s.events.filter((e) => !e.courseId && gldCourseFor(e.name)).map((e) => ({ ...e, courseId: gldCourseFor(e.name)!.id }));
  return { courses, events };
}

/** Which Long Ducker course a runner races on a date (by year group then). */
export function gldCourseForYear(y: YearGroup): Course | undefined {
  if (y === 'Staff') return undefined;
  const n = Number(y.slice(1));
  return n <= 8 ? GLD_COURSES[0] : n <= 11 ? GLD_COURSES[1] : GLD_COURSES[2];
}

export interface GldPrediction {
  course: Course;
  timeSec: number;
  /** Rank among squad runners of the same sex on the same course (1 = fastest predicted). */
  squadRank?: number;
  squadOf?: number;
}

/** Predicted Long Ducker time from the Next-5K prediction: T5 × (Deff ÷ 5)^b, Deff = distance + climb ÷ 100. */
export function predictGld(d: AthleteDerived, config: Config, asOf: ISODate): GldPrediction | undefined {
  const t5 = d.prediction?.predictedSec;
  const course = gldCourseForYear(yearGroupOn(d.athlete, asOf, config, asOf));
  if (t5 == null || !course) return undefined;
  const cfg = config.predict;
  const dEff = (course.distanceKm ?? 0) + Math.max(0, course.climbM ?? 0) / 100;
  const b = exponentFor(d.ratings.ageNow.age, Math.min(dEff, cfg.targetKm), cfg);
  return { course, timeSec: t5 * Math.pow(dEff / cfg.targetKm, b) };
}

/** Predictions for the whole squad, ranked within each course and sex. */
export function predictGldAll(all: AthleteDerived[], config: Config, asOf: ISODate): Map<string, GldPrediction> {
  const out = new Map<string, GldPrediction>();
  for (const d of all) {
    if (!d.athlete.active || d.athlete.yearGroup === 'Staff') continue;
    const p = predictGld(d, config, asOf);
    if (p) out.set(d.athlete.id, p);
  }
  const groups = new Map<string, string[]>();
  for (const [id, p] of out) {
    const sex = all.find((d) => d.athlete.id === id)!.athlete.sex;
    const k = `${p.course.id}|${sex}`;
    groups.set(k, [...(groups.get(k) ?? []), id]);
  }
  for (const ids of groups.values()) {
    ids.sort((a, b) => out.get(a)!.timeSec - out.get(b)!.timeSec);
    ids.forEach((id, i) => Object.assign(out.get(id)!, { squadRank: i + 1, squadOf: ids.length }));
  }
  return out;
}
