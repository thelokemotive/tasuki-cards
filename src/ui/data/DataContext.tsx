// App-wide data: the raw snapshot (from the Store), the derived ratings (pure engine), and commit()
// — the only way pages change data. Every commit autosaves through the Store.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DataSnapshot, ISODate } from '../../types';
import { currentConfig, DEFAULT_CONFIG, goLiveMigration, type Config } from '../../engine/config';
import { todayTokyo } from '../../engine/dates';
import { deriveAll, type Derived } from '../../engine/derive';
import { seedCourses } from '../../demo/demoData';
import type { Store } from '../../store/Store';
import { emptySnapshot } from '../../store/Store';
import { openStore } from '../../store/dexieStore';
import { MemoryStore } from '../../store/memoryStore';
import { applyChanges, isEmptyChanges, persistChanges, type Changes } from '../../store/changes';

export interface SaveState {
  pending: number;
  lastSavedAt?: string;
  error?: string;
}

export interface DataApi {
  ready: boolean;
  /** False when IndexedDB was unavailable and data lives only in memory. */
  persistent: boolean;
  storageError?: string;
  store: Store;
  snapshot: DataSnapshot;
  derived: Derived;
  config: Config;
  /** Real today (Asia/Tokyo). */
  today: ISODate;
  /** Date ratings are computed for (default today). */
  asOf: ISODate;
  setAsOf: (d: ISODate | null) => void;
  save: SaveState;
  /** Apply a change set to memory and persist it. Resolves when saved. */
  commit: (changes: Changes) => Promise<void>;
  /** Replace the whole database (import "replace", clear all). */
  replaceAll: (s: DataSnapshot) => Promise<void>;
}

const Ctx = createContext<DataApi | null>(null);

/**
 * First-run seed (the Campus Circuit course and config version 1), plus one-off migrations of stored
 * data (the go-live config version that removes the provisional markers).
 */
export function withSeed(s: DataSnapshot, now: string = new Date().toISOString()): { snapshot: DataSnapshot; changes: Changes } {
  const changes: Changes = { put: {} };
  if (s.configs.length === 0) changes.put!.configs = [DEFAULT_CONFIG];
  else {
    const goLive = goLiveMigration(s.configs, now);
    if (goLive) changes.put!.configs = [goLive];
  }
  if (s.courses.length === 0) changes.put!.courses = seedCourses();
  return { snapshot: applyChanges(s, changes), changes };
}

export function DataProvider({ children, storeOverride }: { children: ReactNode; storeOverride?: Store }) {
  const [store, setStore] = useState<Store>(() => storeOverride ?? new MemoryStore());
  const [ready, setReady] = useState(false);
  const [persistent, setPersistent] = useState(true);
  const [storageError, setStorageError] = useState<string | undefined>();
  const [snapshot, setSnapshot] = useState<DataSnapshot>(emptySnapshot);
  const snapRef = useRef(snapshot);
  const storeRef = useRef(store);
  const [save, setSave] = useState<SaveState>({ pending: 0 });
  const [asOfOverride, setAsOfOverride] = useState<ISODate | null>(null);
  const [today, setToday] = useState(() => todayTokyo());

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      let s: Store = storeOverride ?? store;
      if (!storeOverride) {
        const opened = await openStore();
        s = opened.store;
        if (!opened.persistent) {
          setPersistent(false);
          setStorageError(opened.error);
        }
      }
      const loaded = await s.loadAll();
      const { snapshot: seeded, changes } = withSeed(loaded);
      // A shared store acknowledges writes only once online, so the first-run seed is not awaited there.
      if (!isEmptyChanges(changes)) {
        const seeding = persistChanges(s, changes);
        if (s.subscribe) seeding.catch(() => undefined);
        else await seeding;
      }
      if (cancelled) return;
      if (s.subscribe) {
        unsubscribe = s.subscribe((remote) => {
          const next = withSeed(remote).snapshot;
          snapRef.current = next;
          setSnapshot(next);
        });
      }
      storeRef.current = s;
      setStore(s);
      snapRef.current = seeded;
      setSnapshot(seeded);
      setReady(true);
    })().catch((e) => {
      setStorageError(e instanceof Error ? e.message : String(e));
      setPersistent(false);
      setReady(true);
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Roll "today" over at midnight Tokyo time.
  useEffect(() => {
    const t = setInterval(() => setToday(todayTokyo()), 60_000);
    return () => clearInterval(t);
  }, []);

  const commit = useCallback(async (changes: Changes) => {
    if (isEmptyChanges(changes)) return;
    const next = applyChanges(snapRef.current, changes);
    snapRef.current = next;
    setSnapshot(next);
    setSave((v) => ({ ...v, pending: v.pending + 1, error: undefined }));
    try {
      await persistChanges(storeRef.current, changes);
      setSave((v) => ({ pending: v.pending - 1, lastSavedAt: new Date().toISOString() }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSave((v) => ({ ...v, pending: v.pending - 1, error: msg }));
      throw e;
    }
  }, []);

  const replaceAll = useCallback(async (s: DataSnapshot) => {
    // An imported backup from before go-live is migrated too (replaceAll stores the seeded snapshot).
    const { snapshot: seeded } = withSeed(s);
    snapRef.current = seeded;
    setSnapshot(seeded);
    setSave((v) => ({ ...v, pending: v.pending + 1, error: undefined }));
    try {
      await storeRef.current.replaceAll(seeded);
      setSave((v) => ({ pending: v.pending - 1, lastSavedAt: new Date().toISOString() }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSave((v) => ({ ...v, pending: v.pending - 1, error: msg }));
      throw e;
    }
  }, []);

  const asOf = asOfOverride ?? today;
  const config = useMemo(() => currentConfig(snapshot.configs), [snapshot.configs]);
  const derived = useMemo(() => deriveAll(snapshot, asOf, config), [snapshot, asOf, config]);

  const api: DataApi = {
    ready,
    persistent,
    storageError,
    store,
    snapshot,
    derived,
    config,
    today,
    asOf,
    setAsOf: setAsOfOverride,
    save,
    commit,
    replaceAll,
  };
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useData(): DataApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData must be used inside <DataProvider>');
  return v;
}
