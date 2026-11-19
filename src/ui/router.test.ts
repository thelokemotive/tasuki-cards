import { describe, expect, it } from 'vitest';
import { parseHash } from './router';

describe('prepared Paste & Match links', () => {
  it('carry a whole block of line format, headers and new lines included', () => {
    const block = '# test: arm | 2026-11-19 | note Season 0? yes\nKit Fictional ankle 12/9 calf 40/40 throne 3/2 height 172\nRio Placeholder ankle 8/9';
    const r = parseHash(`#/paste?text=${encodeURIComponent(block)}`);
    expect(r.page).toBe('paste');
    expect(r.query.get('text')).toBe(block);
  });
});
