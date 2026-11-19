// The small things that make a moment feel good: a chime made on the phone itself (Web Audio, no sound
// files to download), a short buzz where the phone supports it (Android; iPhones ignore it), and a switch
// to turn sound off. Everything respects "reduce motion" and fails silently.
import { readLocal, writeLocal } from './local';

const SOUND_KEY = 'tasuki.sound';

export function soundOn(): boolean {
  return readLocal(SOUND_KEY) !== 'off';
}

export function setSound(on: boolean): void {
  writeLocal(SOUND_KEY, on ? 'on' : 'off');
}

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** A soft plucked note: a sine with a little overtone, fast attack, long decay (like a koto string). */
function pluck(a: AudioContext, freq: number, at: number, gain = 0.16, len = 1.1) {
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  g.connect(a.destination);
  for (const [mult, level] of [
    [1, 1],
    [2, 0.28],
    [3, 0.08],
  ] as const) {
    const o = a.createOscillator();
    const og = a.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * mult, at);
    og.gain.value = level;
    o.connect(og).connect(g);
    o.start(at);
    o.stop(at + len + 0.05);
  }
}

// A rising phrase on the Japanese yo scale (D E G A B), so it sounds like the mountains, not a slot machine.
const YO = [293.66, 329.63, 392.0, 440.0, 493.88, 587.33, 659.25, 783.99, 880.0];

export type Chime = 'tap' | 'step' | 'moment' | 'big';

export function chime(kind: Chime): void {
  if (!soundOn()) return;
  const a = audio();
  if (!a) return;
  const t = a.currentTime + 0.02;
  if (kind === 'tap') pluck(a, YO[5], t, 0.07, 0.35);
  else if (kind === 'step') pluck(a, YO[6], t, 0.1, 0.6);
  else if (kind === 'moment') [YO[2], YO[4], YO[6]].forEach((f, i) => pluck(a, f, t + i * 0.09, 0.13));
  else [YO[0], YO[2], YO[3], YO[5], YO[7]].forEach((f, i) => pluck(a, f, t + i * 0.1, 0.15, 1.6));
}

export function buzz(pattern: number | number[]): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
  } catch {
    /* not supported */
  }
}

export function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
