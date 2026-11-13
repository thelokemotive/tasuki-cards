// The Silly Lab: stackable avatar extras in eight slots, drawn in the same flat style as the runner
// (viewBox 0 0 100 130; head centre 50,29 r 16.5; eyes 43.5/56.5,32; mouth 50,40; front hand 36,76;
// feet near y 120; the runner faces left, so trails go out to the right). Most items are free; a few are
// earned (shown with how to earn them). All original drawings.
import type { ReactNode } from 'react';
import type { AthleteDerived } from '../../engine/derive';

export type ExtraSlot = 'hat' | 'face' | 'mouth' | 'held' | 'buddy' | 'feet' | 'back' | 'trail';
export const EXTRA_SLOTS: { slot: ExtraSlot; label: string }[] = [
  { slot: 'hat', label: 'Hat' },
  { slot: 'face', label: 'Face' },
  { slot: 'mouth', label: 'Mouth' },
  { slot: 'held', label: 'Holding' },
  { slot: 'buddy', label: 'Running buddy' },
  { slot: 'feet', label: 'Feet' },
  { slot: 'back', label: 'On the back' },
  { slot: 'trail', label: 'Trail' },
];

export type AvatarExtras = Partial<Record<ExtraSlot, string>>;

/** Where each slot's items sit on the 100 × 130 avatar, for zoomed picker thumbnails. */
export const SLOT_VIEWBOX: Record<ExtraSlot, string> = {
  hat: '22 -14 56 44',
  face: '30 18 40 34',
  mouth: '38 30 24 20',
  held: '14 34 46 56',
  buddy: '-2 92 34 36',
  feet: '8 106 84 26',
  back: '52 0 52 104',
  trail: '60 36 46 76',
};

export interface ExtraItem {
  key: string;
  slot: ExtraSlot;
  label: string;
  draw: () => ReactNode;
  /** Earned items: how to earn it, and whether this runner has. */
  earn?: { how: string; test: (d: AthleteDerived) => boolean };
}

const K = '#22232c';

const ITEMS: ExtraItem[] = [
  // ---------------- hats ----------------
  { key: 'onigiri', slot: 'hat', label: 'Onigiri hat', draw: () => (<g><path d="M50 -2 L70 22 Q50 26 30 22 Z" fill="#fbfbf6" stroke="#c9c6b8" strokeWidth="0.8" strokeLinejoin="round" /><rect x="42" y="13" width="16" height="10" rx="1" fill="#1f3326" /></g>) },
  { key: 'kabuto', slot: 'hat', label: 'Samurai kabuto', draw: () => (<g><path d="M31 25 Q31 7 50 6 Q69 7 69 25 Z" fill="#2b2f45" /><path d="M29 25 L71 25 L74 30 L26 30 Z" fill="#3a4060" /><path d="M50 10 Q36 0 30 -8 Q42 -2 50 6 Q58 -2 70 -8 Q64 0 50 10 Z" fill="#e9c75a" stroke="#a8841c" strokeWidth="0.7" /><circle cx="50" cy="12" r="2.6" fill="#d4442a" /></g>) },
  { key: 'frog', slot: 'hat', label: 'Frog hat', draw: () => (<g><path d="M32 25 Q32 8 50 8 Q68 8 68 25 Z" fill="#5cb85c" /><circle cx="40" cy="8" r="6" fill="#5cb85c" /><circle cx="60" cy="8" r="6" fill="#5cb85c" /><circle cx="40" cy="7" r="3.4" fill="#fff" /><circle cx="60" cy="7" r="3.4" fill="#fff" /><circle cx="40.6" cy="7.4" r="1.8" fill={K} /><circle cx="60.6" cy="7.4" r="1.8" fill={K} /><path d="M42 20 Q50 24 58 20" stroke="#2e7d32" strokeWidth="1.2" fill="none" /></g>) },
  { key: 'cone', slot: 'hat', label: 'Traffic cone', draw: () => (<g><path d="M50 -10 L62 20 L38 20 Z" fill="#ff7a1a" /><path d="M45.5 1 L54.5 1 L56.5 6 L43.5 6 Z" fill="#fff" /><path d="M41.6 11 L58.4 11 L60 15 L40 15 Z" fill="#fff" /><rect x="33" y="19" width="34" height="4" rx="1" fill="#e2640c" /></g>) },
  { key: 'fuji', slot: 'hat', label: 'Mini Mt Fuji', draw: () => (<g><path d="M30 24 L44 2 L56 2 L70 24 Z" fill="#5d7bb3" /><path d="M44 2 L56 2 L60 9 L56 7 L52 10 L48 7 L44 10 L40 9 Z" fill="#fff" /><circle cx="64" cy="6" r="3" fill="#ffd166" /></g>) },
  { key: 'propeller', slot: 'hat', label: 'Propeller beanie', draw: () => (<g><path d="M33 25 Q33 10 50 10 Q67 10 67 25 Z" fill="#3b82f6" /><path d="M33 25 Q50 18 50 10 Q50 18 67 25" fill="#ef4444" opacity="0.9" /><rect x="49" y="3" width="2" height="8" fill="#444" /><path d="M36 4 Q50 0 50 4 Q50 8 36 4 Z M64 4 Q50 0 50 4 Q50 8 64 4 Z" fill="#facc15" stroke="#a16207" strokeWidth="0.5" /></g>) },
  { key: 'shark', slot: 'hat', label: 'Shark fin', draw: () => (<g><path d="M33 25 Q33 10 50 10 Q67 10 67 25 Z" fill="#7d8fa3" /><path d="M46 12 Q52 -6 64 -8 Q56 2 58 14 Z" fill="#6b7d91" /><path d="M35 23 L38 26 L41 23 L44 26 L47 23 L50 26 L53 23 L56 26 L59 23 L62 26 L65 23" fill="none" stroke="#fff" strokeWidth="1.2" /></g>) },
  { key: 'viking', slot: 'hat', label: 'Viking horns', draw: () => (<g><path d="M33 25 Q33 10 50 10 Q67 10 67 25 Z" fill="#9aa3ad" /><rect x="32" y="22" width="36" height="4" rx="1.5" fill="#7b5a36" /><path d="M34 18 Q22 14 22 0 Q28 10 36 13 Z" fill="#f3ead7" stroke="#b9a988" strokeWidth="0.6" /><path d="M66 18 Q78 14 78 0 Q72 10 64 13 Z" fill="#f3ead7" stroke="#b9a988" strokeWidth="0.6" /></g>) },
  { key: 'banana', slot: 'hat', label: 'A banana', draw: () => (<path d="M30 12 Q50 22 72 6 Q74 10 70 13 Q50 28 30 15 Z" fill="#ffd93b" stroke="#c69c00" strokeWidth="0.8" />) },
  { key: 'chef', slot: 'hat', label: 'Chef hat', draw: () => (<g><rect x="36" y="14" width="28" height="10" fill="#fff" stroke="#ddd" strokeWidth="0.6" /><circle cx="40" cy="9" r="7" fill="#fff" /><circle cx="50" cy="6" r="8" fill="#fff" /><circle cx="60" cy="9" r="7" fill="#fff" /></g>) },
  { key: 'party', slot: 'hat', label: 'Party hat', draw: () => (<g><path d="M50 -8 L60 16 L40 16 Z" fill="#a855f7" /><path d="M46 2 L54 2 M43.5 9 L56.5 9" stroke="#facc15" strokeWidth="2" /><circle cx="50" cy="-9" r="3" fill="#f472b6" /></g>) },
  { key: 'catears', slot: 'hat', label: 'Cat ears', draw: () => (<g><path d="M34 18 L36 2 L46 13 Z" fill="#333" /><path d="M66 18 L64 2 L54 13 Z" fill="#333" /><path d="M37 14 L38 6 L43 12 Z M63 14 L62 6 L57 12 Z" fill="#f9a8d4" /></g>) },
  { key: 'mohawk', slot: 'hat', label: 'Rainbow mohawk', draw: () => (<g>{['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#a855f7'].map((c, i) => <path key={c} d={`M${38 + i * 4.5} 16 L${40 + i * 4.5} ${-4 + Math.abs(i - 2.5) * 3} L${43 + i * 4.5} 16 Z`} fill={c} />)}</g>) },
  { key: 'halo', slot: 'hat', label: 'Halo', draw: () => <ellipse cx="50" cy="4" rx="13" ry="3.4" fill="none" stroke="#facc15" strokeWidth="2.4" />, earn: { how: 'an 8-week streak', test: (d) => d.streak.bestStreak >= 8 } },
  { key: 'crown', slot: 'hat', label: 'Crown', draw: () => (<g><path d="M35 18 L36 4 L43 11 L50 1 L57 11 L64 4 L65 18 Z" fill="#facc15" stroke="#b7791f" strokeWidth="0.8" /><circle cx="50" cy="12" r="2" fill="#ef4444" /><circle cx="42" cy="14" r="1.4" fill="#3b82f6" /><circle cx="58" cy="14" r="1.4" fill="#22c55e" /></g>), earn: { how: 'reaching Gold (the ridge)', test: (d) => d.ratings.tier === 'gold' || d.ratings.tier === 'icon' } },
  { key: 'summit-flag', slot: 'hat', label: 'Summit flag', draw: () => (<g><rect x="49" y="-10" width="1.6" height="22" fill="#6b4f2a" /><path d="M50.6 -10 L66 -6 L50.6 -1 Z" fill="#d4442a" /><path d="M54 -7.5 L58 -6 L54 -4.5 Z" fill="#fff" /></g>), earn: { how: 'reaching Icon (the summit)', test: (d) => d.ratings.tier === 'icon' } },

  // ---------------- faces ----------------
  { key: 'shades', slot: 'face', label: 'Cool shades', draw: () => (<g><rect x="37" y="28" width="12" height="7" rx="2.4" fill="#111" /><rect x="51" y="28" width="12" height="7" rx="2.4" fill="#111" /><path d="M49 30 L51 30" stroke="#111" strokeWidth="1.4" /><path d="M39 29.5 L43 29.5" stroke="#fff" strokeWidth="0.9" opacity="0.7" /></g>) },
  { key: 'googly', slot: 'face', label: 'Googly eyes', draw: () => (<g><circle cx="43" cy="31" r="5.6" fill="#fff" stroke={K} strokeWidth="0.8" /><circle cx="57" cy="31" r="5.6" fill="#fff" stroke={K} strokeWidth="0.8" /><circle cx="41" cy="33.5" r="2.6" fill={K} /><circle cx="59.5" cy="28.5" r="2.6" fill={K} /></g>) },
  { key: 'moustache', slot: 'face', label: 'Twirly moustache', draw: () => <path d="M50 37 Q44 34 40 37 Q37 40 35 37 Q37 41 41 40 Q46 39 50 38.5 Q54 39 59 40 Q63 41 65 37 Q63 40 60 37 Q56 34 50 37 Z" fill="#3b2a1e" /> },
  { key: 'monocle', slot: 'face', label: 'Monocle', draw: () => (<g><circle cx="56.5" cy="32" r="4.8" fill="rgb(200 230 255 / 35%)" stroke="#c9a227" strokeWidth="1.2" /><path d="M61 35 Q64 44 60 52" fill="none" stroke="#c9a227" strokeWidth="0.6" /></g>) },
  { key: 'goggles', slot: 'face', label: 'Ski goggles', draw: () => (<g><path d="M33 29 Q50 25 67 29" stroke="#222" strokeWidth="2.4" fill="none" /><rect x="37" y="27" width="26" height="9" rx="4.5" fill="#f97316" stroke="#333" strokeWidth="1" /><path d="M40 29 L46 29" stroke="#fff" strokeWidth="1" opacity="0.8" /></g>) },
  { key: 'kabuki', slot: 'face', label: 'Kabuki paint', draw: () => (<g fill="none" stroke="#d4442a" strokeWidth="1.3" strokeLinecap="round"><path d="M38 27 Q43 24 47 28" /><path d="M53 28 Q57 24 62 27" /><path d="M38 34 Q36 38 39 42" /><path d="M62 34 Q64 38 61 42" /></g>) },
  { key: 'clown-nose', slot: 'face', label: 'Clown nose', draw: () => (<g><circle cx="50" cy="35.5" r="3.2" fill="#ef4444" /><circle cx="49" cy="34.5" r="0.9" fill="#fff" opacity="0.8" /></g>) },
  { key: 'heart-eyes', slot: 'face', label: 'Heart eyes', draw: () => (<g fill="#ef4444">{[43.5, 56.5].map((x) => <path key={x} d={`M${x} 35 L${x - 4} 31 Q${x - 4} 27.5 ${x - 1.6} 28 Q${x} 28.6 ${x} 30 Q${x} 28.6 ${x + 1.6} 28 Q${x + 4} 27.5 ${x + 4} 31 Z`} />)}</g>) },
  { key: 'ninja', slot: 'face', label: 'Ninja mask', draw: () => (<g><path d="M33.6 34 Q50 31 66.4 34 L65 44 Q50 48 35 44 Z" fill="#1f2937" /><path d="M66 36 L76 34 L73 39 Z" fill="#1f2937" /></g>) },
  { key: 'beard', slot: 'face', label: 'Wizard beard', draw: () => <path d="M36 36 Q38 46 44 50 Q48 62 50 66 Q52 62 56 50 Q62 46 64 36 Q58 42 50 42 Q42 42 36 36 Z" fill="#e5e7eb" stroke="#cbd5e1" strokeWidth="0.6" /> },
  { key: 'sweat', slot: 'face', label: 'Big sweat drop', draw: () => <path d="M66 18 Q62 26 66 28 Q70 26 66 18 Z" fill="#7dd3fc" stroke="#0ea5e9" strokeWidth="0.6" /> },

  // ---------------- mouths ----------------
  { key: 'grin', slot: 'mouth', label: 'Huge grin', draw: () => (<g><path d="M43 38 Q50 46 57 38 Z" fill="#7a2e2e" /><path d="M44.5 38.6 L55.5 38.6 L55 40 L45 40 Z" fill="#fff" /></g>) },
  { key: 'shock', slot: 'mouth', label: 'Shocked "O"', draw: () => <ellipse cx="50" cy="41" rx="2.6" ry="3.4" fill="#5b1f1f" /> },
  { key: 'tongue', slot: 'mouth', label: 'Tongue out', draw: () => (<g><path d="M46 39.5 Q50 42 54 39.5" fill="none" stroke="#6b3a2e" strokeWidth="1.2" /><path d="M49 40.5 Q48.5 45 51 45 Q53 44.6 52.4 40.5 Z" fill="#f472b6" /></g>) },
  { key: 'gritted', slot: 'mouth', label: 'Gritted teeth', draw: () => (<g><rect x="45" y="38" width="10" height="4" rx="1" fill="#fff" stroke="#6b3a2e" strokeWidth="0.8" /><path d="M47.5 38 L47.5 42 M50 38 L50 42 M52.5 38 L52.5 42 M45 40 L55 40" stroke="#6b3a2e" strokeWidth="0.5" /></g>) },
  { key: 'whistle', slot: 'mouth', label: 'Whistling', draw: () => (<g><circle cx="51" cy="40.5" r="1.3" fill="#5b1f1f" /><path d="M56 36 L58 34 M58 38 Q61 37 60 35" stroke="#555" strokeWidth="0.7" fill="none" /></g>) },
  { key: 'derp', slot: 'mouth', label: 'Wobbly', draw: () => <path d="M44 40 Q46 38 48 40 Q50 42 52 40 Q54 38 56 40" fill="none" stroke="#6b3a2e" strokeWidth="1.2" /> },

  // ---------------- held (front hand ~ 36,76) ----------------
  { key: 'h-onigiri', slot: 'held', label: 'Onigiri', draw: () => (<g><path d="M36 66 L44 79 L28 79 Z" fill="#fbfbf6" stroke="#c9c6b8" strokeWidth="0.6" /><rect x="32" y="74" width="8" height="5" fill="#1f3326" /></g>) },
  { key: 'ramen', slot: 'held', label: 'Ramen bowl', draw: () => (<g><path d="M26 74 L46 74 Q45 84 36 84 Q27 84 26 74 Z" fill="#d4442a" /><ellipse cx="36" cy="74" rx="10" ry="2.4" fill="#f4d58d" /><path d="M30 73 Q33 70 36 73 Q39 70 42 73" stroke="#e8c26a" fill="none" /><path d="M40 62 L46 74 M43 61 L48 73" stroke="#a16207" strokeWidth="0.9" /><circle cx="33" cy="73.5" r="1.6" fill="#fff" /><circle cx="33" cy="73.5" r="0.7" fill="#f472b6" /></g>) },
  { key: 'duck', slot: 'held', label: 'Rubber duck', draw: () => (<g><ellipse cx="36" cy="78" rx="7" ry="5" fill="#facc15" /><circle cx="40" cy="71" r="4" fill="#facc15" /><path d="M43.5 71 L47 72 L43.5 73 Z" fill="#f97316" /><circle cx="41" cy="70" r="0.8" fill={K} /></g>) },
  { key: 'baguette', slot: 'held', label: 'Baguette', draw: () => (<g><rect x="20" y="70" width="34" height="6" rx="3" transform="rotate(-25 37 73)" fill="#d4a056" /><path d="M28 77 L31 73 M34 75 L37 71 M40 72 L43 68" stroke="#a16b2a" strokeWidth="0.8" /></g>) },
  { key: 'fish', slot: 'held', label: 'A whole saba', draw: () => (<g><path d="M22 78 Q34 68 46 76 L52 72 L50 78 L52 84 L46 80 Q34 88 22 78 Z" fill="#7aa5c9" /><path d="M28 75 Q34 72 40 75" stroke="#3b5f80" fill="none" strokeWidth="0.7" /><circle cx="26" cy="77" r="0.9" fill={K} /></g>) },
  { key: 'dango', slot: 'held', label: 'Dango', draw: () => (<g><path d="M36 82 L36 58" stroke="#a16207" strokeWidth="1" /><circle cx="36" cy="61" r="3.4" fill="#f9a8d4" /><circle cx="36" cy="67.5" r="3.4" fill="#fff" stroke="#ddd" strokeWidth="0.5" /><circle cx="36" cy="74" r="3.4" fill="#86efac" /></g>) },
  { key: 'icecream', slot: 'held', label: 'Melting ice cream', draw: () => (<g><path d="M32 72 L40 72 L36 84 Z" fill="#d4a056" /><circle cx="36" cy="69" r="5" fill="#fbcfe8" /><path d="M33 72 Q33 77 34.5 76 Q35 73 36 74" fill="#fbcfe8" /></g>) },
  { key: 'wagasa', slot: 'held', label: 'Wagasa umbrella', draw: () => (<g><path d="M36 78 L36 50" stroke="#6b4f2a" strokeWidth="1" /><path d="M18 52 Q36 34 54 52 Z" fill="#d4442a" /><path d="M36 39 L24 52 M36 39 L30 52 M36 39 L42 52 M36 39 L48 52" stroke="#fff" strokeWidth="0.5" opacity="0.6" /></g>) },
  { key: 'balloon', slot: 'held', label: 'Balloon', draw: () => (<g><path d="M36 76 Q30 60 26 46" stroke="#555" strokeWidth="0.5" fill="none" /><ellipse cx="25" cy="40" rx="7" ry="8.5" fill="#22c55e" /><path d="M22 36 Q23 34 25 34" stroke="#fff" opacity="0.7" fill="none" /></g>) },
  { key: 'h-flag', slot: 'held', label: 'Team flag', draw: () => (<g><path d="M36 80 L36 52" stroke="#6b4f2a" strokeWidth="1.1" /><path d="M36 52 L54 56 L36 61 Z" fill="#1f3a6e" /><path d="M38 53.5 L50 56 L38 59" stroke="#d4442a" strokeWidth="1.4" fill="none" /></g>) },
  { key: 'trophy', slot: 'held', label: 'Trophy', draw: () => (<g><path d="M30 66 L42 66 L41 74 Q36 78 31 74 Z" fill="#facc15" stroke="#b7791f" strokeWidth="0.6" /><path d="M30 67 Q26 68 28 72 Q30 73 31 72 M42 67 Q46 68 44 72 Q42 73 41 72" fill="none" stroke="#b7791f" strokeWidth="0.8" /><rect x="34" y="77" width="4" height="3" fill="#b7791f" /><rect x="31" y="80" width="10" height="2.4" fill="#7c5a12" /></g>), earn: { how: 'a course record or a gold Tasuki Surge', test: (d) => d.badges.some((b) => b.kind === 'record' || (b.kind === 'surge' && b.tier === 'gold')) } },
  { key: 'compass-xl', slot: 'held', label: 'Giant compass', draw: () => (<g><circle cx="36" cy="72" r="9" fill="#f5efe0" stroke="#7a5a2a" strokeWidth="1.4" /><path d="M36 64.5 L38.4 72 L36 79.5 L33.6 72 Z" fill="#d4442a" /><path d="M36 64.5 L38.4 72 L33.6 72 Z" fill="#1f3a6e" /></g>), earn: { how: 'NAV 75 or more', test: (d) => (d.ratings.stats.NAV.value ?? 0) >= 75 } },

  // ---------------- running buddies (ground, in front: x 2–24) ----------------
  { key: 'shiba', slot: 'buddy', label: 'Shiba inu', draw: () => (<g><ellipse cx="13" cy="116" rx="9" ry="5" fill="#e3a35c" /><circle cx="5" cy="110" r="4.6" fill="#e3a35c" /><path d="M2 107 L2.5 102 L5.5 106 Z M7 106 L9 102 L9.5 107 Z" fill="#e3a35c" /><ellipse cx="4.5" cy="112" rx="2.6" ry="1.8" fill="#fff4e0" /><circle cx="3.6" cy="109" r="0.7" fill={K} /><path d="M22 112 Q26 106 22 108" stroke="#e3a35c" strokeWidth="2.4" fill="none" /><path d="M7 120 L6 125 M11 121 L11 125 M17 121 L18 125 M20 120 L22 124" stroke="#c98a45" strokeWidth="1.8" strokeLinecap="round" /></g>) },
  { key: 'tanuki', slot: 'buddy', label: 'Tanuki', draw: () => (<g><ellipse cx="13" cy="114" rx="8" ry="8" fill="#8b6f53" /><ellipse cx="13" cy="116" rx="5" ry="5" fill="#e8d8c0" /><circle cx="13" cy="104" r="5" fill="#8b6f53" /><ellipse cx="11" cy="104" rx="2" ry="1.4" fill="#3a2d22" /><ellipse cx="15" cy="104" rx="2" ry="1.4" fill="#3a2d22" /><path d="M21 117 Q27 114 24 122" stroke="#5e4936" strokeWidth="3" fill="none" /><path d="M10 122 L9 125 M16 122 L17 125" stroke="#3a2d22" strokeWidth="2" strokeLinecap="round" /></g>) },
  { key: 'capybara', slot: 'buddy', label: 'Capybara (very calm)', draw: () => (<g><rect x="2" y="108" width="22" height="12" rx="6" fill="#a47551" /><rect x="0" y="104" width="10" height="9" rx="4" fill="#a47551" /><circle cx="4" cy="107" r="0.8" fill={K} /><rect x="5" y="101" width="5" height="4" rx="1" fill="#facc15" /><path d="M6 120 L6 124 M20 120 L20 124" stroke="#7a5536" strokeWidth="2" strokeLinecap="round" /></g>) },
  { key: 'chicken', slot: 'buddy', label: 'Panicking chicken', draw: () => (<g><ellipse cx="13" cy="114" rx="7" ry="6" fill="#fff" stroke="#ddd" strokeWidth="0.6" /><circle cx="8" cy="106" r="4" fill="#fff" stroke="#ddd" strokeWidth="0.6" /><path d="M7 101.5 L8 99 L9 101.5 L10 99.5 L10.5 102" fill="#ef4444" /><path d="M4 106 L1.5 107 L4 108" fill="#f59e0b" /><circle cx="7" cy="105" r="0.7" fill={K} /><path d="M11 120 L10 125 M15 120 L16 125" stroke="#f59e0b" strokeWidth="1.2" /><path d="M20 108 L24 104 M21 112 L26 110" stroke="#ddd" strokeWidth="1" /></g>) },
  { key: 'penguin', slot: 'buddy', label: 'Penguin', draw: () => (<g><ellipse cx="12" cy="113" rx="7" ry="10" fill="#1f2937" /><ellipse cx="12" cy="115" rx="4.5" ry="7.5" fill="#fff" /><circle cx="10" cy="106" r="0.8" fill={K} /><circle cx="14" cy="106" r="0.8" fill={K} /><path d="M11 108 L12 110 L13 108 Z" fill="#f59e0b" /><path d="M8 123 L10 124 M14 124 L16 123" stroke="#f59e0b" strokeWidth="1.6" /></g>) },
  { key: 'snail', slot: 'buddy', label: 'A snail (somehow keeping up)', draw: () => (<g><path d="M2 122 Q14 125 24 122 L24 120 Q14 122 4 119 Z" fill="#c4b5a0" /><circle cx="15" cy="114" r="7" fill="#d97706" /><path d="M15 114 m-4 0 a4 4 0 1 0 4 -4 a2.5 2.5 0 1 0 -2.5 2.5" fill="none" stroke="#92400e" strokeWidth="1" /><path d="M5 119 L3 110 M7 119 L7 110" stroke="#c4b5a0" strokeWidth="1" /><circle cx="3" cy="110" r="1" fill={K} /><circle cx="7" cy="110" r="1" fill={K} /><path d="M24 116 L28 116 M24 120 L29 120" stroke="#999" strokeWidth="0.6" /></g>) },
  { key: 'ducklings', slot: 'buddy', label: 'Ducklings in a line', draw: () => (<g>{[2, 10, 18].map((x, i) => (<g key={x}><ellipse cx={x + 3} cy={122 - i * 0.5} rx="3.4" ry="2.6" fill="#fde047" /><circle cx={x + 1} cy={118.5 - i * 0.5} r="2" fill="#fde047" /><path d={`M${x - 1} ${118.5 - i * 0.5} L${x - 2.6} ${119 - i * 0.5} L${x - 1} ${119.5 - i * 0.5}`} fill="#f97316" /></g>))}</g>) },
  { key: 'bear', slot: 'buddy', label: 'Tiny bear', draw: () => (<g><ellipse cx="13" cy="115" rx="8" ry="7" fill="#5b3a29" /><circle cx="7" cy="107" r="5" fill="#5b3a29" /><circle cx="4" cy="103" r="1.8" fill="#5b3a29" /><circle cx="10" cy="103" r="1.8" fill="#5b3a29" /><ellipse cx="6" cy="109" rx="2" ry="1.4" fill="#c79a74" /><circle cx="5.6" cy="106" r="0.6" fill={K} /><path d="M2 108 L0 104" stroke="#e9c75a" strokeWidth="0.8" /><circle cx="0" cy="103.6" r="1" fill="#facc15" /></g>) },
  { key: 'robot', slot: 'buddy', label: 'Pace robot', draw: () => (<g><rect x="4" y="106" width="14" height="12" rx="2" fill="#94a3b8" /><rect x="6" y="99" width="10" height="7" rx="1.5" fill="#cbd5e1" /><circle cx="9" cy="102.5" r="1.2" fill="#22d3ee" /><circle cx="13" cy="102.5" r="1.2" fill="#22d3ee" /><path d="M11 99 L11 96" stroke="#64748b" /><circle cx="11" cy="95.5" r="1" fill="#ef4444" /><text x="11" y="114.5" fontSize="4" textAnchor="middle" fill="#0f172a" fontWeight="700">4:30</text><circle cx="7" cy="121" r="2.4" fill="#475569" /><circle cx="15" cy="121" r="2.4" fill="#475569" /></g>), earn: { how: 'a 5K prediction', test: (d) => !!d.prediction } },
  { key: 'serow', slot: 'buddy', label: 'Kamoshika (mountain goat)', draw: () => (<g><ellipse cx="14" cy="112" rx="9" ry="5.5" fill="#4b4b4b" /><circle cx="5" cy="105" r="4" fill="#5a5a5a" /><path d="M3 101 L2 98 M6 101 L6.5 98" stroke="#222" strokeWidth="1" /><circle cx="4" cy="105" r="0.6" fill="#fff" /><path d="M8 117 L7 125 M12 117 L12 125 M17 117 L18 125 M21 116 L22 124" stroke="#333" strokeWidth="1.6" strokeLinecap="round" /></g>), earn: { how: 'CLB 70 or more', test: (d) => (d.ratings.stats.CLB.value ?? 0) >= 70 } },

  // ---------------- feet ----------------
  { key: 'geta', slot: 'feet', label: 'Geta sandals', draw: () => (<g fill="#a16207"><rect x="21" y="122" width="15" height="2.4" rx="0.6" /><rect x="23" y="124.4" width="2" height="3" /><rect x="32" y="124.4" width="2" height="3" /><rect x="64" y="121" width="14" height="2.4" rx="0.6" /><rect x="66" y="123.4" width="2" height="3" /><rect x="74" y="123.4" width="2" height="3" /></g>) },
  { key: 'flippers', slot: 'feet', label: 'Flippers', draw: () => (<g fill="#22c55e"><path d="M33 118 L14 120 Q12 125 16 126 L35 122 Z" /><path d="M66 117 L86 117 Q88 122 84 123 L65 121 Z" /></g>) },
  { key: 'skates', slot: 'feet', label: 'Roller skates', draw: () => (<g><path d="M33 116 L23 119 Q21 123 25 123 L35 121 Z" fill="#f472b6" /><circle cx="25" cy="125" r="1.8" fill="#333" /><circle cx="32" cy="124" r="1.8" fill="#333" /><path d="M66 116 L77 118 Q78 122 74 122 L65 120 Z" fill="#f472b6" /><circle cx="67" cy="123" r="1.8" fill="#333" /><circle cx="74" cy="124" r="1.8" fill="#333" /></g>) },
  { key: 'clownshoes', slot: 'feet', label: 'Clown shoes', draw: () => (<g fill="#ef4444"><ellipse cx="22" cy="122" rx="12" ry="3.6" /><ellipse cx="76" cy="121" rx="11" ry="3.4" /></g>) },
  { key: 'rockets', slot: 'feet', label: 'Rocket boots', draw: () => (<g><path d="M33 117 L24 120 Q22 124 26 124 L35 122 Z" fill="#94a3b8" /><path d="M30 124 Q27 132 32 130 Q31 127 34 124 Z" fill="#f97316" /><path d="M66 116 L76 118 Q77 122 74 122 L65 121 Z" fill="#94a3b8" /><path d="M70 122 Q68 130 73 128 Q72 125 75 122 Z" fill="#f97316" /></g>), earn: { how: 'SPD 80 or more', test: (d) => (d.ratings.stats.SPD.value ?? 0) >= 80 } },
  { key: 'socks', slot: 'feet', label: 'Mismatched socks', draw: () => (<g><rect x="30" y="111" width="6" height="7" rx="1" transform="rotate(35 33 114)" fill="#22c55e" /><rect x="63" y="110" width="6" height="7" rx="1" transform="rotate(-30 66 113)" fill="#a855f7" /><path d="M31 112 L36 115 M64 112 L68 110" stroke="#fff" strokeWidth="0.9" /></g>) },

  // ---------------- back (behind the body) ----------------
  { key: 'cape', slot: 'back', label: 'Superhero cape', draw: () => <path d="M38 52 Q50 50 62 52 Q80 74 92 96 Q78 92 66 98 Q60 82 50 76 Z" fill="#d4442a" stroke="#9f2d1a" strokeWidth="0.6" /> },
  { key: 'jetpack', slot: 'back', label: 'Jetpack', draw: () => (<g><rect x="60" y="54" width="9" height="20" rx="3" fill="#94a3b8" /><rect x="68" y="56" width="9" height="20" rx="3" fill="#94a3b8" /><path d="M62 74 Q64 88 66 74 Z M70 76 Q72 90 74 76 Z" fill="#f97316" /><path d="M63 74 Q64 82 65 74 Z M71 76 Q72 84 73 76 Z" fill="#fde047" /></g>) },
  { key: 'randoseru', slot: 'back', label: 'Randoseru', draw: () => (<g><rect x="58" y="52" width="16" height="22" rx="4" fill="#b91c1c" /><path d="M58 56 Q66 50 74 56 L74 62 Q66 58 58 62 Z" fill="#991b1b" /><rect x="64" y="62" width="4" height="3" rx="0.6" fill="#facc15" /></g>) },
  { key: 'koinobori', slot: 'back', label: 'Koinobori (carp streamer)', draw: () => (<g><path d="M64 80 L80 20" stroke="#6b4f2a" strokeWidth="1.2" /><path d="M79 23 Q92 20 99 26 Q92 32 79 29 Q84 26 79 23 Z" fill="#2563eb" /><circle cx="95" cy="25.5" r="1.4" fill="#fff" /><path d="M77 32 Q90 29 97 35 Q90 41 77 38 Q82 35 77 32 Z" fill="#d4442a" /><circle cx="93" cy="34.5" r="1.4" fill="#fff" /></g>) },
  { key: 'wings', slot: 'back', label: 'Tiny wings', draw: () => (<g fill="#fff" stroke="#cbd5e1" strokeWidth="0.6"><path d="M60 58 Q76 44 82 56 Q74 56 72 62 Q66 60 60 62 Z" /><path d="M60 64 Q72 58 76 66 Q68 66 60 68 Z" /></g>) },
  { key: 'kite', slot: 'back', label: 'Kite', draw: () => (<g><path d="M62 60 Q80 40 86 18" stroke="#666" strokeWidth="0.4" fill="none" /><path d="M86 6 L96 16 L86 30 L76 16 Z" fill="#facc15" stroke="#b45309" strokeWidth="0.6" /><path d="M86 6 L86 30 M76 16 L96 16" stroke="#b45309" strokeWidth="0.5" /><path d="M86 30 Q82 36 88 40 Q84 44 88 48" stroke="#d4442a" fill="none" strokeWidth="0.8" /></g>) },
  { key: 'backpack', slot: 'back', label: 'Huge expedition pack', draw: () => (<g><rect x="58" y="44" width="20" height="34" rx="5" fill="#2f6f4f" /><rect x="60" y="38" width="16" height="9" rx="4" fill="#d9c58c" /><rect x="61" y="58" width="14" height="8" rx="2" fill="#245a3f" /><path d="M78 50 L82 50 L82 74 L78 74" fill="#e07a1f" /></g>), earn: { how: 'an expedition badge', test: (d) => d.badges.some((b) => b.kind === 'expedition') } },

  // ---------------- trails (behind, to the right) ----------------
  { key: 'rainbow', slot: 'trail', label: 'Rainbow', draw: () => (<g fill="none" strokeWidth="3">{['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#a855f7'].map((c, i) => <path key={c} d={`M66 ${60 + i * 3} Q84 ${46 + i * 3} 102 ${64 + i * 3}`} stroke={c} />)}</g>) },
  { key: 'sakura', slot: 'trail', label: 'Sakura petals', draw: () => (<g fill="#f9a8d4">{[[76, 50], [86, 60], [94, 46], [82, 76], [96, 72], [72, 90], [90, 92]].map(([x, y]) => <path key={`${x}${y}`} d={`M${x} ${y} q2 -3 4 0 q-2 3 -4 0 Z`} transform={`rotate(${(x * 7) % 60} ${x} ${y})`} />)}</g>) },
  { key: 'bubbles', slot: 'trail', label: 'Bubbles', draw: () => (<g fill="rgb(186 230 253 / 50%)" stroke="#7dd3fc" strokeWidth="0.6">{[[78, 56, 4], [90, 48, 3], [86, 70, 5], [97, 62, 2.4], [76, 84, 3]].map(([x, y, r]) => <circle key={`${x}`} cx={x} cy={y} r={r} />)}</g>) },
  { key: 'stink', slot: 'trail', label: 'Stink cloud', draw: () => (<g><g fill="#a3e635" opacity="0.75">{[[78, 98, 6], [88, 92, 7], [96, 100, 5], [84, 106, 5]].map(([x, y, r]) => <circle key={`${x}${y}`} cx={x} cy={y} r={r} />)}</g><path d="M80 84 Q78 80 80 76 M90 80 Q88 76 90 72" stroke="#65a30d" strokeWidth="1" fill="none" /></g>) },
  { key: 'notes', slot: 'trail', label: 'Music notes', draw: () => (<g fill="#334155">{[[78, 54], [90, 66], [84, 82]].map(([x, y]) => (<g key={`${x}`}><ellipse cx={x} cy={y} rx="2.2" ry="1.6" /><path d={`M${x + 2} ${y} L${x + 2} ${y - 9} L${x + 6} ${y - 7}`} stroke="#334155" fill="none" strokeWidth="0.9" /></g>))}</g>) },
  { key: 'hearts', slot: 'trail', label: 'Hearts', draw: () => (<g fill="#f472b6">{[[80, 56], [92, 70], [84, 86]].map(([x, y]) => <path key={`${x}`} d={`M${x} ${y + 4} L${x - 4} ${y} Q${x - 4} ${y - 3} ${x - 1.6} ${y - 2.6} Q${x} ${y - 2} ${x} ${y - 0.6} Q${x} ${y - 2} ${x + 1.6} ${y - 2.6} Q${x + 4} ${y - 3} ${x + 4} ${y} Z`} />)}</g>) },
  { key: 'speedstars', slot: 'trail', label: 'Shooting stars', draw: () => (<g>{[[82, 50], [92, 66], [78, 80]].map(([x, y]) => (<g key={`${x}`}><path d={`M${x} ${y} L${x + 14} ${y - 4}`} stroke="#facc15" strokeWidth="1.4" opacity="0.6" /><path d={`M${x} ${y - 3} L${x + 1} ${y - 1} L${x + 3} ${y - 1} L${x + 1.4} ${y + 0.4} L${x + 2} ${y + 2.6} L${x} ${y + 1.2} L${x - 2} ${y + 2.6} L${x - 1.4} ${y + 0.4} L${x - 3} ${y - 1} L${x - 1} ${y - 1} Z`} fill="#facc15" /></g>))}</g>), earn: { how: 'being In-Form (a PB this week)', test: (d) => d.inForm.length > 0 } },
  { key: 'leaves', slot: 'trail', label: 'Autumn leaves', draw: () => (<g>{[[78, 60, '#e84a2f'], [90, 72, '#f39a2e'], [82, 88, '#ffd45c'], [96, 56, '#c2410c']].map(([x, y, c]) => <path key={`${x}`} d={`M${x} ${y} l3 -4 l1 3 l3 -1 l-2 3 l3 2 l-4 0 l-1 3 l-1 -3 l-4 0 l3 -2 l-2 -3 l3 1 Z`} fill={c as string} />)}</g>) },
];

export const EXTRAS_BY_SLOT: Record<ExtraSlot, ExtraItem[]> = EXTRA_SLOTS.reduce(
  (acc, { slot }) => ({ ...acc, [slot]: ITEMS.filter((i) => i.slot === slot) }),
  {} as Record<ExtraSlot, ExtraItem[]>,
);

export function extraItem(key: string | undefined): ExtraItem | undefined {
  return key ? ITEMS.find((i) => i.key === key) : undefined;
}

/** How many different avatars the Silly Lab can make (each slot: none or one item). */
export function sillyLabCombinations(): number {
  return EXTRA_SLOTS.reduce((n, { slot }) => n * (EXTRAS_BY_SLOT[slot].length + 1), 1);
}

/** True when this runner may wear the item (free items always; earned items when earned). */
export function canWear(item: ExtraItem, d?: AthleteDerived): boolean {
  return !item.earn || (!!d && item.earn.test(d));
}

/** A random outfit from what this runner can wear; each slot is empty a third of the time. */
export function surpriseMe(d?: AthleteDerived, rnd: () => number = Math.random): AvatarExtras {
  const out: AvatarExtras = {};
  for (const { slot } of EXTRA_SLOTS) {
    const pool = EXTRAS_BY_SLOT[slot].filter((i) => canWear(i, d));
    if (pool.length && rnd() > 0.33) out[slot] = pool[Math.floor(rnd() * pool.length)].key;
  }
  return out;
}

/** Layers drawn behind the runner (back items, trails) and in front (everything else), in drawing order. */
export function ExtrasLayer({ extras, layer }: { extras?: AvatarExtras; layer: 'behind' | 'head' | 'face' | 'held' | 'front' }) {
  if (!extras) return null;
  const slots: Record<typeof layer, ExtraSlot[]> = { behind: ['trail', 'back'], head: ['hat'], face: ['face', 'mouth'], held: ['held'], front: ['feet', 'buddy'] };
  return (
    <>
      {slots[layer].map((s) => {
        const it = extraItem(extras[s]);
        return it ? <g key={s}>{it.draw()}</g> : null;
      })}
    </>
  );
}
