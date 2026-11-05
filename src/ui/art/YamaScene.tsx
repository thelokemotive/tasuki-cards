// 山 Yama: an original, hand-painted-style mountain landscape drawn in SVG (no images, no network). Layered
// ridges with atmospheric perspective, a snow-capped volcanic peak, big soft cumulus clouds, cedar forest,
// a winding trail, and a sky for each season and time of day. Inspired by painted Japanese landscapes in
// general; every shape here is generated from the numbers below. Used behind cards, on the home page,
// in the navigation and behind the projector boards.
import { useId, useMemo, type CSSProperties } from 'react';

export type SceneMood = 'spring' | 'summer' | 'autumn' | 'winter' | 'night' | 'dawn';

interface Palette {
  sky: [string, string, string];
  sun: string;
  sunGlow: string;
  peak: string;
  snow: string;
  ridges: [string, string, string, string];
  trees: string;
  treeTips?: string;
  dots?: string[];
  cloud: string;
  cloudShade: string;
  trail: string;
  mist: string;
  stars?: boolean;
}

const PALETTES: Record<SceneMood, Palette> = {
  spring: {
    sky: ['#9fd3f2', '#d9eefa', '#fde8ef'],
    sun: '#fffbe6',
    sunGlow: '#fff3c9',
    peak: '#9fb6d6',
    snow: '#ffffff',
    ridges: ['#b7c9e2', '#93b9a2', '#6f9f78', '#47785a'],
    trees: '#3a684b',
    dots: ['#f7b9cc', '#fbd3df', '#ffffff'],
    cloud: '#ffffff',
    cloudShade: '#d9e6f5',
    trail: '#efe2c4',
    mist: 'rgb(255 255 255 / 45%)',
  },
  summer: {
    sky: ['#4fa8e0', '#9fd2f0', '#ffe7a6'],
    sun: '#fff6cc',
    sunGlow: '#ffd977',
    peak: '#7f97c0',
    snow: '#f4f7ff',
    ridges: ['#94a9cc', '#76a77a', '#4f8d5b', '#2f6a43'],
    trees: '#255a39',
    dots: ['#ffe58a'],
    cloud: '#fffdf6',
    cloudShade: '#f2d6a6',
    trail: '#f0dcae',
    mist: 'rgb(255 245 220 / 40%)',
  },
  autumn: {
    sky: ['#e98a62', '#f6b77c', '#ffe1b0'],
    sun: '#fff0cf',
    sunGlow: '#ffc58a',
    peak: '#a97f8f',
    snow: '#fff3ec',
    ridges: ['#b98b93', '#c76b43', '#a84a2e', '#6e2c20'],
    trees: '#5c241b',
    dots: ['#e84a2f', '#f39a2e', '#ffd45c'],
    cloud: '#fff1e2',
    cloudShade: '#eab08f',
    trail: '#f2d3a6',
    mist: 'rgb(255 230 210 / 40%)',
  },
  winter: {
    sky: ['#8fb7de', '#cfe1f3', '#f4f8fc'],
    sun: '#ffffff',
    sunGlow: '#eaf2ff',
    peak: '#c9d8ea',
    snow: '#ffffff',
    ridges: ['#d3dfec', '#e9f0f7', '#a9bccf', '#6b7f95'],
    trees: '#3f5368',
    treeTips: '#ffffff',
    dots: ['#ffffff'],
    cloud: '#ffffff',
    cloudShade: '#d3e0ee',
    trail: '#ffffff',
    mist: 'rgb(255 255 255 / 60%)',
  },
  night: {
    sky: ['#0b1030', '#1d2560', '#3b3f86'],
    sun: '#fff6d2',
    sunGlow: '#a9a7ff',
    peak: '#2a3373',
    snow: '#d9defc',
    ridges: ['#2b3474', '#232b62', '#1a2150', '#11163a'],
    trees: '#0c112e',
    dots: ['#fff3a8'],
    cloud: '#3a4290',
    cloudShade: '#252c6a',
    trail: '#5d64b3',
    mist: 'rgb(140 150 255 / 18%)',
    stars: true,
  },
  dawn: {
    sky: ['#4b3f8f', '#e46a5a', '#ffd29a'],
    sun: '#ffefd0',
    sunGlow: '#ff8a5b',
    peak: '#7d5f8f',
    snow: '#ffe6dc',
    ridges: ['#8f6d96', '#a5577a', '#7a3a5c', '#45213e'],
    trees: '#3a1b35',
    dots: ['#ffb38a'],
    cloud: '#ffd8c4',
    cloudShade: '#d97a74',
    trail: '#ffc9a3',
    mist: 'rgb(255 200 180 / 30%)',
  },
};

/** Small deterministic random generator (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A smooth ridgeline: heights from a sum of sines, drawn with quadratic curves through the midpoints. */
function ridgePoints(w: number, base: number, amp: number, seed: number, steps: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * w;
    const t = i / steps;
    const n = 0.55 * Math.sin(seed * 1.31 + t * 6.1) + 0.3 * Math.sin(seed * 2.17 + t * 13.7) + 0.15 * Math.sin(seed * 0.73 + t * 27.3);
    pts.push([x, base - amp * (0.5 + 0.5 * n)]);
  }
  return pts;
}

function ridgePath(pts: [number, number][], h: number): string {
  let d = `M0,${h} L${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    d += ` Q${x0.toFixed(1)},${y0.toFixed(1)} ${((x0 + x1) / 2).toFixed(1)},${((y0 + y1) / 2).toFixed(1)}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L${last[0].toFixed(1)},${last[1].toFixed(1)} L${last[0].toFixed(1)},${h} Z`;
}

function yAt(pts: [number, number][], x: number): number {
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
    }
  }
  return pts[pts.length - 1][1];
}

/** A cumulus cloud: shaded underside, bright puffs on top, flat-ish base. */
function Cloud({ x, y, s, p, flip = false }: { x: number; y: number; s: number; p: Palette; flip?: boolean }) {
  const puffs: [number, number, number][] = [
    [-34, 2, 16],
    [-16, -10, 22],
    [8, -16, 26],
    [32, -6, 19],
    [50, 4, 13],
    [-48, 8, 10],
  ];
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      <ellipse cx="2" cy="12" rx="58" ry="9" fill={p.cloudShade} opacity="0.9" />
      {puffs.map(([cx, cy, r], i) => (
        <circle key={`s${i}`} cx={cx} cy={cy + 4} r={r} fill={p.cloudShade} />
      ))}
      {puffs.map(([cx, cy, r], i) => (
        <circle key={`c${i}`} cx={cx - 1.5} cy={cy} r={r * 0.94} fill={p.cloud} />
      ))}
    </g>
  );
}

export interface YamaSceneProps {
  mood: SceneMood;
  /** 'wide' for banners and the projector, 'tall' for cards. */
  shape?: 'wide' | 'tall';
  /** Changes cloud and tree placement, so cards do not all look identical. */
  seed?: number;
  /** A rising sun with rays (the In-Form card). */
  risingSun?: boolean;
  /** Draw the winding trail. */
  trail?: boolean;
  className?: string;
  style?: CSSProperties;
  /** How the scene fills its box (default: cover, anchored to the bottom). */
  preserveAspectRatio?: string;
}

export function YamaScene({ mood, shape = 'wide', seed = 7, risingSun = false, trail = true, className, style, preserveAspectRatio = 'xMidYMax slice' }: YamaSceneProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const p = PALETTES[mood];
  const W = shape === 'wide' ? 480 : 240;
  const H = shape === 'wide' ? 240 : 340;
  const art = useMemo(() => {
    const r = rng(seed * 9973 + (shape === 'wide' ? 1 : 2));
    const horizon = shape === 'wide' ? 0.56 : 0.5;
    const peakX = W * (0.38 + r() * 0.24);
    const peakTop = H * (shape === 'wide' ? 0.2 : 0.26);
    const base = H * (horizon + 0.12);
    const span = W * (shape === 'wide' ? 0.62 : 0.95);
    const peak = `M${peakX - span},${base} C${peakX - span * 0.45},${base - 8} ${peakX - span * 0.16},${peakTop + 26} ${peakX - 13},${peakTop + 3} L${peakX - 5},${peakTop} L${peakX + 6},${peakTop + 1} L${peakX + 14},${peakTop + 4} C${peakX + span * 0.18},${peakTop + 30} ${peakX + span * 0.5},${base - 10} ${peakX + span},${base} Z`;
    // A lower shoulder peak on one side (Iwate-san has one), and the shaded flank away from the light.
    const side = r() > 0.5 ? 1 : -1;
    const shX = peakX + side * span * 0.42;
    const shTop = peakTop + (base - peakTop) * 0.42;
    const shoulder = `M${shX - span * 0.5},${base} C${shX - span * 0.25},${base - 6} ${shX - 30},${shTop + 14} ${shX - 6},${shTop + 1} L${shX + 8},${shTop} C${shX + 34},${shTop + 16} ${shX + span * 0.3},${base - 6} ${shX + span * 0.55},${base} Z`;
    const shade = `M${peakX + 6},${peakTop + 1} L${peakX + 14},${peakTop + 4} C${peakX + span * 0.18},${peakTop + 30} ${peakX + span * 0.5},${base - 10} ${peakX + span},${base} L${peakX + span * 0.08},${base} C${peakX + 30},${base - 40} ${peakX + 10},${peakTop + 40} ${peakX + 6},${peakTop + 1} Z`;
    const capY = peakTop + (base - peakTop) * 0.24;
    const capL = peakX - 13 - (capY - peakTop) * 0.62;
    const capR = peakX + 14 + (capY - peakTop) * 0.66;
    let cap = `M${peakX - 13},${peakTop + 3} L${peakX - 5},${peakTop} L${peakX + 6},${peakTop + 1} L${peakX + 14},${peakTop + 4} L${capR},${capY}`;
    const teeth = 11;
    for (let i = 1; i <= teeth; i++) {
      const x = capR - ((capR - capL) * i) / teeth;
      // snow lingers longer in the gullies: long thin fingers between short ridges
      const y = capY + (i % 2 ? 5 + r() * 12 : -3 + r() * 4);
      cap += ` L${x.toFixed(1)},${y.toFixed(1)}`;
    }
    cap += ' Z';
    const amp = shape === 'wide' ? [26, 30, 26, 22] : [30, 34, 30, 26];
    const bases = shape === 'wide' ? [0.64, 0.72, 0.82, 0.93] : [0.6, 0.68, 0.78, 0.9];
    const ridges = bases.map((b, i) => ridgePoints(W, H * b, amp[i], seed + i * 3.3, shape === 'wide' ? 9 : 6));
    const clouds = Array.from({ length: shape === 'wide' ? 4 : 3 }, (_, i) => ({
      x: (W * (i + 0.3 + r() * 0.5)) / (shape === 'wide' ? 4 : 3),
      y: H * (0.1 + r() * (shape === 'wide' ? 0.26 : 0.2)),
      s: (shape === 'wide' ? 0.55 : 0.42) + r() * 0.35,
      flip: r() > 0.5,
    }));
    const front = ridges[3];
    const mid = ridges[2];
    const treesFront = Array.from({ length: shape === 'wide' ? 34 : 18 }, () => {
      const x = r() * W;
      return { x, y: yAt(front, x) + 2 + r() * 3, h: 10 + r() * 14 };
    });
    const treesMid = Array.from({ length: shape === 'wide' ? 26 : 14 }, () => {
      const x = r() * W;
      return { x, y: yAt(mid, x) + 2, h: 6 + r() * 7 };
    });
    const dots = p.dots ? Array.from({ length: shape === 'wide' ? 46 : 24 }, () => ({ x: r() * W, y: 0, r: 1 + r() * 2.2, c: p.dots![Math.floor(r() * p.dots!.length)] })).map((d) => ({ ...d, y: yAt(front, d.x) + 4 + r() * (H - yAt(front, d.x)) * 0.5 })) : [];
    const stars = p.stars ? Array.from({ length: shape === 'wide' ? 70 : 40 }, () => ({ x: r() * W, y: r() * H * 0.55, r: 0.4 + r() * 1.1, o: 0.4 + r() * 0.6 })) : [];
    const sun = { x: W * (0.12 + r() * 0.2) + (peakX < W / 2 ? W * 0.55 : 0), y: H * (mood === 'night' ? 0.16 : mood === 'dawn' ? 0.5 : 0.22) };
    const tx = W * 0.5;
    const trailD = `M${tx - 10},${H + 4} C${tx + 50},${H * 0.94} ${tx - 70},${H * 0.88} ${tx - 20},${H * 0.83} S${tx + 40},${H * 0.76} ${tx + 8},${yAt(front, tx + 8) + 6}`;
    return { peak, shoulder, shade, cap, ridges, clouds, treesFront, treesMid, dots, stars, sun, trailD, peakX, peakTop };
  }, [W, H, seed, shape, mood, p.dots, p.stars]);

  const id = (k: string) => `${k}${uid}`;
  const sunR = shape === 'wide' ? 15 : 13;
  return (
    <svg className={className} style={style} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio={preserveAspectRatio} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id('sky')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.sky[0]} />
          <stop offset="0.55" stopColor={p.sky[1]} />
          <stop offset="1" stopColor={p.sky[2]} />
        </linearGradient>
        <radialGradient id={id('glow')}>
          <stop offset="0" stopColor={p.sunGlow} stopOpacity="0.9" />
          <stop offset="1" stopColor={p.sunGlow} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id('peak')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={p.peak} />
          <stop offset="0.5" stopColor={p.peak} />
          <stop offset="1" stopColor={p.ridges[0]} />
        </linearGradient>
        <linearGradient id={id('mist')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor={p.mist} />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${id('sky')})`} />
      {mood === 'night' && <path d={`M${-20},${H * 0.42} Q${W * 0.45},${H * 0.02} ${W + 20},${H * 0.2}`} stroke="#c9c6ff" strokeOpacity="0.12" strokeWidth={shape === 'wide' ? 40 : 30} fill="none" strokeLinecap="round" />}
      {art.stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity={s.o} />
      ))}
      {risingSun && (
        <g opacity="0.55">
          {Array.from({ length: 12 }, (_, i) => {
            const a = (Math.PI * (i + 0.5)) / 12;
            const L = W * 1.2;
            return <path key={i} d={`M${W / 2},${H * 0.62} L${W / 2 - Math.cos(a - 0.06) * L},${H * 0.62 - Math.sin(a - 0.06) * L} L${W / 2 - Math.cos(a + 0.06) * L},${H * 0.62 - Math.sin(a + 0.06) * L} Z`} fill="#fff1d6" opacity={i % 2 ? 0.5 : 0.25} />;
          })}
        </g>
      )}
      {risingSun ? (
        <>
          <circle cx={W / 2} cy={H * 0.5} r={sunR * 4} fill={`url(#${id('glow')})`} />
          <circle cx={W / 2} cy={H * 0.5} r={sunR * 1.5} fill="#e8462c" />
        </>
      ) : (
        <>
          <circle cx={art.sun.x} cy={art.sun.y} r={sunR * 3.4} fill={`url(#${id('glow')})`} />
          {mood === 'night' ? (
            <>
              <mask id={id('moon')}>
                <circle cx={art.sun.x} cy={art.sun.y} r={sunR} fill="#fff" />
                <circle cx={art.sun.x + sunR * 0.55} cy={art.sun.y - sunR * 0.28} r={sunR * 0.88} fill="#000" />
              </mask>
              <circle cx={art.sun.x} cy={art.sun.y} r={sunR} fill={p.sun} mask={`url(#${id('moon')})`} />
            </>
          ) : (
            <circle cx={art.sun.x} cy={art.sun.y} r={sunR} fill={p.sun} />
          )}
        </>
      )}
      {art.clouds.slice(0, 1).map((c, i) => (
        <Cloud key={`b${i}`} x={c.x} y={c.y + H * 0.08} s={c.s * 0.8} p={p} flip={c.flip} />
      ))}
      <path d={art.shoulder} fill={p.peak} opacity="0.85" />
      <path d={art.peak} fill={`url(#${id('peak')})`} />
      <path d={art.shade} fill={p.sky[0]} opacity="0.16" />
      <path d={art.cap} fill={p.snow} opacity="0.95" />
      <path d={ridgePath(art.ridges[0], H)} fill={p.ridges[0]} />
      <rect y={H * 0.46} width={W} height={H * 0.22} fill={`url(#${id('mist')})`} />
      {art.clouds.slice(1).map((c, i) => (
        <Cloud key={`c${i}`} x={c.x} y={c.y} s={c.s} p={p} flip={c.flip} />
      ))}
      <path d={ridgePath(art.ridges[1], H)} fill={p.ridges[1]} />
      <path d={ridgePath(art.ridges[2], H)} fill={p.ridges[2]} />
      {art.treesMid.map((t, i) => (
        <path key={`m${i}`} d={`M${t.x},${t.y - t.h} L${t.x + t.h * 0.28},${t.y} L${t.x - t.h * 0.28},${t.y} Z`} fill={p.ridges[3]} opacity="0.55" />
      ))}
      <rect y={H * 0.7} width={W} height={H * 0.14} fill={`url(#${id('mist')})`} opacity="0.7" />
      <path d={ridgePath(art.ridges[3], H)} fill={p.ridges[3]} />
      {trail && <path d={art.trailD} fill="none" stroke={p.trail} strokeWidth={shape === 'wide' ? 4 : 5} strokeLinecap="round" strokeDasharray="7 5" opacity="0.85" />}
      {art.treesFront.map((t, i) => (
        <g key={`f${i}`}>
          <path d={`M${t.x},${t.y - t.h} L${t.x + t.h * 0.3},${t.y} L${t.x - t.h * 0.3},${t.y} Z`} fill={p.trees} />
          {p.treeTips && <path d={`M${t.x},${t.y - t.h} L${t.x + t.h * 0.12},${t.y - t.h * 0.6} L${t.x - t.h * 0.12},${t.y - t.h * 0.6} Z`} fill={p.treeTips} />}
        </g>
      ))}
      {art.dots.map((d, i) => (
        <circle key={`d${i}`} cx={d.x} cy={d.y} r={d.r} fill={d.c} opacity="0.85" />
      ))}
    </svg>
  );
}

/** The mood for a date and hour: season by month, night after 18:00 and before 05:00, dawn 05:00–06:59. */
export function moodFor(date: Date): SceneMood {
  const h = date.getHours();
  if (h >= 18 || h < 5) return 'night';
  if (h < 7) return 'dawn';
  const m = date.getMonth() + 1;
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}
