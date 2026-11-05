import { describe, expect, it } from 'vitest';
import { cloneConfig, currentConfig, DEFAULT_CONFIG, GO_LIVE_MIGRATION, GO_LIVE_NOTE, goLiveMigration, nextConfigVersion, type Config } from './config';

/** A version 1 config as stored before go-live: the three markers on. */
function preGoLive(): Config {
  const c = cloneConfig(DEFAULT_CONFIG);
  c.end.bleepProvisional = true;
  c.nav.provisional = true;
  c.arm.provisional = true;
  return c;
}

describe('go-live migration (plan 2)', () => {
  it('defaults are not provisional', () => {
    expect([DEFAULT_CONFIG.end.bleepProvisional, DEFAULT_CONFIG.nav.provisional, DEFAULT_CONFIG.arm.provisional]).toEqual([false, false, false]);
  });

  it('a stored config with the markers on gets a new version with them off and a note', () => {
    const v1 = preGoLive();
    const v2 = goLiveMigration([v1], '2026-11-05T09:00:00.000Z')!;
    expect(v2).toBeDefined();
    expect(v2.version).toBe(2);
    expect(v2.note).toBe(GO_LIVE_NOTE);
    expect(v2.note).toBe('Go-live: provisional markers removed');
    expect(v2.migration).toBe(GO_LIVE_MIGRATION);
    expect(v2.createdAt).toBe('2026-11-05T09:00:00.000Z');
    expect([v2.end.bleepProvisional, v2.nav.provisional, v2.arm.provisional]).toEqual([false, false, false]);
    // Everything else is carried over from the coach's current version.
    expect({ ...v2, version: 0, createdAt: '', note: '', migration: undefined, end: null, nav: null, arm: null }).toEqual({ ...v1, version: 0, createdAt: '', note: '', migration: undefined, end: null, nav: null, arm: null });
    expect(v1.end.bleepProvisional).toBe(true); // the stored version is never rewritten
  });

  it('keeps the coach’s own edits and builds on the highest version', () => {
    const v1 = preGoLive();
    const draft = cloneConfig(v1);
    draft.runScore.anchorAG = 0.82;
    const v2 = nextConfigVersion(v1, draft, '2026-11-01T00:00:00.000Z', 'Raised anchor');
    const v3 = goLiveMigration([v1, v2], '2026-11-05T00:00:00.000Z')!;
    expect(v3.version).toBe(3);
    expect(v3.runScore.anchorAG).toBe(0.82);
  });

  it('does nothing when the markers are already off, when there is no config, or once it has run', () => {
    expect(goLiveMigration([cloneConfig(DEFAULT_CONFIG)], 'x')).toBeUndefined();
    expect(goLiveMigration([], 'x')).toBeUndefined();
    const v1 = preGoLive();
    const v2 = goLiveMigration([v1], 'x')!;
    // The coach turns the NAV marker back on later: the migration must not undo it.
    const draft = cloneConfig(v2);
    draft.nav.provisional = true;
    const v3 = nextConfigVersion(v2, draft, 'y', 'NAV provisional again');
    expect(v3.migration).toBeUndefined();
    expect(goLiveMigration([v1, v2, v3], 'z')).toBeUndefined();
    expect(currentConfig([v1, v2, v3]).nav.provisional).toBe(true);
  });

  it('a single marker still on is enough to migrate', () => {
    const c = cloneConfig(DEFAULT_CONFIG);
    c.arm.provisional = true;
    expect(goLiveMigration([c], 'x')?.arm.provisional).toBe(false);
  });
});
