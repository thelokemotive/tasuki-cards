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

  it('a store from before the evidence rules gets that version too, once', () => {
    const v1 = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    delete v1.ovr.evidence;
    delete v1.ageGrade.subMile;
    const first = withSeed({ ...emptySnapshot(), configs: [v1] }, '2026-11-16T00:00:00.000Z');
    expect(first.changes.put?.configs?.map((c) => c.migration)).toEqual(['evidence-2026-11']);
    expect(currentConfig(first.snapshot.configs).ovr.evidence.enabled).toBe(true);
    expect(withSeed(first.snapshot, '2026-11-17T00:00:00.000Z').changes.put?.configs).toBeUndefined();
  });

  it('year groups recorded for last year move up on load (a Y9 from the 2025 Long Ducker is Y10 now)', () => {
    const a = { id: 'a', givenName: 'Ben', familyName: 'Sampleton', preferredName: 'Ben', aliases: [], sex: 'M' as const, yearGroup: 'Y9' as const, yearGroupYear: 2025, displayMode: 'full' as const, absoluteBoardOptOut: false, avatar: { seed: 1, skinTone: 0, hairStyle: 0, hairColour: 0, kitColour: 'academy-navy', accessory: 'none' as const }, active: true };
    const first = withSeed({ ...emptySnapshot(), athletes: [a] }, '2026-11-16T00:00:00.000Z');
    expect(first.snapshot.athletes.map((x) => [x.yearGroup, x.yearGroupYear])).toEqual([['Y10', 2026]]);
    expect(first.changes.put?.athletes).toHaveLength(1);
    expect(withSeed(first.snapshot, '2026-11-17T00:00:00.000Z').changes.put?.athletes).toBeUndefined();
  });
});
