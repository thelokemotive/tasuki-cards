// In-memory Store: used by tests, and as a fallback when IndexedDB is unavailable.
import type { AppMeta, Calendar, DataSnapshot } from '../types';
import { emptySnapshot, keyOf, TABLES, type Store, type TableMap, type TableName } from './Store';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export class MemoryStore implements Store {
  readonly kind = 'memory';
  private data: DataSnapshot;

  constructor(initial?: DataSnapshot) {
    this.data = initial ? clone(initial) : emptySnapshot();
  }

  async loadAll(): Promise<DataSnapshot> {
    return clone(this.data);
  }

  async put<K extends TableName>(table: K, rows: TableMap[K][]): Promise<void> {
    const list = this.data[table] as TableMap[K][];
    for (const row of rows) {
      const k = keyOf(table, row);
      const i = list.findIndex((r) => keyOf(table, r) === k);
      if (i >= 0) list[i] = clone(row);
      else list.push(clone(row));
    }
  }

  async remove<K extends TableName>(table: K, keys: (string | number)[]): Promise<void> {
    const drop = new Set(keys);
    (this.data[table] as TableMap[K][]) = (this.data[table] as TableMap[K][]).filter((r) => !drop.has(keyOf(table, r)));
  }

  async saveCalendar(calendar: Calendar): Promise<void> {
    this.data.calendar = clone(calendar);
  }

  async saveMeta(meta: AppMeta): Promise<void> {
    this.data.meta = clone(meta);
  }

  async replaceAll(snapshot: DataSnapshot): Promise<void> {
    this.data = clone(snapshot);
    for (const t of TABLES) if (!Array.isArray(this.data[t])) (this.data[t] as unknown[]) = [];
  }

  async clearAll(): Promise<void> {
    this.data = emptySnapshot();
  }
}

/** The website's view-only copy in memory: changes are never written anywhere. */
export class ViewOnlyStore extends MemoryStore {
  async persist(): Promise<void> {
    // view only
  }
}
