// The spirit animals of 獣道 Kemonomichi, drawn as round medallions in SVG: original artwork, no images,
// no network (the single file still works offline). Each portrait sits in its own home: the falcon in a
// fast sky, the eagle over winter sea ice, the serow on misty crags, the pika on a boulder field, the fish
// owl by a moonlit river, the red panda in bamboo, the snow monkey in hot-spring steam, the dugong in a
// seagrass meadow and the Amami rabbit in a fern forest at sunrise.
import { useId, type CSSProperties, type ReactNode } from 'react';
import { SPIRITS, type SpiritId } from '../../engine/spirits';

/** A ring of bumps around a circle: fur, ruffs and snow. */
function fur(cx: number, cy: number, r: number, bumps: number, depth: number, start = 0): string {
  let d = '';
  for (let i = 0; i <= bumps; i++) {
    const a = start + (i / bumps) * Math.PI * 2;
    const mid = start + ((i + 0.5) / bumps) * Math.PI * 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) d += `M${x.toFixed(1)},${y.toFixed(1)}`;
    else {
      const qx = cx + Math.cos(mid - Math.PI / bumps) * (r + depth);
      const qy = cy + Math.sin(mid - Math.PI / bumps) * (r + depth);
      d += ` Q${qx.toFixed(1)},${qy.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`;
    }
  }
  return `${d} Z`;
}

/** Eye: iris, pupil and two catch-lights (the life in the face). */
function Eye({ x, y, r, iris, pupil = '#120c08', ring }: { x: number; y: number; r: number; iris?: string; pupil?: string; ring?: string }) {
  return (
    <g className="sp-eye">
      {ring && <circle cx={x} cy={y} r={r * 1.35} fill={ring} />}
      {iris && <circle cx={x} cy={y} r={r} fill={iris} />}
      <circle cx={x} cy={y} r={iris ? r * 0.55 : r} fill={pupil} />
      <circle cx={x - r * 0.32} cy={y - r * 0.36} r={r * 0.3} fill="#fff" />
      <circle cx={x + r * 0.28} cy={y + r * 0.3} r={r * 0.12} fill="#fff" opacity={0.8} />
    </g>
  );
}

type Art = (u: string) => { bg: ReactNode; fg: ReactNode; ring: string };

const ART: Record<SpiritId, Art> = {
  // SPD: peregrine falcon, in profile against a fast sky
  falcon: (u) => ({
    ring: '#2f6fb0',
    bg: (
      <>
        <linearGradient id={`${u}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3f8fd6" />
          <stop offset="0.6" stopColor="#8fc8f0" />
          <stop offset="1" stopColor="#dff1ff" />
        </linearGradient>
        <rect width="200" height="200" fill={`url(#${u}s)`} />
        <ellipse cx="40" cy="150" rx="46" ry="14" fill="#fff" opacity="0.7" />
        <ellipse cx="170" cy="40" rx="34" ry="10" fill="#fff" opacity="0.55" />
        {[48, 70, 92, 114, 136].map((y, i) => (
          <rect key={y} x={-10 + i * 6} y={y} width={52 + (i % 2) * 18} height="2.4" rx="1.2" fill="#fff" opacity={0.75 - i * 0.08} />
        ))}
      </>
    ),
    fg: (
      <>
        <path d="M18,206 C22,160 40,130 74,122 C64,150 60,178 62,206 Z" fill="#4a5a70" />
        <path d="M24,206 C28,172 40,150 60,138" stroke="#6b7d94" strokeWidth="3" fill="none" />
        <path d="M44,206 C46,156 72,130 104,130 C134,130 156,154 160,206 Z" fill="#f2e8d8" />
        {[0, 1, 2, 3].map((row) =>
          [0, 1, 2, 3, 4].map((c) => <path key={`${row}${c}`} d={`M${66 + c * 17 + (row % 2) * 8},${150 + row * 14} q5,4 10,0`} stroke="#5d6b7e" strokeWidth="2.6" fill="none" strokeLinecap="round" />),
        )}
        <path d="M60,120 C52,82 76,52 108,52 C134,52 150,68 150,86 L150,100 C148,118 134,132 112,136 C90,138 68,134 60,120 Z" fill="#f4ede1" />
        <path d="M60,120 C52,82 76,52 108,52 C134,52 150,68 150,86 L142,90 C134,82 118,82 110,92 C104,98 98,100 90,102 C80,106 70,114 60,120 Z" fill="#34414f" />
        <path d="M112,90 C120,100 122,116 117,132 C108,122 104,108 106,94 Z" fill="#34414f" />
        <path d="M74,70 C88,58 110,56 126,62" stroke="#4d5c6e" strokeWidth="3" fill="none" strokeLinecap="round" />
        <circle cx="126" cy="84" r="9" fill="#f5c542" />
        <Eye x={126} y={84} r={6.5} />
        <ellipse cx="145" cy="92" rx="8" ry="7" fill="#f5c542" />
        <path d="M146,85 C160,82 172,90 174,103 C174,112 169,118 162,118 C164,110 159,104 151,104 L145,101 Z" fill="#4b5a6b" />
        <path d="M150,87 C160,86 168,92 171,100" stroke="#7d8da0" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <path d="M162,118 C166,116 168,112 167,108" stroke="#2a323c" strokeWidth="2" fill="none" />
      </>
    ),
  }),

  // END: Steller's sea eagle over the winter sea ice
  eagle: (u) => ({
    ring: '#d9871a',
    bg: (
      <>
        <linearGradient id={`${u}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6d6b8" />
          <stop offset="0.45" stopColor="#b9d4e8" />
          <stop offset="0.62" stopColor="#7fa9c9" />
          <stop offset="1" stopColor="#3f6f96" />
        </linearGradient>
        <rect width="200" height="200" fill={`url(#${u}s)`} />
        <circle cx="46" cy="58" r="16" fill="#fff4e4" opacity="0.9" />
        <path d="M0,128 L200,128" stroke="#e8f2fa" strokeWidth="1.5" opacity="0.7" />
        <path d="M-4,142 L40,136 L74,140 L60,148 L4,150 Z" fill="#f4f8fc" />
        <path d="M120,150 L176,140 L210,146 L196,156 L130,158 Z" fill="#eef5fb" />
        <path d="M70,170 L110,164 L132,170 L96,176 Z" fill="#e6f0f8" opacity="0.8" />
      </>
    ),
    fg: (
      <>
        <path d="M16,206 C24,152 48,126 82,124 C114,122 142,140 158,206 Z" fill="#2b2522" />
        <path d="M24,180 C38,156 60,148 86,152 C70,162 52,178 40,206 L24,206 Z" fill="#f5f2ea" />
        {[0, 1, 2].map((i) => (
          <path key={i} d={`M${96 + i * 14},${160 + i * 8} l8,8 l8,-8`} stroke="#4a403a" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        ))}
        <path d="M48,124 C42,86 66,58 102,56 C124,56 138,66 142,80 L144,100 C136,112 122,120 110,126 C94,134 64,140 48,124 Z" fill="#332c28" />
        <path d="M60,92 C66,76 80,66 98,64" stroke="#5a504a" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M56,112 c6,-2 10,2 14,0 M66,122 c6,-2 10,2 14,0 M80,104 c5,-2 9,2 13,0" stroke="#5a504a" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M118,70 C122,66 130,66 132,70 C128,72 122,73 118,70 Z" fill="#f5f2ea" />
        <path d="M122,72 C152,62 182,72 188,96 C190,108 186,116 178,118 C179,111 175,106 166,105 C152,105 136,108 122,104 C114,94 114,80 122,72 Z" fill="#f7a823" />
        <path d="M128,78 C150,70 172,78 182,94" stroke="#ffd27a" strokeWidth="3.5" fill="none" strokeLinecap="round" opacity="0.8" />
        <path d="M122,104 C136,108 152,107 168,107 C160,116 140,121 124,116 Z" fill="#e2861a" />
        <path d="M178,118 C183,116 186,111 186,106" stroke="#b9650c" strokeWidth="2" fill="none" />
        <ellipse cx="138" cy="86" rx="3" ry="2" fill="#8a4b08" />
        <circle cx="108" cy="82" r="6.5" fill="#f3e48a" />
        <Eye x={108} y={82} r={3.4} />
        <path d="M94,74 L122,70 L116,78 Z" fill="#1c1715" />
      </>
    ),
  }),

  // CLB: Japanese serow on the misty crags (the mountains around Appi have them)
  serow: (u) => ({
    ring: '#5b6b62',
    bg: (
      <>
        <linearGradient id={`${u}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e9eef0" />
          <stop offset="1" stopColor="#b8c6c9" />
        </linearGradient>
        <rect width="200" height="200" fill={`url(#${u}s)`} />
        <path d="M-6,120 L30,60 L52,86 L80,34 L104,70 L128,40 L160,92 L190,58 L210,96 L210,206 L-6,206 Z" fill="#9aabaf" />
        <path d="M-6,150 L24,112 L48,128 L70,100 L96,126 L210,118 L210,206 L-6,206 Z" fill="#7d9093" />
        {[16, 32, 172, 186].map((x, i) => (
          <path key={x} d={`M${x},${118 - (i % 2) * 8} l-8,18 h5 l-7,14 h20 l-7,-14 h5 Z`} fill="#4e6560" />
        ))}
        <rect width="200" height="200" fill="#fff" opacity="0.18" />
      </>
    ),
    fg: (
      <>
        <path d={fur(100, 196, 70, 22, 6)} fill="#3a3430" />
        <path d="M76,144 C88,160 112,160 124,144 C122,170 112,186 100,190 C88,186 78,170 76,144 Z" fill="#e2dbd0" />
        <path d="M86,54 C82,42 80,30 83,18 C88,28 93,40 95,52 Z" fill="#1b1816" />
        <path d="M114,54 C118,42 120,30 117,18 C112,28 107,40 105,52 Z" fill="#1b1816" />
        <path d="M84,40 l8,-2 M83,32 l7,-2 M116,40 l-8,-2 M117,32 l-7,-2" stroke="#4a4440" strokeWidth="1.6" />
        <ellipse cx="54" cy="70" rx="24" ry="10" transform="rotate(-22 54 70)" fill="#4a433e" />
        <ellipse cx="56" cy="71" rx="15" ry="5" transform="rotate(-22 56 71)" fill="#a39689" />
        <ellipse cx="146" cy="70" rx="24" ry="10" transform="rotate(22 146 70)" fill="#4a433e" />
        <ellipse cx="144" cy="71" rx="15" ry="5" transform="rotate(22 144 71)" fill="#a39689" />
        <path d="M68,72 C68,56 82,48 100,48 C118,48 132,56 132,72 L128,114 C126,134 114,148 100,148 C86,148 74,134 72,114 Z" fill="#5a524b" />
        <path d="M80,58 C90,52 110,52 120,58 C114,64 106,66 100,66 C94,66 86,64 80,58 Z" fill="#6f665d" />
        <path d="M82,62 l4,8 M92,58 l2,9 M108,58 l-2,9 M118,62 l-4,8" stroke="#3e3833" strokeWidth="2" strokeLinecap="round" />
        <ellipse cx="100" cy="132" rx="19" ry="15" fill="#776d63" />
        <path d="M88,136 C92,130 108,130 112,136 C110,142 104,144 100,144 C96,144 90,142 88,136 Z" fill="#1d1a18" />
        <circle cx="94" cy="137" r="1.8" fill="#4a4440" />
        <circle cx="106" cy="137" r="1.8" fill="#4a4440" />
        <ellipse cx="90" cy="99" rx="4" ry="2.5" fill="#2b2622" />
        <ellipse cx="110" cy="99" rx="4" ry="2.5" fill="#2b2622" />
        <Eye x={81} y={88} r={6} />
        <Eye x={119} y={88} r={6} />
      </>
    ),
  }),

  // DSC: pika on a boulder field, with a stalk of hay for the winter
  pika: (u) => ({
    ring: '#8a7b5a',
    bg: (
      <>
        <linearGradient id={`${u}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a9d7f2" />
          <stop offset="1" stopColor="#eaf6fb" />
        </linearGradient>
        <rect width="200" height="200" fill={`url(#${u}s)`} />
        <path d="M-6,86 L40,52 L70,72 L104,44 L150,78 L210,60 L210,206 L-6,206 Z" fill="#c4ccd2" />
        <path d="M0,104 C30,92 60,100 90,96 C130,90 170,100 210,92 L210,206 L0,206 Z" fill="#9aa5ad" />
        {[
          [14, 118, 26],
          [58, 112, 20],
          [160, 114, 24],
          [190, 126, 18],
        ].map(([x, y, r]) => (
          <path key={x} d={`M${x - r},${y + r * 0.6} C${x - r},${y - r * 0.5} ${x - r * 0.3},${y - r * 0.8} ${x + r * 0.2},${y - r * 0.7} C${x + r},${y - r * 0.4} ${x + r},${y + r * 0.2} ${x + r * 0.8},${y + r * 0.7} Z`} fill="#b3bcc3" stroke="#8c979f" strokeWidth="1.5" />
        ))}
        {[
          [30, 100, '#f6d34a'],
          [40, 104, '#c08be0'],
          [172, 100, '#f6d34a'],
          [150, 104, '#fff'],
        ].map(([x, y, c]) => (
          <circle key={`${x}${y}`} cx={x as number} cy={y as number} r="3" fill={c as string} />
        ))}
      </>
    ),
    fg: (
      <>
        <circle cx="58" cy="84" r="17" fill="#f0e6d6" />
        <circle cx="58" cy="84" r="14" fill="#86705a" />
        <circle cx="59" cy="85" r="8" fill="#c9a28e" />
        <circle cx="142" cy="84" r="17" fill="#f0e6d6" />
        <circle cx="142" cy="84" r="14" fill="#86705a" />
        <circle cx="141" cy="85" r="8" fill="#c9a28e" />
        <path d={fur(100, 140, 66, 30, 4)} fill="#937b63" />
        <ellipse cx="100" cy="118" rx="50" ry="36" fill="#a58d73" />
        <ellipse cx="100" cy="134" rx="17" ry="12" fill="#cdb79c" />
        <path d="M95,127 C97,124 103,124 105,127 C103,131 101,132 100,132 C99,132 97,131 95,127 Z" fill="#3b2a20" />
        <path d="M100,132 v4 M100,136 q-5,5 -10,2 M100,136 q5,5 10,2" stroke="#3b2a20" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <path d="M84,132 l-30,-6 M84,136 l-30,2 M116,132 l30,-6 M116,136 l30,2" stroke="#3b2a20" strokeWidth="1" opacity="0.55" />
        <Eye x={78} y={116} r={6.5} />
        <Eye x={122} y={116} r={6.5} />
        <path d="M88,142 C110,142 136,132 160,112" stroke="#5f8f3a" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M128,132 c4,-10 12,-12 16,-12 c-2,6 -8,12 -16,12 Z M146,120 c2,-10 10,-14 14,-14 c-1,6 -6,12 -14,14 Z" fill="#79a94b" />
        <circle cx="160" cy="111" r="3.5" fill="#f2c94c" />
        <circle cx="154" cy="106" r="2.5" fill="#f2c94c" />
        <ellipse cx="82" cy="190" rx="12" ry="8" fill="#7a6551" />
        <ellipse cx="118" cy="190" rx="12" ry="8" fill="#7a6551" />
      </>
    ),
  }),

  // NAV: Blakiston's fish owl by a moonlit river
  owl: (u) => ({
    ring: '#d39a2a',
    bg: (
      <>
        <linearGradient id={`${u}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0d1533" />
          <stop offset="1" stopColor="#2a3f74" />
        </linearGradient>
        <radialGradient id={`${u}m`}>
          <stop offset="0.4" stopColor="#fff6d8" />
          <stop offset="1" stopColor="#fff6d8" stopOpacity="0" />
        </radialGradient>
        <rect width="200" height="200" fill={`url(#${u}s)`} />
        <circle cx="156" cy="42" r="34" fill={`url(#${u}m)`} opacity="0.5" />
        <circle cx="156" cy="42" r="14" fill="#fff6d8" />
        {[
          [30, 30],
          [60, 18],
          [100, 26],
          [24, 70],
          [180, 90],
          [120, 12],
        ].map(([x, y]) => (
          <circle key={`${x}${y}`} cx={x} cy={y} r="1.2" fill="#fff" opacity="0.85" />
        ))}
        <path d="M-6,120 L14,70 L22,96 L30,60 L44,120 Z M156,120 L170,74 L180,98 L190,64 L206,120 Z" fill="#0b1229" />
        {[150, 162, 174].map((y, i) => (
          <rect key={y} x={14 + i * 40} y={y} width={30 - i * 4} height="2" rx="1" fill="#cfe0ff" opacity="0.5" />
        ))}
      </>
    ),
    fg: (
      <>
        <path d="M34,206 C28,150 52,112 100,108 C148,112 172,150 166,206 Z" fill="#7a5a3a" />
        {[0, 1, 2, 3, 4, 5].map((i) =>
          [0, 1, 2].map((r) => <path key={`${i}${r}`} d={`M${54 + i * 18 + (r % 2) * 9},${142 + r * 18} l-1,10`} stroke="#3e2b19" strokeWidth="3" strokeLinecap="round" />),
        )}
        <path d="M60,74 C42,58 26,56 14,62 C26,64 36,72 42,84 C30,78 22,80 16,86 C32,86 44,92 52,100 Z" fill="#6a4c2e" />
        <path d="M140,74 C158,58 174,56 186,62 C174,64 164,72 158,84 C170,78 178,80 184,86 C168,86 156,92 148,100 Z" fill="#6a4c2e" />
        <ellipse cx="100" cy="96" rx="54" ry="46" fill="#8c6b46" />
        {[
          [72, 66],
          [86, 60],
          [100, 58],
          [114, 60],
          [128, 66],
          [64, 120],
          [136, 120],
          [80, 126],
          [120, 126],
        ].map(([x, y]) => (
          <path key={`${x}${y}`} d={`M${x},${y} l-1,8`} stroke="#4d3620" strokeWidth="2.6" strokeLinecap="round" />
        ))}
        <ellipse cx="79" cy="98" rx="21" ry="19" fill="#a8865c" />
        <ellipse cx="121" cy="98" rx="21" ry="19" fill="#a8865c" />
        <path d="M62,80 C72,78 84,82 94,90 M138,80 C128,78 116,82 106,90" stroke="#efe2c4" strokeWidth="4" fill="none" strokeLinecap="round" />
        <Eye x={79} y={98} r={13} iris="#f4b12a" />
        <Eye x={121} y={98} r={13} iris="#f4b12a" />
        <path d="M100,102 C93,105 93,117 100,124 C107,117 107,105 100,102 Z" fill="#7b776d" />
        <path d="M100,104 C97,108 97,114 100,120" stroke="#a29d92" strokeWidth="1.6" fill="none" />
        <path d="M82,130 Q100,142 118,130 Q112,148 100,150 Q88,148 82,130 Z" fill="#efe6d2" />
      </>
    ),
  }),

  // ARM: red panda in the bamboo
  panda: (u) => ({
    ring: '#c2521f',
    bg: (
      <>
        <linearGradient id={`${u}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d9ecd2" />
          <stop offset="1" stopColor="#9cc39a" />
        </linearGradient>
        <rect width="200" height="200" fill={`url(#${u}s)`} />
        {[18, 42, 158, 184].map((x, i) => (
          <g key={x} opacity={0.75 - (i % 2) * 0.25}>
            <rect x={x - 5} y="-10" width="10" height="220" rx="5" fill="#6f9e63" />
            {[40, 96, 152].map((y) => (
              <rect key={y} x={x - 6} y={y + i * 9} width="12" height="3" rx="1.5" fill="#557f4c" />
            ))}
            <path d={`M${x},${60 + i * 9} c14,-6 26,-4 34,2 c-12,4 -24,4 -34,-2 Z`} fill="#7fb46e" transform={i < 2 ? '' : `scale(-1,1) translate(${-2 * x},0)`} />
          </g>
        ))}
      </>
    ),
    fg: (
      <>
        <path d="M28,206 C32,166 58,148 100,148 C142,148 168,166 172,206 Z" fill="#3a201a" />
        <path d="M28,206 C30,180 42,164 60,156 C56,176 56,192 60,206 Z M172,206 C170,180 158,164 140,156 C144,176 144,192 140,206 Z" fill="#9b3c17" />
        <path d="M44,90 C32,66 36,44 52,36 C68,38 82,52 86,64 Z" fill="#f6eee3" />
        <path d="M50,84 C42,68 44,52 54,46 C64,48 74,58 78,66 Z" fill="#5d2412" />
        <path d="M156,90 C168,66 164,44 148,36 C132,38 118,52 114,64 Z" fill="#f6eee3" />
        <path d="M150,84 C158,68 156,52 146,46 C136,48 126,58 122,66 Z" fill="#5d2412" />
        <path d="M38,110 C38,72 66,54 100,54 C134,54 162,72 162,110 C162,128 156,140 148,148 L154,158 L138,154 C128,162 114,166 100,166 C86,166 72,162 62,154 L46,158 L52,148 C44,140 38,128 38,110 Z" fill="#d9682a" />
        <path d="M52,92 C62,70 82,62 100,62 C118,62 138,70 148,92" stroke="#e98a45" strokeWidth="6" fill="none" strokeLinecap="round" opacity="0.7" />
        <ellipse cx="62" cy="128" rx="14" ry="11" fill="#f7efe4" />
        <ellipse cx="138" cy="128" rx="14" ry="11" fill="#f7efe4" />
        <ellipse cx="100" cy="134" rx="26" ry="21" fill="#f7efe4" />
        <ellipse cx="78" cy="88" rx="12" ry="8" transform="rotate(-14 78 88)" fill="#f7efe4" />
        <ellipse cx="122" cy="88" rx="12" ry="8" transform="rotate(14 122 88)" fill="#f7efe4" />
        <path d="M80,112 C82,124 82,136 76,148 M120,112 C118,124 118,136 124,148" stroke="#8e3413" strokeWidth="7" fill="none" strokeLinecap="round" />
        <Eye x={81} y={108} r={7.5} />
        <Eye x={119} y={108} r={7.5} />
        <path d="M91,124 Q100,119 109,124 Q107,132 100,133 Q93,132 91,124 Z" fill="#1d1310" />
        <path d="M100,133 v5 M100,138 q-5,5 -10,2 M100,138 q5,5 10,2" stroke="#3b2018" strokeWidth="2" fill="none" strokeLinecap="round" />
      </>
    ),
  }),

  // RACE: snow monkey in hot-spring steam, snow on its head
  monkey: (u) => ({
    ring: '#7b8fa6',
    bg: (
      <>
        <linearGradient id={`${u}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9fb9d3" />
          <stop offset="1" stopColor="#e8f0f7" />
        </linearGradient>
        <rect width="200" height="200" fill={`url(#${u}s)`} />
        {[
          [20, 30],
          [48, 64],
          [170, 24],
          [150, 70],
          [184, 120],
          [14, 120],
          [90, 18],
          [130, 40],
        ].map(([x, y]) => (
          <circle key={`${x}${y}`} cx={x} cy={y} r="2.4" fill="#fff" />
        ))}
        <path d="M-6,172 C30,160 60,166 100,164 C140,162 170,158 206,170 L206,206 L-6,206 Z" fill="#7fb3c9" />
        <ellipse cx="40" cy="166" rx="34" ry="10" fill="#fff" opacity="0.6" />
        <ellipse cx="164" cy="160" rx="30" ry="9" fill="#fff" opacity="0.55" />
      </>
    ),
    fg: (
      <>
        <path d={fur(100, 196, 66, 26, 5)} fill="#8f8170" />
        <path d={fur(100, 104, 58, 30, 6)} fill="#a89886" />
        <ellipse cx="44" cy="108" rx="8" ry="11" fill="#d98a80" />
        <ellipse cx="156" cy="108" rx="8" ry="11" fill="#d98a80" />
        <path d="M100,76 C120,66 144,80 138,108 C134,132 118,150 100,152 C82,150 66,132 62,108 C56,80 80,66 100,76 Z" fill="#e07a70" />
        <path d="M70,98 C80,90 92,92 100,96 C108,92 120,90 130,98" stroke="#b8544d" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M100,98 C97,106 97,114 100,120" stroke="#c9645c" strokeWidth="3" fill="none" />
        <Eye x={86} y={106} r={5} iris="#7a4b22" />
        <Eye x={114} y={106} r={5} iris="#7a4b22" />
        <ellipse cx="96" cy="124" rx="2.2" ry="1.6" fill="#8f3d38" />
        <ellipse cx="104" cy="124" rx="2.2" ry="1.6" fill="#8f3d38" />
        <path d="M88,138 Q100,143 112,138" stroke="#8f3d38" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <path d="M64,62 C72,46 90,44 98,50 C108,40 128,44 134,58 C140,56 146,62 142,68 C120,62 82,60 60,70 C56,66 58,62 64,62 Z" fill="#fff" />
        <path d="M64,66 C84,60 118,60 140,66" stroke="#d6e4f0" strokeWidth="2" fill="none" />
        <path d="M30,180 C50,170 70,176 80,190 M120,190 C130,174 152,170 170,182" stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.6" />
      </>
    ),
  }),

  // Rest: dugong asleep in a seagrass meadow
  dugong: (u) => ({
    ring: '#2f8a9c',
    bg: (
      <>
        <linearGradient id={`${u}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8fdde0" />
          <stop offset="1" stopColor="#1f6f8b" />
        </linearGradient>
        <rect width="200" height="200" fill={`url(#${u}s)`} />
        <path d="M40,-10 L70,-10 L40,200 L10,200 Z M110,-10 L130,-10 L120,200 L96,200 Z M160,-10 L176,-10 L196,200 L176,200 Z" fill="#fff" opacity="0.1" />
        {[8, 22, 36, 150, 166, 182, 196].map((x, i) => (
          <path key={x} d={`M${x},206 C${x - 6},${170 - (i % 3) * 10} ${x + 8},${150 - (i % 2) * 14} ${x + 2},${126 - (i % 3) * 8}`} stroke={i % 2 ? '#3f9b5e' : '#5bb36f'} strokeWidth="5" fill="none" strokeLinecap="round" />
        ))}
      </>
    ),
    fg: (
      <g transform="translate(-8 4) scale(0.94)">
        <path d="M30,124 C16,112 4,102 -8,98 C2,112 8,122 6,130 C2,138 -4,150 -8,162 C6,156 18,146 30,136 Z" fill="#7f8a92" />
        <path d="M24,122 C44,96 92,86 132,94 C158,100 176,112 180,128 C182,140 176,150 164,152 C152,162 120,168 90,164 C58,160 36,148 24,136 Z" fill="#9aa5ac" />
        <path d="M30,138 C54,154 96,162 132,156 C148,154 160,150 166,146 C150,160 118,166 90,163 C60,160 40,150 30,138 Z" fill="#c2c8cc" />
        <path d="M40,112 C70,96 110,92 140,100" stroke="#b9c2c8" strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.8" />
        <path d="M156,108 C176,110 190,126 186,144 C184,154 176,158 168,156 C160,152 156,142 156,132 Z" fill="#b5aaa6" />
        <path d="M162,154 C168,160 178,160 184,152 C182,160 174,164 166,162 Z" fill="#8f7f79" />
        {[0, 1, 2, 3, 4].map((i) => (
          <circle key={i} cx={166 + i * 3.8} cy={156 - (i % 2) * 2} r="1" fill="#5e504b" />
        ))}
        <path d="M176,114 q3,-2 6,1" stroke="#6d5d57" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M145,118 q6,5 12,0" stroke="#3d464c" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        <path d="M140,130 c4,6 4,12 0,18 M132,128 c4,7 4,14 0,20" stroke="#87929a" strokeWidth="1.6" fill="none" opacity="0.7" />
        <path d="M120,156 C126,168 120,180 106,186 C108,174 110,166 108,158 Z" fill="#87929a" />
        {[
          [182, 96, 3.6],
          [188, 76, 2.8],
          [180, 58, 2],
        ].map(([x, y, r]) => (
          <circle key={y} cx={x} cy={y} r={r} fill="none" stroke="#fff" strokeWidth="1.6" opacity="0.8" />
        ))}
      </g>
    ),
  }),

  // Comeback: Amami rabbit in the fern forest as the sun comes up
  rabbit: (u) => ({
    ring: '#d9824a',
    bg: (
      <>
        <linearGradient id={`${u}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#24345a" />
          <stop offset="0.55" stopColor="#7d6a8c" />
          <stop offset="1" stopColor="#f3a96f" />
        </linearGradient>
        <rect width="200" height="200" fill={`url(#${u}s)`} />
        <circle cx="100" cy="196" r="60" fill="#ffd59a" opacity="0.5" />
        {[
          [26, 24],
          [70, 14],
          [150, 20],
          [178, 44],
        ].map(([x, y]) => (
          <circle key={`${x}${y}`} cx={x} cy={y} r="1.3" fill="#fff" opacity="0.7" />
        ))}
        {[
          [14, 120, -1],
          [186, 120, 1],
          [36, 150, -1],
          [164, 150, 1],
        ].map(([x, y, s], i) => (
          <g key={i} transform={`translate(${x} ${y}) scale(${s} 1)`}>
            <path d="M0,90 C4,50 14,20 34,0" stroke="#22402c" strokeWidth="3" fill="none" />
            {[0, 1, 2, 3, 4, 5].map((j) => (
              <ellipse key={j} cx={6 + j * 4.5} cy={70 - j * 12} rx="12" ry="3.5" transform={`rotate(-35 ${6 + j * 4.5} ${70 - j * 12})`} fill="#2c5238" />
            ))}
          </g>
        ))}
      </>
    ),
    fg: (
      <>
        <ellipse cx="100" cy="161" rx="62" ry="48" fill="#f3a96f" opacity="0.5" />
        <ellipse cx="100" cy="162" rx="60" ry="46" fill="#2e211b" />
        <ellipse cx="76" cy="76" rx="12" ry="16" transform="rotate(-18 76 76)" fill="#3a2a22" />
        <ellipse cx="77" cy="78" rx="6" ry="10" transform="rotate(-18 77 78)" fill="#6b4b3d" />
        <ellipse cx="124" cy="76" rx="12" ry="16" transform="rotate(18 124 76)" fill="#3a2a22" />
        <ellipse cx="123" cy="78" rx="6" ry="10" transform="rotate(18 123 78)" fill="#6b4b3d" />
        <ellipse cx="100" cy="109" rx="48.5" ry="41.5" fill="#f3a96f" opacity="0.55" />
        <ellipse cx="100" cy="110" rx="47" ry="40" fill="#45332a" />
        <path d="M64,96 C72,78 86,72 100,72 C114,72 128,78 136,96" stroke="#5e4638" strokeWidth="5" fill="none" strokeLinecap="round" />
        <ellipse cx="100" cy="124" rx="17" ry="12" fill="#5a4235" />
        <Eye x={82} y={104} r={5.5} iris="#3a2216" />
        <Eye x={118} y={104} r={5.5} iris="#3a2216" />
        <path d="M95,118 Q100,115 105,118 Q103,123 100,123 Q97,123 95,118 Z" fill="#8a5a48" />
        <path d="M100,123 v4 M100,127 q-4,4 -8,1 M100,127 q4,4 8,1" stroke="#1d1410" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <path d="M86,124 l-26,-4 M86,128 l-26,4 M114,124 l26,-4 M114,128 l26,4" stroke="#c9a48c" strokeWidth="0.9" opacity="0.6" />
        <ellipse cx="84" cy="196" rx="11" ry="7" fill="#3a2a22" />
        <ellipse cx="116" cy="196" rx="11" ry="7" fill="#3a2a22" />
      </>
    ),
  }),
};

export function SpiritPortrait({ id, size, className, style, title, dim = false }: { id: SpiritId; size?: number; className?: string; style?: CSSProperties; title?: string; dim?: boolean }) {
  const u = `sp${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const art = ART[id](u);
  const label = title ?? SPIRITS[id].name;
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className={`spirit ${dim ? 'spirit-dim' : ''} ${className ?? ''}`} style={style} role="img" aria-label={label}>
      <defs>
        <clipPath id={`${u}c`}>
          <circle cx="100" cy="100" r="96" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${u}c)`}>
        {art.bg}
        <g className="spirit-body">{art.fg}</g>
      </g>
      <circle cx="100" cy="100" r="96" fill="none" stroke={art.ring} strokeWidth="5" />
      <circle cx="100" cy="100" r="91" fill="none" stroke="#fff" strokeWidth="1.5" opacity="0.6" />
    </svg>
  );
}
