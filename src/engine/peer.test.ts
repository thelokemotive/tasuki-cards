import { describe, expect, it } from 'vitest';
import { DEFAULT_PREDICT, exponentFor } from './predict';
import { JAPAN_ENDURANCE_R7, normalCdf, peerComparison } from './peer';

describe('national peer comparison (令和7年度 体力・運動能力調査)', () => {
  it('the normal CDF is accurate', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.6449)).toBeCloseTo(0.95, 3);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3);
  });
  it('running exactly the national average 1,500 m equivalent is the 50th percentile', () => {
    const [mean] = JAPAN_ENDURANCE_R7.M.byAge[15];
    const five = mean / Math.pow(1.5 / 5, exponentFor(15.5, 1.5, DEFAULT_PREDICT));
    expect(peerComparison(five, 15.5, 'M', DEFAULT_PREDICT)!.fasterThanPct).toBeCloseTo(50, 0);
  });
  it('a 20-minute 5K boy of 15 is faster than nearly everyone; a 37-minute girl is still compared fairly', () => {
    expect(peerComparison(1200, 15.6, 'M', DEFAULT_PREDICT)!.fasterThanPct).toBeGreaterThan(95);
    const g = peerComparison(37.5 * 60, 15.6, 'F', DEFAULT_PREDICT)!;
    expect(g.km).toBe(1);
    expect(g.fasterThanPct).toBeGreaterThan(1);
    expect(g.fasterThanPct).toBeLessThan(99.9);
  });
  it('no comparison outside the survey ages', () => {
    expect(peerComparison(1500, 11.5, 'M', DEFAULT_PREDICT)).toBeUndefined();
    expect(peerComparison(1500, 25, 'F', DEFAULT_PREDICT)).toBeUndefined();
  });
});
