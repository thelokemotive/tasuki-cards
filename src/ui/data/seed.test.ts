import { describe, expect, it } from 'vitest';
import { cloneConfig, currentConfig, DEFAULT_CONFIG } from '../../engine/config';
import { emptySnapshot } from '../../store/Store';
import { withSeed } from './DataContext';

describe('withSeed: first run and go-live migration on load', () => {
  it('an empty store gets version 1 with no provisional markers, and no migration', () => {
    const { snapshot } = withSeed(emptySnapshot());
    expect(snapshot.configs).toHaveLength(1);
    expect(currentConfig(snapshot.configs).nav.provisional).toBe(false);
  });

  it('a store from before go-live gets the go-live version, once', () => {
    const v1 = cloneConfig(DEFAULT_CONFIG);
    v1.end.bleepProvisional = true;
    v1.nav.provisional = true;
    v1.arm.provisional = true;
    const first = withSeed({ ...emptySnapshot(), configs: [v1] }, '2026-11-05T00:00:00.000Z');
    expect(first.changes.put?.configs?.map((c) => [c.version, c.note])).toEqual([[2, 'Go-live: provisional markers removed']]);
    expect(first.snapshot.configs).toHaveLength(2);
    const again = withSeed(first.snapshot);
    expect(again.changes.put?.configs).toBeUndefined();
  });
});
