// §10: the weekly Teams post. Fictional names only.
import { describe, expect, it } from 'vitest';
import { cloneConfig, DEFAULT_CONFIG } from './config';
import { fillTemplate, weeklyPost, type PostValues } from './weeklyPost';

const v: PostValues = { cardsWeek: 42, kmWeek: 23.1, kmTotal: 110, leg: 6, nextStation: 'Odawara', kmToNext: 18.3, thawCount: 2, thawNames: 'Aiko T., Ben C.' };

describe('weekly post', () => {
  it('fills the placeholders and rotates one template per week', () => {
    expect(fillTemplate('{cardsWeek} cards, {kmWeek} km, {kmToNext} km to {nextStation}', v)).toBe('42 cards, 23.1 km, 18.3 km to Odawara');
    const a = weeklyPost(v, 30, 0, DEFAULT_CONFIG)!;
    const b = weeklyPost(v, 30, 1, DEFAULT_CONFIG)!;
    expect(a.template).toBe(DEFAULT_CONFIG.winter.postTemplates[0]);
    expect(b.template).toBe(DEFAULT_CONFIG.winter.postTemplates[1]);
    expect(weeklyPost(v, 30, 6, DEFAULT_CONFIG)!.template).toBe(DEFAULT_CONFIG.winter.postTemplates[0]);
  });

  it('is at most 60 words, for every seeded template', () => {
    for (let i = 0; i < 6; i++) expect(weeklyPost(v, 30, i, DEFAULT_CONFIG)!.text.split(/\s+/).length).toBeLessThanOrEqual(60);
  });

  it('uses a total-km template when this week is lower than last week (or nothing was logged)', () => {
    const lower = weeklyPost({ ...v, cardsWeek: 20 }, 42, 0, DEFAULT_CONFIG)!;
    expect(lower.usedTotal).toBe(true);
    expect(lower.text).toContain('110 km');
    expect(lower.text).not.toContain('20');
    expect(weeklyPost({ ...v, cardsWeek: 0, kmWeek: 0 }, undefined, 0, DEFAULT_CONFIG)!.usedTotal).toBe(true);
  });

  it('skips Comeback Thaw templates in a week with no thaw, and never mentions who did not train', () => {
    const none = { ...v, thawCount: 0, thawNames: '' };
    for (let i = 0; i < 6; i++) {
      const p = weeklyPost(none, 30, i, DEFAULT_CONFIG)!;
      expect(p.text).not.toMatch(/Thaw/);
    }
    for (const t of [...DEFAULT_CONFIG.winter.postTemplates, ...DEFAULT_CONFIG.winter.postTotalTemplates]) expect(t).not.toMatch(/didn|missed|%|percent|only \{/i);
  });

  it('falls back to a shorter template when one would exceed the word limit', () => {
    const c = cloneConfig(DEFAULT_CONFIG);
    c.winter.postMaxWords = 25;
    const p = weeklyPost(v, 30, 0, c)!;
    expect(p.text.split(/\s+/).length).toBeLessThanOrEqual(25);
  });
});
