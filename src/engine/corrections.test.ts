import { describe, expect, it } from 'vitest';
import { correctPerformance, deletePerformance, makePerformance, restorePerformance, verifyPerformance } from './corrections';

const NOW = '2026-11-30T09:00:00.000Z';

describe('performance corrections (spec 4.6)', () => {
  const base = makePerformance({ athleteId: 'a1', date: '2026-11-29', kind: 'race', distanceKm: 4, timeSec: 985, rawInput: 'Aiko Testfield 16:25' }, 'p1', NOW);

  it('coach entries default to verified; form entries do not', () => {
    expect(base.verified).toBe(true);
    expect(base.source).toBe('coach');
    expect(base.history).toEqual([]);
    expect(makePerformance({ athleteId: 'a1', date: '2026-11-29', kind: 'parkrun', source: 'form' }, 'p2', NOW).verified).toBe(false);
  });

  it('a correction keeps history with before/after and reason, and keeps raw input', () => {
    const c = correctPerformance(base, { timeSec: 975 }, 'typo in results', 'Coach', '2026-12-01T00:00:00.000Z')!;
    expect(c.timeSec).toBe(975);
    expect(c.rawInput).toBe('Aiko Testfield 16:25');
    expect(c.history).toEqual([{ at: '2026-12-01T00:00:00.000Z', by: 'Coach', before: { timeSec: 985 }, after: { timeSec: 975 }, reason: 'typo in results' }]);
    expect(base.timeSec).toBe(985); // original object untouched
  });

  it('a no-op correction returns null', () => {
    expect(correctPerformance(base, { timeSec: 985 }, 'nothing', 'Coach', NOW)).toBeNull();
  });

  it('delete is soft and reversible, with history', () => {
    const d = deletePerformance(base, 'duplicate', 'Coach', NOW);
    expect(d.deleted).toBe(true);
    expect(d.history.at(-1)?.reason).toBe('duplicate');
    const r = restorePerformance(d, 'mistake', 'Coach', NOW);
    expect(r.deleted).toBe(false);
    expect(r.history).toHaveLength(2);
  });

  it('verifying records who ticked it', () => {
    const f = makePerformance({ athleteId: 'a1', date: '2026-08-10', kind: 'parkrun', source: 'form', timeSec: 1300 }, 'p3', NOW);
    const v = verifyPerformance(f, 'Coach', NOW);
    expect(v.verified).toBe(true);
    expect(v.history[0].after).toEqual({ verified: true });
  });
});
