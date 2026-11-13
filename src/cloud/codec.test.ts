import { describe, expect, it } from 'vitest';
import { buildDemoData } from '../demo/demoData';
import { applyChanges, type Changes } from '../store/changes';
import { emptySnapshot, TABLES } from '../store/Store';
import { BUCKETS, bucketOf, changesToPatches, docsToSnapshot, snapshotToDocs, type DocPatch } from './codec';

/** A fake of the shared database: merge patches into bucket documents the way the real store does. */
function applyPatches(docs: Map<string, Record<string, unknown>>, ch: Changes) {
  const { rows, meta } = changesToPatches(ch);
  for (const [id, patch] of rows) {
    const doc = docs.get(id) ?? { rows: {} };
    const r = { ...(doc.rows as DocPatch) };
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) delete r[k];
      else r[k] = v;
    }
    docs.set(id, { rows: r });
  }
  if (meta) docs.set('meta', { ...(docs.get('meta') ?? {}), ...meta });
}
const byId = <T extends { id?: string; version?: number }>(xs: T[]) => [...xs].sort((a, b) => String(a.id ?? a.version).localeCompare(String(b.id ?? b.version)));

describe('shared database layout', () => {
  const demo = { ...emptySnapshot(), ...buildDemoData('2026-11-13') };

  it('a whole snapshot survives the round trip', () => {
    const { rows, meta } = snapshotToDocs(demo);
    const docs = new Map<string, Record<string, unknown>>([...rows].map(([id, r]) => [id, { rows: r }]));
    docs.set('meta', meta);
    const back = docsToSnapshot(docs);
    for (const t of TABLES) expect(byId(back[t] as { id?: string }[])).toEqual(byId(demo[t] as { id?: string }[]));
    expect(back.calendar).toEqual(demo.calendar);
    expect(back.meta).toEqual(demo.meta);
  });

  it('change sets (put, replace, remove) give the same result as applying them in memory', () => {
    const docs = new Map<string, Record<string, unknown>>();
    applyPatches(docs, { put: Object.fromEntries(TABLES.map((t) => [t, demo[t]])), calendar: demo.calendar, meta: demo.meta });
    const a = demo.athletes[0];
    const ch: Changes = { put: { athletes: [{ ...a, house: 'Changed' }] }, remove: { performances: [demo.performances[0].id] } };
    applyPatches(docs, ch);
    const back = docsToSnapshot(docs);
    const want = applyChanges(demo, ch);
    expect(byId(back.athletes)).toEqual(byId(want.athletes));
    expect(back.performances).toHaveLength(demo.performances.length - 1);
  });

  it('buckets are stable and in range', () => {
    expect(bucketOf('performances', 'abc')).toBe(bucketOf('performances', 'abc'));
    for (const p of demo.performances) expect(bucketOf('performances', p.id)).toBeLessThan(BUCKETS.performances);
  });
});
