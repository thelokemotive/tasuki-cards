// The installed app (website only): service worker, the Home Screen install prompt, and the red dot on the
// app icon. All feature-detected: on a phone or browser without one of these, nothing happens.
import { useEffect, useState } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

/** Called once at start-up: Chrome fires its install prompt early, before any screen has mounted. */
export function captureInstallPrompt(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    listeners.forEach((f) => f());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((f) => f());
  });
}

export function isStandalone(): boolean {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

export type Platform = 'ios' | 'android' | 'other';

export function platform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'other';
}

export function useInstallPrompt(): { canPrompt: boolean; prompt: () => Promise<boolean> } {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
  return {
    canPrompt: deferred != null,
    async prompt() {
      if (!deferred) return false;
      const e = deferred;
      deferred = null;
      await e.prompt();
      return (await e.userChoice).outcome === 'accepted';
    },
  };
}

/** The red dot on the Home Screen icon: on when this week is still open late in the week. */
export function updateAppBadge(on: boolean): void {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try {
    if (on) nav.setAppBadge?.(1)?.catch(() => undefined);
    else nav.clearAppBadge?.()?.catch(() => undefined);
  } catch {
    /* not supported */
  }
}

/** Website build only: the service worker that makes the app installable and open offline. */
export function registerServiceWorker(): void {
  if (!__WEB__ || typeof navigator === 'undefined' || !('serviceWorker' in navigator) || (location.protocol !== 'https:' && location.hostname !== 'localhost')) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => undefined);
  });
}
