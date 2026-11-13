import { describe, expect, it } from 'vitest';
import { canWear, EXTRA_SLOTS, EXTRAS_BY_SLOT, extraItem, sillyLabCombinations, surpriseMe } from './extras';

describe('the Silly Lab', () => {
  it('every slot has items, keys are unique, and the combinations run into the millions', () => {
    const keys = EXTRA_SLOTS.flatMap(({ slot }) => EXTRAS_BY_SLOT[slot].map((i) => i.key));
    expect(new Set(keys).size).toBe(keys.length);
    for (const { slot } of EXTRA_SLOTS) expect(EXTRAS_BY_SLOT[slot].length).toBeGreaterThanOrEqual(6);
    expect(sillyLabCombinations()).toBeGreaterThan(10_000_000);
  });
  it('earned items need the achievement; Surprise me only picks what can be worn', () => {
    const crown = extraItem('crown')!;
    expect(canWear(crown, undefined)).toBe(false);
    expect(canWear(extraItem('banana')!, undefined)).toBe(true);
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 50; i++) {
      const out = surpriseMe(undefined, rnd);
      for (const k of Object.values(out)) expect(extraItem(k)!.earn).toBeUndefined();
    }
  });
});
