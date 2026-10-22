// IndexedDB persistence via Dexie (spec 9). Implements the Store interface; nothing else in the app
// touches IndexedDB directly.
import Dexie, { type Table } from 'dexie';
import type {
  AppMeta,
  Athlete,
  Calendar,
  Course,
  DataSnapshot,
  ManualAchievement,
  Participation,
  Performance,
  TasukiEvent,
} from '../types';
import { SCHEMA_VERSION } from '../types';
import type { Config } from '../engine/config';
import { emptyCalendar, TABLES, type Store, type TableMap, type TableName } from './Store';
import { MemoryStore } from './memoryStore';

interface KV {
  key: string;
  value: unknown;
}

class TasukiDB extends Dexie {
  athletes!: Table<Athlete, string>;
  courses!: Table<Course, string>;
  events!: Table<TasukiEvent, string>;
  performances!: Table<Performance, string>;
  participation!: Table<Participation, string>;
  achievements!: Table<ManualAchievement, string>;
  configs!: Table<Config, number>;
  kv!: Table<KV, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      athletes: 'id',
      courses: 'id',
      events: 'id, date',
      performances: 'id, athleteId, date, eventId',
      participation: 'id, athleteId, isoWeek',
      achievements: 'id, athleteId',
      configs: 'version',
      kv: 'key',
    });
  }
}

export class DexieStore implements Store {
  readonly kind = 'indexeddb';
  private db: TasukiDB;

  constructor(name = 'tasuki-cards') {
    this.db = new TasukiDB(name);
  }

  async open(): Promise<void> {
    await this.db.open();
  }

  private table<K extends TableName>(t: K): Table<TableMap[K], string | number> {
    return this.db.table(t) as Table<TableMap[K], string | number>;
  }

  async loadAll(): Promise<DataSnapshot> {
    return this.db.transaction('r', [...TABLES, 'kv'], async () => {
      const [athletes, courses, events, performances, participation, achievements, configs, calendarKV, metaKV] = await Promise.all([
        this.db.athletes.toArray(),
        this.db.courses.toArray(),
        this.db.events.toArray(),
        this.db.performances.toArray(),
        this.db.participation.toArray(),
        this.db.achievements.toArray(),
        this.db.configs.toArray(),
        this.db.kv.get('calendar'),
        this.db.kv.get('meta'),
      ]);
      return {
        schemaVersion: SCHEMA_VERSION,
        athletes,
        courses,
        events,
        performances,
        participation,
        achievements,
        configs,
        calendar: (calendarKV?.value as Calendar | undefined) ?? emptyCalendar(),
        meta: (metaKV?.value as AppMeta | undefined) ?? {},
      };
    });
  }

  async put<K extends TableName>(table: K, rows: TableMap[K][]): Promise<void> {
    if (rows.length) await this.table(table).bulkPut(rows);
  }

  async remove<K extends TableName>(table: K, keys: (string | number)[]): Promise<void> {
    if (keys.length) await this.table(table).bulkDelete(keys);
  }

  async saveCalendar(calendar: Calendar): Promise<void> {
    await this.db.kv.put({ key: 'calendar', value: calendar });
  }

  async saveMeta(meta: AppMeta): Promise<void> {
    await this.db.kv.put({ key: 'meta', value: meta });
  }

  async replaceAll(snapshot: DataSnapshot): Promise<void> {
    await this.db.transaction('rw', [...TABLES, 'kv'], async () => {
      for (const t of TABLES) {
        await this.table(t).clear();
        const rows = (snapshot[t] ?? []) as TableMap[typeof t][];
        if (rows.length) await this.table(t).bulkPut(rows);
      }
      await this.db.kv.clear();
      await this.db.kv.put({ key: 'calendar', value: snapshot.calendar ?? emptyCalendar() });
      await this.db.kv.put({ key: 'meta', value: snapshot.meta ?? {} });
    });
  }

  async clearAll(): Promise<void> {
    await this.db.transaction('rw', [...TABLES, 'kv'], async () => {
      for (const t of TABLES) await this.table(t).clear();
      await this.db.kv.clear();
    });
  }

  close(): void {
    this.db.close();
  }
}

/**
 * Open IndexedDB; if the browser refuses (private mode, blocked storage), fall back to an in-memory
 * store so the app still works, and report that nothing will survive a reload.
 */
export async function openStore(name = 'tasuki-cards'): Promise<{ store: Store; persistent: boolean; error?: string }> {
  try {
    if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is not available in this browser');
    const s = new DexieStore(name);
    await s.open();
    return { store: s, persistent: true };
  } catch (e) {
    return { store: new MemoryStore(), persistent: false, error: e instanceof Error ? e.message : String(e) };
  }
}
