// All persistence goes through this interface (spec section 0), so a shared database can replace
// IndexedDB in Stage 3 without touching UI or engine code.
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

/** Record tables keyed by `id` (configs are keyed by `version`). */
export interface TableMap {
  athletes: Athlete;
  courses: Course;
  events: TasukiEvent;
  performances: Performance;
  participation: Participation;
  achievements: ManualAchievement;
  configs: Config;
}
export type TableName = keyof TableMap;
export const TABLES: TableName[] = ['athletes', 'courses', 'events', 'performances', 'participation', 'achievements', 'configs'];

export interface Store {
  /** e.g. 'indexeddb' or 'memory' */
  readonly kind: string;
  /** Load everything into memory (the data set is small: one academy). */
  loadAll(): Promise<DataSnapshot>;
  /** Insert or replace rows. */
  put<K extends TableName>(table: K, rows: TableMap[K][]): Promise<void>;
  /** Hard-remove rows by key. Used only for demo-data clearing and import-replace; performances are soft-deleted. */
  remove<K extends TableName>(table: K, keys: (string | number)[]): Promise<void>;
  saveCalendar(calendar: Calendar): Promise<void>;
  saveMeta(meta: AppMeta): Promise<void>;
  /** Replace the whole database with a snapshot (import "replace"). */
  replaceAll(snapshot: DataSnapshot): Promise<void>;
  /** Wipe everything. */
  clearAll(): Promise<void>;
  /** Optional: write a whole change set atomically (a shared database does this in one batch). */
  persist?(changes: import('./changes').Changes): Promise<void>;
  /** Optional: be told when the data changes elsewhere (another coach, another device). Returns unsubscribe. */
  subscribe?(onChange: (snapshot: DataSnapshot) => void): () => void;
}

export function emptyCalendar(): Calendar {
  return { holidayWeeks: [], halfTerms: [] };
}

export function emptySnapshot(): DataSnapshot {
  return {
    schemaVersion: SCHEMA_VERSION,
    athletes: [],
    courses: [],
    events: [],
    performances: [],
    participation: [],
    achievements: [],
    configs: [],
    calendar: emptyCalendar(),
    meta: {},
  };
}

export function keyOf<K extends TableName>(table: K, row: TableMap[K]): string | number {
  return table === 'configs' ? (row as Config).version : (row as { id: string }).id;
}
