// The reveal: good news one moment at a time, each with its spirit, a chime and the season falling around
// it (cherry petals in spring, fireflies in summer, maple leaves in autumn, snow in winter). Tap to go on.
// Only real things are celebrated (a week kept, a PB, a stat up, a badge), never just opening the app.
import { useEffect, useRef, useState } from 'react';
import type { Moment } from '../../engine/moments';
import { SPIRITS } from '../../engine/spirits';
import { SpiritPortrait } from '../art/Spirits';
import { buzz, chime, reducedMotion } from './juice';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  a: number;
  va: number;
  c: string;
  life: number;
}

const COLOURS: Record<Season, string[]> = {
  spring: ['#f7b9cc', '#fbd3df', '#ffffff', '#f49ab5'],
  summer: ['#fff3a0', '#ffe066', '#d4ff8a'],
  autumn: ['#e84a2f', '#f39a2e', '#ffd45c', '#c2321c'],
  winter: ['#ffffff', '#e6f0ff', '#cfe0ff'],
};

let mapleLeaf: Path2D | null = null;
const MAPLE_D = 'M0,-10 L2,-5.5 L5.5,-7.5 L4.2,-2.6 L9.5,-3.4 L6,0.6 L8.2,3.4 L2.8,2.8 L1,5.4 L0.6,10 L-0.6,10 L-1,5.4 L-2.8,2.8 L-8.2,3.4 L-6,0.6 L-9.5,-3.4 L-4.2,-2.6 L-5.5,-7.5 L-2,-5.5 Z';

function drawBit(g: CanvasRenderingContext2D, b: Bit, season: Season) {
  const MAPLE = (mapleLeaf ??= new Path2D(MAPLE_D));
  g.save();
  g.translate(b.x, b.y);
  g.rotate(b.a);
  g.fillStyle = b.c;
  if (season === 'spring') {
    g.beginPath();
    g.ellipse(0, 0, b.r, b.r * 0.6, 0, 0, Math.PI * 2);
    g.fill();
  } else if (season === 'summer') {
    g.globalAlpha = 0.5 + 0.5 * Math.sin(b.life * 0.15);
    g.shadowColor = b.c;
    g.shadowBlur = 12;
    g.beginPath();
    g.arc(0, 0, b.r * 0.5, 0, Math.PI * 2);
    g.fill();
  } else if (season === 'autumn') {
    // a small momiji (maple) leaf with its stem
    g.scale(b.r / 9, b.r / 9);
    g.fill(MAPLE);
  } else {
    g.globalAlpha = 0.9;
    g.beginPath();
    g.arc(0, 0, b.r * 0.45, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/** The season's particles, drifting across the whole screen; `burst` throws a handful out from the middle. */
function useParticles(canvas: React.RefObject<HTMLCanvasElement | null>, season: Season, burstKey: number, big: boolean) {
  const bits = useRef<Bit[]>([]);
  useEffect(() => {
    const el = canvas.current;
    if (!el || reducedMotion()) return;
    const g = el.getContext('2d');
    if (!g) return;
    let raf = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = () => {
      el.width = el.clientWidth * dpr;
      el.height = el.clientHeight * dpr;
    };
    size();
    window.addEventListener('resize', size);
    const W = () => el.clientWidth;
    const H = () => el.clientHeight;
    const cols = COLOURS[season];
    const spawn = (x: number, y: number): Bit => ({
      x,
      y,
      vx: (Math.random() - 0.5) * 0.6,
      vy: season === 'summer' ? -0.2 - Math.random() * 0.4 : 0.6 + Math.random() * 1.2,
      r: 4 + Math.random() * 6,
      a: Math.random() * 6,
      va: (Math.random() - 0.5) * 0.12,
      c: cols[Math.floor(Math.random() * cols.length)],
      life: 0,
    });
    for (let i = 0; i < 36; i++) bits.current.push(spawn(Math.random() * W(), Math.random() * H()));
    const tick = () => {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W(), H());
      for (const b of bits.current) {
        b.life++;
        b.vx *= 0.985;
        if (Math.abs(b.vx) < 0.8) b.vx += Math.sin(b.life * 0.03 + b.a) * 0.02;
        b.vy = b.vy * 0.985 + (season === 'summer' ? -0.004 : 0.03);
        b.x += b.vx;
        b.y += b.vy;
        b.a += b.va;
        if (b.y > H() + 20) Object.assign(b, spawn(Math.random() * W(), -16));
        if (b.y < -30 && season === 'summer') Object.assign(b, spawn(Math.random() * W(), H() + 10));
        drawBit(g, b, season);
      }
      if (bits.current.length > 140) bits.current.splice(36, bits.current.length - 140);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
    };
  }, [canvas, season]);
  // A burst from the middle for each new moment.
  useEffect(() => {
    const el = canvas.current;
    if (!el || reducedMotion() || burstKey === 0) return;
    const n = big ? 60 : 28;
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * (big ? 7 : 4);
      const cols = COLOURS[season];
      bits.current.push({ x: el.clientWidth / 2, y: el.clientHeight * 0.36, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 2, r: 4 + Math.random() * 6, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.2, c: cols[i % cols.length], life: 0 });
    }
  }, [burstKey, big, canvas, season]);
}

export function Celebrate({ moments, season, onDone }: { moments: Moment[]; season: Season; onDone: () => void }) {
  const [i, setI] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const m = moments[i];
  useParticles(canvas, season, i + 1, !!m?.big);
  useEffect(() => {
    if (!m) return;
    chime(m.big ? 'big' : 'moment');
    buzz(m.big ? [30, 60, 30, 60, 80] : 25);
  }, [m]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone();
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  if (!m) return null;
  const last = i === moments.length - 1;
  function next() {
    if (last) onDone();
    else setI((x) => x + 1);
  }
  const sp = SPIRITS[m.spirit];
  return (
    <div className={`celebrate celebrate-${season}`} role="dialog" aria-modal="true" aria-label="What's new" onClick={next}>
      <canvas ref={canvas} className="celebrate-canvas" aria-hidden="true" />
      <div className="celebrate-card" key={i}>
        <div className={`celebrate-spirit ${m.big ? 'big' : ''}`}>
          <SpiritPortrait id={m.spirit} />
          {m.icon && <span className="celebrate-icon" aria-hidden="true">{m.icon}</span>}
        </div>
        <div className="celebrate-kicker">{m.big ? 'A big moment' : 'New'} · {sp.name}</div>
        <h2 className="celebrate-title">{m.title}</h2>
        <p className="celebrate-detail">{m.detail}</p>
        <div className="celebrate-dots" aria-label={`${i + 1} of ${moments.length}`}>
          {moments.map((_, j) => (
            <span key={j} className={j === i ? 'on' : j < i ? 'done' : ''} />
          ))}
        </div>
        <button
          className="btn-press btn-press-shu"
          autoFocus
          onClick={(e) => {
            e.stopPropagation();
            next();
          }}
        >
          {last ? 'Back to the trail' : 'Next'}
        </button>
      </div>
    </div>
  );
}
