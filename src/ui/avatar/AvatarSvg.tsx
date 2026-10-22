// Original modular runner avatar (spec 5): clean, flat colours, anime-inspired proportions.
// Components: skin tone (6), hair style (8), hair colour (6), kit colour, accessory.
// Data-driven extras come only from AvatarUnlocks. The body is the same for everyone and nothing
// about appearance is ever linked to a rating.
import { useId } from 'react';
import type { Avatar } from '../../types';
import type { AvatarUnlocks } from '../../engine/avatarUnlocks';
import { NO_UNLOCKS } from '../../engine/avatarUnlocks';
import { KIT_COLOURS } from '../../engine/avatarDefaults';

export const SKIN = ['#f8dcc5', '#efc39f', '#d9a275', '#b98058', '#8e5a3a', '#5f3b26'];
export const HAIR = ['#1d1c24', '#4a2f22', '#7b4a2b', '#c99a50', '#a8452a', '#6d7380'];

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `#${((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, '0')}`;
}

/** Hair drawn behind the head (long styles). */
function HairBack({ style, c }: { style: number; c: string }) {
  switch (style) {
    case 2: // bob
      return <path d="M31 26 Q30 50 38 52 L62 52 Q70 50 69 26 Z" fill={c} />;
    case 3: // ponytail
      return <path d="M64 22 Q80 26 76 46 Q74 54 68 58 Q72 44 64 34 Z" fill={c} />;
    case 4: // twin tails
      return (
        <>
          <path d="M33 26 Q20 34 24 54 Q26 60 30 62 Q28 46 36 36 Z" fill={c} />
          <path d="M67 26 Q80 34 76 54 Q74 60 70 62 Q72 46 64 36 Z" fill={c} />
        </>
      );
    case 6: // bun
      return <circle cx="50" cy="11" r="7" fill={c} />;
    default:
      return null;
  }
}

/** Hair on top of the head (fringe and crown). */
function HairFront({ style, c }: { style: number; c: string }) {
  const d = shade(c, 0.78);
  switch (style) {
    case 0: // short crop
      return <path d="M33 28 Q32 12 50 11 Q68 12 67 28 Q62 20 50 20 Q38 20 33 28 Z" fill={c} />;
    case 1: // spiky
      return <path d="M33 29 L31 16 L38 19 L39 9 L46 15 L50 6 L54 15 L61 9 L62 19 L69 16 L67 29 Q60 20 50 21 Q40 20 33 29 Z" fill={c} />;
    case 2: // bob with straight fringe
      return <path d="M32 30 Q31 11 50 10 Q69 11 68 30 L66 30 Q64 22 50 22 Q37 22 34 30 Z" fill={c} />;
    case 3: // ponytail: swept-back crown
      return (
        <>
          <path d="M33 28 Q33 11 51 11 Q68 12 67 26 Q58 17 44 21 Q37 23 33 28 Z" fill={c} />
          <circle cx="66" cy="24" r="2.4" fill={d} />
        </>
      );
    case 4: // twin tails: centre parting
      return <path d="M33 29 Q32 11 50 11 Q68 11 67 29 Q63 21 52 19 L50 22 L48 19 Q37 21 33 29 Z" fill={c} />;
    case 5: // side-swept fringe
      return <path d="M33 30 Q31 11 52 11 Q69 13 67 27 Q60 18 47 24 Q40 27 33 30 Z" fill={c} />;
    case 6: // bun: neat crown
      return <path d="M33 28 Q33 14 50 13 Q67 14 67 28 Q61 19 50 19 Q39 19 33 28 Z" fill={c} />;
    default: // 7 buzz cut
      return <path d="M34 26 Q34 13 50 13 Q66 13 66 26 Q60 18 50 18 Q40 18 34 26 Z" fill={c} opacity="0.9" />;
  }
}

export function AvatarSvg({ avatar, unlocks = NO_UNLOCKS, className }: { avatar: Avatar; unlocks?: AvatarUnlocks; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const skin = SKIN[avatar.skinTone % SKIN.length];
  const skinD = shade(skin, 0.86);
  const hair = HAIR[avatar.hairColour % HAIR.length];
  const kit = KIT_COLOURS.find((k) => k.key === avatar.kitColour)?.hex ?? KIT_COLOURS[0].hex;
  const kitD = shade(kit, 0.75);
  const style = avatar.hairStyle % 8;
  const u = unlocks;
  const sashMain = '#d4442a';
  const sashEdge = u.sash === 'gold' ? '#e9c75a' : '#ffffff';
  return (
    <svg viewBox="0 0 100 130" className={className} role="img" aria-label="Runner avatar">
      <defs>
        <radialGradient id={`glow${uid}`} cx="50%" cy="55%" r="50%">
          <stop offset="0%" stopColor="#7fd8ff" stopOpacity="0.75" />
          <stop offset="60%" stopColor="#7fd8ff" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#7fd8ff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* ---- effects behind the runner ---- */}
      {u.armourGlow && <ellipse cx="50" cy="72" rx="44" ry="56" fill={`url(#glow${uid})`} />}
      {u.contourWings && (
        <g fill="none" stroke="#3f8f6a" strokeWidth="1.3" strokeLinecap="round" opacity="0.8">
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              <path d={`M38 ${58 - i * 2} Q${22 - i * 5} ${40 - i * 6} ${8 - i * 2} ${50 - i * 3}`} />
              <path d={`M62 ${58 - i * 2} Q${78 + i * 5} ${40 - i * 6} ${92 + i * 2} ${50 - i * 3}`} />
            </g>
          ))}
        </g>
      )}
      {u.motionLines && (
        <g stroke="#9aa6b8" strokeWidth="1.6" strokeLinecap="round">
          <line x1="78" y1="58" x2="96" y2="58" />
          <line x1="80" y1="70" x2="99" y2="70" />
          <line x1="76" y1="82" x2="93" y2="82" />
        </g>
      )}
      {u.lightningTrail && <path d="M90 40 L80 62 L88 62 L76 92 L94 58 L85 58 L95 40 Z" fill="#ffd23f" stroke="#c98f00" strokeWidth="0.8" strokeLinejoin="round" />}

      {/* ---- back arm and back leg ---- */}
      <path d="M62 54 L71 64 L67 75" fill="none" stroke={skinD} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M56 92 L63 106 L69 116" fill="none" stroke={skinD} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      {u.ankleGuards && <rect x="62.5" y="108" width="8" height="6" rx="1.5" transform="rotate(-30 66 111)" fill="#8b96a8" stroke="#4d5666" strokeWidth="0.8" />}
      <path d="M66 117 L76 119 Q77 122 74 122 L65 121 Z" fill="#30343f" />

      {/* ---- hair behind head, neck, torso ---- */}
      <HairBack style={style} c={hair} />
      <rect x="46" y="43" width="8" height="9" rx="2" fill={skinD} />
      <path d="M36 52 Q50 46 64 52 L61 82 L39 82 Z" fill={kit} />
      <path d="M44 50 Q50 56 56 50" fill="none" stroke={kitD} strokeWidth="1.6" />
      <rect x="43" y="62" width="14" height="10" rx="1.5" fill="#fff" stroke={kitD} strokeWidth="0.6" />
      <path d="M38 80 L62 80 L65 95 L52 95 L50 88 L48 95 L35 95 Z" fill="#2a2f3a" />

      {/* tasuki sash: left shoulder to right hip */}
      {u.sash !== 'none' && (
        <g>
          <path d="M37 52 L43 50 L63 80 L57 82 Z" fill={sashMain} />
          <path d="M37 52 L43 50 L63 80 L57 82 Z" fill="none" stroke={sashEdge} strokeWidth={u.sash === 'gold' ? 1.4 : 0.9} strokeLinejoin="round" />
          {u.sashFlame && (
            <path d="M61 86 C57 82 59 78 61 75 C62 79 64 79 64 76 C67 80 66 85 61 86 Z" fill="#ff8a1f" stroke="#d4442a" strokeWidth="0.6" />
          )}
        </g>
      )}

      {/* ---- front leg ---- */}
      <path d="M44 92 L38 107 L31 119" fill="none" stroke={skin} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      {u.ankleGuards && <rect x="31.5" y="109" width="8" height="6" rx="1.5" transform="rotate(35 35.5 112)" fill="#a7b2c4" stroke="#4d5666" strokeWidth="0.8" />}
      <path d="M33 118 L24 121 Q22 124 26 124 L35 122 Z" fill="#30343f" />
      {u.dustBurst && (
        <g fill="#c9b18a" opacity="0.85">
          <circle cx="20" cy="124" r="3" />
          <circle cx="15" cy="121" r="2.2" />
          <circle cx="26" cy="127" r="2.4" />
          <circle cx="80" cy="124" r="2.6" />
          <circle cx="86" cy="121" r="1.8" />
        </g>
      )}

      {/* ---- head ---- */}
      <circle cx="50" cy="29" r="16.5" fill={skin} />
      <ellipse cx="34" cy="31" rx="2.4" ry="3.4" fill={skinD} />
      <ellipse cx="66" cy="31" rx="2.4" ry="3.4" fill={skinD} />
      <g>
        <ellipse cx="43.5" cy="32" rx="2.7" ry="3.6" fill="#22232c" />
        <ellipse cx="56.5" cy="32" rx="2.7" ry="3.6" fill="#22232c" />
        <circle cx="44.4" cy="30.6" r="1.05" fill="#fff" />
        <circle cx="57.4" cy="30.6" r="1.05" fill="#fff" />
      </g>
      <ellipse cx="40" cy="37.5" rx="2.6" ry="1.4" fill="#f08a7a" opacity="0.35" />
      <ellipse cx="60" cy="37.5" rx="2.6" ry="1.4" fill="#f08a7a" opacity="0.35" />
      <path d="M47 39.5 Q50 42 53 39.5" fill="none" stroke="#6b3a2e" strokeWidth="1.2" strokeLinecap="round" />
      <HairFront style={style} c={hair} />

      {/* ---- accessories ---- */}
      {avatar.accessory === 'glasses' && (
        <g fill="none" stroke="#2b2d36" strokeWidth="1.1">
          <circle cx="43.5" cy="32" r="4.6" />
          <circle cx="56.5" cy="32" r="4.6" />
          <path d="M48.1 31.5 Q50 30.5 51.9 31.5" />
        </g>
      )}
      {(avatar.accessory === 'headband' || u.headband) && (
        <g>
          <path d="M33.6 22.5 Q50 16.5 66.4 22.5 L66 26.5 Q50 20.5 34 26.5 Z" fill={u.headband ? '#d4442a' : kit} />
          {u.headband && <path d="M65 23 L74 20 L72 25 L76 29 L66 26 Z" fill="#d4442a" />}
        </g>
      )}
      {avatar.accessory === 'cap' && (
        <g>
          <path d="M33 25 Q34 9 50 9 Q66 9 67 25 Z" fill={kit} />
          <path d="M33 25 Q50 21 67 25 L67 26.5 Q50 22.5 33 26.5 Z" fill={kitD} />
          <path d="M33 25.5 Q22 25 20 28.5 Q27 28.5 36 27 Z" fill={kitD} />
          <circle cx="50" cy="10" r="1.6" fill={kitD} />
        </g>
      )}

      {/* ---- front arm (with compass) ---- */}
      <path d="M38 54 L30 65 L36 75" fill="none" stroke={skin} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      {u.compass === 'hand' && (
        <g>
          <circle cx="37" cy="76" r="4.6" fill="#f5efe0" stroke="#7a5a2a" strokeWidth="1.1" />
          <path d="M37 72.6 L38.2 76 L37 79.4 L35.8 76 Z" fill="#d4442a" />
        </g>
      )}
      {u.compass === 'float' && (
        <g>
          <circle cx="28" cy="58" r="8" fill="#fff6c9" opacity="0.6" />
          <circle cx="28" cy="58" r="5.2" fill="#f5efe0" stroke="#b98a2a" strokeWidth="1.2" />
          <path d="M28 54.2 L29.4 58 L28 61.8 L26.6 58 Z" fill="#d4442a" />
          <path d="M22 50 L23 52 M34 50 L33 52 M28 47 L28 49.4" stroke="#e0b440" strokeWidth="1" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}
