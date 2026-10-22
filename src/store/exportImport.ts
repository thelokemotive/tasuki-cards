// Export everything / Import (replace or merge), spec 9.
// The full export is a backup and includes coach-only fields such as DOB. It is never labelled
// "for printing"; printable outputs are built separately and never contain DOB.
import type { Calendar, DataSnapshot } from '../types';
import { SCHEMA_VERSION } from '../types';
import { withDefaults } from '../engine/config';
import { emptyCalendar, emptySnapshot, keyOf, TABLES, type TableMap, type TableName } from './Store';

export const EXPORT_APP_ID = 'tasuki-cards';
export const EXPORT_FORMAT = 1;

export interface ExportFile {
  app: typeof EXPORT_APP_ID;
  format: number;
  exportedAt: string;
  note: string;
  snapshot: DataSnapshot;
}

export function buildExport(snapshot: DataSnapshot, exportedAt: string): ExportFile {
  return {
    app: EXPORT_APP_ID,
    format: EXPORT_FORMAT,
    exportedAt,
    note: 'Tasuki Cards full backup (coach only: contains dates of birth). Not for printing or sharing.',
    snapshot,
  };
}

export function exportFileName(exportedAt: string): string {
  return `tasuki-cards-backup-${exportedAt.slice(0, 10)}.json`;
}

export class ImportError extends Error {}

/** Parse and validate an export file. Throws ImportError with a coach-readable message. */
export function parseExport(text: string): ExportFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ImportError('This file is not valid JSON. Choose a Tasuki Cards backup (.json).');
  }
  const f = raw as Partial<ExportFile>;
  if (!f || typeof f !== 'object' || f.app !== EXPORT_APP_ID || !f.snapshot) {
    throw new ImportError('This file is not a Tasuki Cards backup.');
  }
  if (typeof f.format !== 'number' || f.format > EXPORT_FORMAT) {
    throw new ImportError('This backup was made by a newer version of Tasuki Cards.');
  }
  return { ...(f as ExportFile), snapshot: normaliseSnapshot(f.snapshot) };
}

/** Fill missing tables/fields so older or partial snapshots load safely. */
export function normaliseSnapshot(s: Partial<DataSnapshot>): DataSnapshot {
  const base = emptySnapshot();
  const out: DataSnapshot = {
    ...base,
    ...s,
    schemaVersion: s.schemaVersion ?? SCHEMA_VERSION,
    calendar: { ...emptyCalendar(), ...(s.calendar ?? {}) },
    meta: { ...(s.meta ?? {}) },
  } as DataSnapshot;
  for (const t of TABLES) if (!Array.isArray(out[t])) (out[t] as unknown[]) = [];
  out.configs = out.configs.map((c) => withDefaults(c));
  return out;
}

export interface MergeSummary {
  added: Record<TableName, number>;
  updated: Record<TableName, number>;
}

/**
 * Merge an imported snapshot into the current one. Records are matched by id (configs by version):
 * new ids are added; for an id present in both, the imported record wins. Calendar entries are
 * unioned. App meta (backup dates, coach name) stays as it is on this laptop.
 */
export function mergeSnapshots(current: DataSnapshot, incoming: DataSnapshot): { merged: DataSnapshot; summary: MergeSummary } {
  const merged: DataSnapshot = JSON.parse(JSON.stringify(current)) as DataSnapshot;
  const added = {} as Record<TableName, number>;
  const updated = {} as Record<TableName, number>;
  for (const t of TABLES) {
    added[t] = 0;
    updated[t] = 0;
    const list = merged[t] as TableMap[typeof t][];
    const index = new Map(list.map((r, i) => [keyOf(t, r), i]));
    for (const row of incoming[t] as TableMap[typeof t][]) {
      const k = keyOf(t, row);
      const i = index.get(k);
      if (i == null) {
        index.set(k, list.length);
        list.push(row);
        added[t]++;
      } else if (JSON.stringify(list[i]) !== JSON.stringify(row)) {
        list[i] = row;
        updated[t]++;
      }
    }
  }
  merged.calendar = mergeCalendars(current.calendar, incoming.calendar);
  return { merged, summary: { added, updated } };
}

function mergeCalendars(a: Calendar, b: Calendar): Calendar {
  const weeks = [...new Set([...(a.holidayWeeks ?? []), ...(b.holidayWeeks ?? [])])].sort();
  const terms = new Map((a.halfTerms ?? []).map((h) => [h.id, h]));
  for (const h of b.halfTerms ?? []) terms.set(h.id, h);
  return { holidayWeeks: weeks, halfTerms: [...terms.values()].sort((x, y) => (x.start < y.start ? -1 : 1)) };
}

/** Stable, order-independent representation for "restores everything identically" checks. */
export function canonicalSnapshot(s: DataSnapshot): string {
  const sortRows = <K extends TableName>(t: K, rows: TableMap[K][]) =>
    [...rows].sort((x, y) => String(keyOf(t, x)).localeCompare(String(keyOf(t, y))));
  const sortKeys = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.keys(v as Record<string, unknown>)
          .sort()
          .map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]),
      );
    }
    return v;
  };
  const out: Record<string, unknown> = { schemaVersion: s.schemaVersion, calendar: s.calendar, meta: s.meta };
  for (const t of TABLES) out[t] = sortRows(t, s[t] as TableMap[typeof t][]);
  return JSON.stringify(sortKeys(out));
}
