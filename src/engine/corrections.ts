// Creating and correcting performances (spec 2 and 4.6). Corrections are never destructive: every
// edit or delete appends a history entry {at, by, before, after, reason}; a delete is a soft delete.
import type { HistoryEntry, ISOTimestamp, Performance, PerfSource } from '../types';

/** Fields a correction may change (identity and audit fields are excluded). */
export type PerformancePatch = Partial<Omit<Performance, 'id' | 'history' | 'createdAt' | 'source' | 'rawInput'>>;

const AUDIT_KEYS = new Set(['id', 'history', 'createdAt', 'source', 'rawInput']);

export interface NewPerformanceInput extends Omit<Performance, 'id' | 'verified' | 'history' | 'rawInput' | 'source' | 'createdAt'> {
  id?: string;
  verified?: boolean;
  source?: PerfSource;
  rawInput?: string;
}

/**
 * Build a new performance with defaults: coach entry is verified unless said otherwise; a 'form'
 * (student-reported) result defaults to unverified until the coach ticks it.
 */
export function makePerformance(input: NewPerformanceInput, id: string, now: ISOTimestamp): Performance {
  const source = input.source ?? 'coach';
  const p: Performance = {
    ...input,
    id: input.id ?? id,
    source,
    verified: input.verified ?? source !== 'form',
    rawInput: input.rawInput ?? '',
    history: [],
    createdAt: now,
  };
  // drop undefined keys so stored records stay clean and exports compare identically
  for (const k of Object.keys(p) as (keyof Performance)[]) if (p[k] === undefined) delete p[k];
  return p;
}

/** Only the fields that actually change, as before/after maps. */
export function diffPerformance(before: Performance, patch: PerformancePatch): { before: Partial<Performance>; after: Partial<Performance> } {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (AUDIT_KEYS.has(k)) continue;
    const old = (before as unknown as Record<string, unknown>)[k];
    if (JSON.stringify(old) !== JSON.stringify(v)) {
      b[k] = old;
      a[k] = v;
    }
  }
  return { before: b as Partial<Performance>, after: a as Partial<Performance> };
}

/** Apply a correction with a reason. Returns null if nothing changed. */
export function correctPerformance(p: Performance, patch: PerformancePatch, reason: string, by: string, at: ISOTimestamp): Performance | null {
  const { before, after } = diffPerformance(p, patch);
  if (Object.keys(after).length === 0) return null;
  const entry: HistoryEntry = { at, by, before, after, reason: reason.trim() || 'correction' };
  const next: Performance = { ...p, history: [...p.history, entry] };
  for (const [k, v] of Object.entries(after)) {
    if (v === undefined) delete (next as unknown as Record<string, unknown>)[k];
    else (next as unknown as Record<string, unknown>)[k] = v;
  }
  return next;
}

/** Soft delete with a reason (kept, with history; ignored by every calculation). */
export function deletePerformance(p: Performance, reason: string, by: string, at: ISOTimestamp): Performance {
  return correctPerformance(p, { deleted: true }, reason || 'deleted', by, at) ?? p;
}

/** Undo a soft delete. */
export function restorePerformance(p: Performance, reason: string, by: string, at: ISOTimestamp): Performance {
  return correctPerformance(p, { deleted: false }, reason || 'restored', by, at) ?? p;
}

/** Tick a student-reported result as verified. */
export function verifyPerformance(p: Performance, by: string, at: ISOTimestamp): Performance {
  return correctPerformance(p, { verified: true }, 'verified by coach', by, at) ?? p;
}
