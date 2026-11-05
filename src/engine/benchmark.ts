// Fixed-benchmark courses set "against Mr Loke" (go-live plan 5): the coach runs a descent, says what that
// run should score (default 90), and the 99-point open times follow from the fixed-benchmark formula
// (spec 3.6) run backwards. The other sex's time comes from the ratio of the open standards at the
// fixed-benchmark reference distance and age (5 km, age 25: 834 / 769 s in the 2025 road tables).
import type { Athlete, ISODate, Sex } from '../types';
import type { Config } from './config';
import { ageOnDate } from './age';
import { formatLongDate } from './dates';
import { formatTime } from './format';
import { fixedAgeAdjustment, fixedBenchmarkScore } from './scoring';
import { standardTime } from './standards';

export interface ReferenceRun {
  athlete: Pick<Athlete, 'sex' | 'dob' | 'yearGroup' | 'yearGroupYear'>;
  /** Shown in the note ("Coach Example"). */
  athleteName: string;
  timeSec: number;
  date: ISODate;
  /** What the reference run should score (default 90). */
  targetScore?: number;
}

export interface ReferenceBenchmark {
  t99OpenM: number;
  t99OpenF: number;
  /** The reference athlete's age on the run date and the age adjustment used. */
  age: number;
  ageEstimated: boolean;
  ageAdj: number;
  /** Open women's 5 km standard ÷ open men's (834 / 769). */
  sexRatio: number;
  targetScore: number;
  /** What the reference run scores with the rounded benchmark (equals targetScore, give or take rounding). */
  check: number;
  /** One line for the course notes, so the benchmark is explainable. */
  note: string;
}

export const DEFAULT_REFERENCE_SCORE = 90;
export const BENCHMARK_NOTE_PREFIX = 'Benchmark from a reference run:';

/**
 * score = 99 × t99Open(sex) × ageAdj / time  ⇒  t99Open(sex) = score × time / (99 × ageAdj).
 * Undefined when the inputs cannot give a benchmark (no time, a score outside 40–99).
 */
export function benchmarkFromReference(ref: ReferenceRun, config: Config): ReferenceBenchmark | undefined {
  const target = ref.targetScore ?? DEFAULT_REFERENCE_SCORE;
  if (!(ref.timeSec > 0) || !Number.isFinite(ref.timeSec)) return undefined;
  if (!(target >= config.runScore.min && target <= config.runScore.max)) return undefined;
  const sex: Sex = ref.athlete.sex;
  const { age, estimated } = ageOnDate(ref.athlete, ref.date, config);
  if (!Number.isFinite(age)) return undefined;
  const ageAdj = fixedAgeAdjustment(age, sex, config);
  const own = (target * ref.timeSec) / (config.runScore.max * ageAdj);
  const { fixedReferenceAge: refAge, fixedReferenceKm: refKm } = config.age;
  const sexRatio = standardTime(refAge, 'F', refKm, config) / standardTime(refAge, 'M', refKm, config);
  const t99OpenM = Math.round(sex === 'M' ? own : own / sexRatio);
  const t99OpenF = Math.round(sex === 'F' ? own : own * sexRatio);
  const check = fixedBenchmarkScore(ref.timeSec, age, sex, sex === 'M' ? t99OpenM : t99OpenF, config);
  const other = sex === 'M' ? 'women' : 'men';
  const note = `${BENCHMARK_NOTE_PREFIX} ${ref.athleteName} ran ${formatTime(ref.timeSec)} on ${formatLongDate(ref.date)} (${sex}, age ${age.toFixed(1)}${estimated ? ', estimated' : ''}), set to score ${target}. 99-point open times ${formatTime(t99OpenM)} (men), ${formatTime(t99OpenF)} (women; ${other} from the open ${refKm} km standards ratio ${sexRatio.toFixed(4)}).`;
  return { t99OpenM, t99OpenF, age, ageEstimated: estimated, ageAdj, sexRatio, targetScore: target, check, note };
}

/** Course notes with the benchmark line replaced (any earlier reference-run line is removed). */
export function notesWithBenchmark(notes: string | undefined, note: string): string {
  const kept = (notes ?? '')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith(BENCHMARK_NOTE_PREFIX));
  return [...kept, note].join('\n');
}
