// Default avatar components (spec 5). The default is generated deterministically from the athlete id;
// the coach can edit it on the athlete page. Nothing here is linked to any rating.
import type { Avatar } from '../types';
import { ACCESSORIES } from '../types';

/** Number of skin tones (indices 0..5). */
export const SKIN_TONES = 6;
/** Number of hair styles (indices 0..7). */
export const HAIR_STYLES = 8;
/** Number of hair colours (indices 0..5). */
export const HAIR_COLOURS = 6;

/** Kit palette: academy colours plus generic house colours (no real house names). */
export const KIT_COLOURS: { key: string; label: string; hex: string }[] = [
  { key: 'academy-navy', label: 'Academy navy', hex: '#1f3a6e' },
  { key: 'academy-red', label: 'Academy red', hex: '#b3202e' },
  { key: 'house-blue', label: 'House blue', hex: '#2f6fd0' },
  { key: 'house-green', label: 'House green', hex: '#2e8b4e' },
  { key: 'house-yellow', label: 'House yellow', hex: '#e2b81f' },
  { key: 'house-purple', label: 'House purple', hex: '#6d3fa6' },
  { key: 'house-orange', label: 'House orange', hex: '#e07a1f' },
  { key: 'house-teal', label: 'House teal', hex: '#1f9a9a' },
];

/** The kit colour every new default avatar wears (the academy's own colour). */
export const DEFAULT_KIT_COLOUR = 'academy-navy';

/**
 * 32-bit FNV-1a hash of a string (unsigned). Deterministic across browsers and runs.
 * hashString('') = 2166136261; hashString('a') = 3826002220.
 */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Small deterministic generator (mulberry32) so each component draws its own number from the seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Default avatar for an athlete id: the same id always gives the same avatar. Skin tone, hair style,
 * hair colour and accessory are drawn from the id; the kit is academy navy (the coach can change it to a
 * house colour). Accessories that are data-driven unlocks elsewhere (the headband) are still allowed here:
 * an accessory is cosmetic, while the streak headband is drawn separately by the avatar renderer.
 */
export function defaultAvatar(id: string): Avatar {
  const seed = hashString(id);
  const rand = mulberry32(seed);
  const pick = (n: number) => Math.floor(rand() * n) % n;
  return {
    seed,
    skinTone: pick(SKIN_TONES),
    hairStyle: pick(HAIR_STYLES),
    hairColour: pick(HAIR_COLOURS),
    kitColour: DEFAULT_KIT_COLOUR,
    accessory: ACCESSORIES[pick(ACCESSORIES.length)],
  };
}
