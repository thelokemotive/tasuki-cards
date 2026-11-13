// How the data set is laid out in the shared database (pure, so it is unit-tested without Firebase).
// Each table is split into a fixed number of bucket documents; a bucket holds { rows: { key: JSON } }.
// One page load is about 45 document reads however large the squad grows, and a change touches
// only the rows it names, so two coaches entering results at once do not overwrite each other.
import type { DataSnapshot } from '../types';
import { SCHEMA_VERSION } from '../types';
import { emptySnapshot, keyOf, TABLES, type TableMap, type TableName } from '../store/Store';
import type { Changes } from '../store/changes';

/** Never change these once data exists: a row's bucket is derived from them. */
export const BUCKETS: Record<TableName, number> = {
  athletes: 4,
  courses: 1,
  events: 4,
  performances: 16,
  participation: 16,
  achievements: 2,
  configs: 1,
};
export const META_DOC = 'meta';

export function bucketOf(table: TableName, key: string | number): number {
  const s = String(key);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h % BUCKETS[table];
}
export const docId = (table: TableName, bucket: number): string => `${table}-${bucket}`;

/** Row JSON to write, or null to delete the row. */
export type DocPatch = Record<string, string | null>;
export interface MetaPatch {
  calendar?: string;
  meta?: string;
}

export function changesToPatches(ch: Changes): { rows: Map<string, DocPatch>; meta: MetaPatch | null } {
  const rows = new Map<string, DocPatch>();
  const patch = (t: TableName, key: string | number): DocPatch => {
    const id = docId(t, bucketOf(t, key));
    let p = rows.get(id);
    if (!p) rows.set(id, (p = {}));
    return p;
  };
  for (const t of TABLES) {
    for (const key of ch.remove?.[t] ?? []) patch(t, key)[String(key)] = null;
    for (const row of (ch.put?.[t] ?? []) as TableMap[typeof t][]) {
      const key = keyOf(t, row);
      patch(t, key)[String(key)] = JSON.stringify(row);
    }
  }
  const meta: MetaPatch = {};
  if (ch.calendar) meta.calendar = JSON.stringify(ch.calendar);
  if (ch.meta) meta.meta = JSON.stringify(ch.meta);
  return { rows, meta: ch.calendar || ch.meta ? meta : null };
}

/** Every bucket document for a whole snapshot (empty buckets included, so a replace clears them). */
export function snapshotToDocs(s: DataSnapshot): { rows: Map<string, Record<string, string>>; meta: Required<MetaPatch> } {
  const rows = new Map<string, Record<string, string>>();
  for (const t of TABLES) {
    for (let b = 0; b < BUCKETS[t]; b++) rows.set(docId(t, b), {});
    for (const row of s[t] as TableMap[typeof t][]) {
      const key = keyOf(t, row);
      rows.get(docId(t, bucketOf(t, key)))![String(key)] = JSON.stringify(row);
    }
  }
  return { rows, meta: { calendar: JSON.stringify(s.calendar), meta: JSON.stringify(s.meta) } };
}

export function docsToSnapshot(docs: Map<string, Record<string, unknown>>): DataSnapshot {
  const out = emptySnapshot();
  out.schemaVersion = SCHEMA_VERSION;
  for (const t of TABLES) {
    const list: unknown[] = [];
    for (let b = 0; b < BUCKETS[t]; b++) {
      const rows = (docs.get(docId(t, b))?.rows ?? {}) as Record<string, unknown>;
      for (const k of Object.keys(rows).sort()) {
        const v = rows[k];
        if (typeof v === 'string') list.push(JSON.parse(v));
      }
    }
    if (t === 'configs') (list as { version: number }[]).sort((a, b) => a.version - b.version);
    (out[t] as unknown[]) = list;
  }
  const meta = docs.get(META_DOC);
  if (typeof meta?.calendar === 'string') out.calendar = JSON.parse(meta.calendar);
  if (typeof meta?.meta === 'string') out.meta = JSON.parse(meta.meta);
  return out;
}
