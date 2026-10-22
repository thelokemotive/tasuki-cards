// A change set: the single way the UI modifies data. applyChanges is pure (used for the in-memory
// snapshot and for previews); persistChanges writes the same change set through the Store.
import type { AppMeta, Calendar, DataSnapshot } from '../types';
import { keyOf, TABLES, type Store, type TableMap, type TableName } from './Store';

export interface Changes {
  put?: { [K in TableName]?: TableMap[K][] };
  remove?: { [K in TableName]?: (string | number)[] };
  calendar?: Calendar;
  meta?: AppMeta;
}

export function applyChanges(s: DataSnapshot, ch: Changes): DataSnapshot {
  const next: DataSnapshot = { ...s };
  for (const t of TABLES) {
    const puts = ch.put?.[t] as TableMap[typeof t][] | undefined;
    const removes = ch.remove?.[t];
    if (!puts?.length && !removes?.length) continue;
    let list = [...(s[t] as TableMap[typeof t][])];
    if (removes?.length) {
      const drop = new Set(removes);
      list = list.filter((r) => !drop.has(keyOf(t, r)));
    }
    if (puts?.length) {
      const index = new Map(list.map((r, i) => [keyOf(t, r), i]));
      for (const row of puts) {
        const i = index.get(keyOf(t, row));
        if (i == null) {
          index.set(keyOf(t, row), list.length);
          list.push(row);
        } else list[i] = row;
      }
    }
    (next[t] as TableMap[typeof t][]) = list;
  }
  if (ch.calendar) next.calendar = ch.calendar;
  if (ch.meta) next.meta = ch.meta;
  return next;
}

export async function persistChanges(store: Store, ch: Changes): Promise<void> {
  for (const t of TABLES) {
    const removes = ch.remove?.[t];
    if (removes?.length) await store.remove(t, removes);
    const puts = ch.put?.[t] as TableMap[typeof t][] | undefined;
    if (puts?.length) await store.put(t, puts);
  }
  if (ch.calendar) await store.saveCalendar(ch.calendar);
  if (ch.meta) await store.saveMeta(ch.meta);
}

export function isEmptyChanges(ch: Changes): boolean {
  return !ch.calendar && !ch.meta && TABLES.every((t) => !ch.put?.[t]?.length && !ch.remove?.[t]?.length);
}

/** Merge several change sets (later puts of the same key win). */
export function combineChanges(...sets: Changes[]): Changes {
  const out: Changes = { put: {}, remove: {} };
  for (const ch of sets) {
    for (const t of TABLES) {
      const p = ch.put?.[t];
      if (p?.length) (out.put![t] as unknown[]) = [...((out.put![t] as unknown[]) ?? []), ...p];
      const r = ch.remove?.[t];
      if (r?.length) out.remove![t] = [...(out.remove![t] ?? []), ...r];
    }
    if (ch.calendar) out.calendar = ch.calendar;
    if (ch.meta) out.meta = ch.meta;
  }
  return out;
}
