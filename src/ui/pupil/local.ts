// What a pupil's own phone remembers (and nothing else does): which card is theirs, their companion, what
// the app last showed them (for "what's new"), and sound on or off. Browser storage only, every access
// guarded: in a private window or with storage blocked the app still works and simply asks again.
import { useCallback, useEffect, useState } from 'react';
import type { SeenState } from '../../engine/moments';
import { isSpiritId, type SpiritId } from '../../engine/spirits';

/** Shared with the Log a run page, which has remembered the pupil's card since November 2026. */
export const MY_CARD_KEY = 'tasuki.myCard';
const CHANGE = 'tasuki-local-change';

export function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string | null): void {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: nothing is remembered, which is fine */
  }
  window.dispatchEvent(new CustomEvent(CHANGE, { detail: key }));
}

/** A remembered string, kept in step across components (and tabs). */
export function useLocal(key: string): [string | null, (v: string | null) => void] {
  const [value, setValue] = useState(() => readLocal(key));
  useEffect(() => {
    const on = (e: Event) => {
      const k = e instanceof StorageEvent ? e.key : (e as CustomEvent<string>).detail;
      if (k === key || k === null) setValue(readLocal(key));
    };
    window.addEventListener(CHANGE, on);
    window.addEventListener('storage', on);
    return () => {
      window.removeEventListener(CHANGE, on);
      window.removeEventListener('storage', on);
    };
  }, [key]);
  const set = useCallback((v: string | null) => writeLocal(key, v), [key]);
  return [value, set];
}

export function useMyCard(): [string, (id: string | null) => void] {
  const [id, set] = useLocal(MY_CARD_KEY);
  return [id ?? '', set];
}

export function useCompanion(athleteId: string): [SpiritId | null, (s: SpiritId) => void] {
  const [v, set] = useLocal(`tasuki.companion.${athleteId}`);
  return [isSpiritId(v) ? v : null, (s) => set(s)];
}

export function readSeen(athleteId: string): SeenState | undefined {
  const raw = readLocal(`tasuki.seen.${athleteId}`);
  if (!raw) return undefined;
  try {
    const s = JSON.parse(raw) as SeenState;
    return s && s.v === 1 ? s : undefined;
  } catch {
    return undefined;
  }
}

export function writeSeen(athleteId: string, s: SeenState): void {
  writeLocal(`tasuki.seen.${athleteId}`, JSON.stringify(s));
}

export function useDismissed(key: string): [boolean, () => void] {
  const [v, set] = useLocal(`tasuki.dismissed.${key}`);
  return [v === '1', () => set('1')];
}
