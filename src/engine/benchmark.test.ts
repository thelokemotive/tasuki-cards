import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from './config';
import { benchmarkFromReference, notesWithBenchmark } from './benchmark';
import { fixedBenchmarkScore } from './scoring';

const cfg = DEFAULT_CONFIG;
const coach = { sex: 'M' as const, dob: '1986-05-01', yearGroup: 'Staff' as const };

describe('benchmark from a reference run (go-live plan 5)', () => {
  it('the reference run scores what the coach chose (default 90)', () => {
    const b = benchmarkFromReference({ athlete: coach, athleteName: 'Coach Example', timeSec: 300, date: '2026-11-04' }, cfg)!;
    expect(b.targetScore).toBe(90);
    expect(b.check).toBe(90);
    expect(b.age).toBeCloseTo(40.5, 1);
    expect(b.ageAdj).toBeGreaterThan(1); // a 40-year-old's standard is slower than the open one
    // t99 = 90 × 300 / (99 × ageAdj)
    expect(b.t99OpenM).toBe(Math.round((90 * 300) / (99 * b.ageAdj)));
  });

  it("the women's time follows the open 5 km standards ratio (834 / 769)", () => {
    const b = benchmarkFromReference({ athlete: coach, athleteName: 'C', timeSec: 300, date: '2026-11-04' }, cfg)!;
    expect(b.sexRatio).toBeCloseTo(834 / 769, 6);
    expect(b.t99OpenF).toBe(Math.round(((90 * 300) / (99 * b.ageAdj)) * (834 / 769)));
  });

  it('works from a woman too, and for any target score', () => {
    const b = benchmarkFromReference({ athlete: { sex: 'F', yearGroup: 'Staff' }, athleteName: 'Staff Runner', timeSec: 400, date: '2026-11-04', targetScore: 95 }, cfg)!;
    // staff without dob: age 30, so the adjustment is Std(30)/Std(25) at 5 km
    expect(b.ageEstimated).toBe(true);
    expect(b.t99OpenF).toBe(Math.round((95 * 400) / (99 * b.ageAdj)));
    expect(b.t99OpenM).toBe(Math.round(((95 * 400) / (99 * b.ageAdj)) / (834 / 769)));
    expect(fixedBenchmarkScore(400, b.age, 'F', b.t99OpenF, cfg)).toBe(95);
  });

  it('everyone else is scored against the coach with the usual age adjustment', () => {
    const b = benchmarkFromReference({ athlete: coach, athleteName: 'C', timeSec: 300, date: '2026-11-04' }, cfg)!;
    // A 25-year-old (no age allowance) who matches the 40-year-old coach's time scores less than 90;
    // an 11-year-old (a bigger allowance than the coach's) scores more.
    expect(fixedBenchmarkScore(300, 25, 'M', b.t99OpenM, cfg)).toBeLessThan(90);
    expect(fixedBenchmarkScore(300, 11, 'M', b.t99OpenM, cfg)).toBeGreaterThan(90);
  });

  it('the note explains the benchmark and replaces an older one', () => {
    const b = benchmarkFromReference({ athlete: coach, athleteName: 'Coach Example', timeSec: 300, date: '2026-11-04' }, cfg)!;
    expect(b.note).toMatch(/^Benchmark from a reference run: Coach Example ran 5:00 on 4 Nov 2026 \(M, age 40\.5\), set to score 90\. 99-point open times \d:\d\d \(men\), \d:\d\d \(women; women from the open 5 km standards ratio 1\.0845\)\.$/);
    const once = notesWithBenchmark('Steep, loose at the bottom', b.note);
    const twice = notesWithBenchmark(once, b.note.replace('5:00', '4:50'));
    expect(twice.split('\n')).toEqual(['Steep, loose at the bottom', b.note.replace('5:00', '4:50')]);
  });

  it('refuses inputs that cannot give a benchmark', () => {
    expect(benchmarkFromReference({ athlete: coach, athleteName: 'C', timeSec: 0, date: '2026-11-04' }, cfg)).toBeUndefined();
    expect(benchmarkFromReference({ athlete: coach, athleteName: 'C', timeSec: 300, date: '2026-11-04', targetScore: 120 }, cfg)).toBeUndefined();
  });
});
