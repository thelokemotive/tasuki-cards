// The streak as a trail: one stepping stone per week along a winding path, lit when the week was kept,
// iced for holidays and frozen weeks, dim for a week that slipped by, and this week glowing and waiting.
// Ahead, faint stones lead to the next milestone flag, so the next goal is always in sight.
import type { TrailWeek } from '../../engine/trail';

const STATE_LABEL = { counted: 'kept', holiday: 'holiday (safe)', frozen: 'frozen (safe)', missed: 'not kept', current: 'this week' } as const;

export function Flame({ level, size = 44 }: { level: 'lit' | 'waiting' | 'ember' | 'out'; size?: number }) {
  return (
    <svg viewBox="0 0 40 48" width={size} height={size * 1.2} className={`flame flame-${level}`} aria-hidden="true">
      <defs>
        <radialGradient id={`fl-${level}`} cx="0.5" cy="0.75" r="0.7">
          <stop offset="0" stopColor={level === 'out' ? '#c9c4bb' : '#fff3b0'} />
          <stop offset="0.45" stopColor={level === 'out' ? '#a8a29a' : '#ffb02e'} />
          <stop offset="1" stopColor={level === 'out' ? '#8d877f' : '#e2401f'} />
        </radialGradient>
      </defs>
      <path className="flame-outer" d="M20,2 C24,12 34,18 34,30 C34,40 28,46 20,46 C12,46 6,40 6,30 C6,22 12,18 14,10 C16,16 18,18 20,18 C18,12 18,6 20,2 Z" fill={`url(#fl-${level})`} />
      <path className="flame-inner" d="M20,22 C23,28 27,31 27,36 C27,41 24,44 20,44 C16,44 13,41 13,36 C13,32 16,30 17,26 C18,29 19,30 20,30 Z" fill={level === 'out' ? '#e6e1d9' : '#fff7cf'} opacity="0.85" />
    </svg>
  );
}

export function TrailStrip({ tw, ahead = 4, light = false }: { tw: TrailWeek; ahead?: number; light?: boolean }) {
  const past = tw.recent.filter((w) => w.state !== 'current').slice(-8);
  const now = { week: tw.week, state: tw.status };
  const toGo = tw.milestone ? Math.min(ahead, tw.milestone.toGo - (tw.status === 'kept' ? 0 : 1)) : 0;
  const future = Math.max(0, toGo);
  const n = past.length + 1 + future;
  const step = 38;
  const W = Math.max(n, 6) * step + 24;
  const H = 74;
  const x = (i: number) => 22 + i * step;
  const y = (i: number) => 44 + Math.sin(i * 0.9) * 9;
  let d = `M${x(0) - 16},${y(0)}`;
  for (let i = 0; i < n; i++) d += ` Q${x(i) - step / 2},${y(i) + (i % 2 ? -14 : 14)} ${x(i)},${y(i)}`;
  const flagAt = tw.milestone && tw.milestone.toGo - (tw.status === 'kept' ? 0 : 1) <= ahead ? past.length + (tw.milestone.toGo - (tw.status === 'kept' ? 0 : 1)) : -1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`trail-strip ${light ? 'light' : ''}`} role="img" aria-label={`Your last ${past.length} weeks and this week`} preserveAspectRatio="xMidYMid meet">
      <path d={d} className="ts-path" />
      {past.map((w, i) => (
        <g key={w.week} className={`ts-stone ts-${w.state}`} transform={`translate(${x(i)} ${y(i)})`}>
          <title>{`${w.week}: ${STATE_LABEL[w.state]}`}</title>
          <ellipse rx="13" ry="10" />
          {w.state === 'counted' && <path d="M0,-7 C3,-2 6,0 6,4 C6,7 3,9 0,9 C-3,9 -6,7 -6,4 C-6,1 -3,-1 -2,-4 C-1,-2 0,-1 0,0 C-1,-3 -1,-5 0,-7 Z" className="ts-flame" />}
          {(w.state === 'holiday' || w.state === 'frozen') && <path d="M0,-7 V7 M-6,-3.5 L6,3.5 M-6,3.5 L6,-3.5" className="ts-snow" />}
        </g>
      ))}
      <g className={`ts-stone ts-now ts-now-${now.state}`} transform={`translate(${x(past.length)} ${y(past.length)})`}>
        <title>{`This week: ${now.state}`}</title>
        <ellipse rx="16" ry="12" className="ts-now-glow" />
        <ellipse rx="13" ry="10" />
        {now.state === 'kept' && <path d="M0,-7 C3,-2 6,0 6,4 C6,7 3,9 0,9 C-3,9 -6,7 -6,4 C-6,1 -3,-1 -2,-4 C-1,-2 0,-1 0,0 C-1,-3 -1,-5 0,-7 Z" className="ts-flame" />}
        {now.state === 'pending' && <circle r="3.5" className="ts-ember" />}
        {(now.state === 'holiday' || now.state === 'frozen') && <path d="M0,-7 V7 M-6,-3.5 L6,3.5 M-6,3.5 L6,-3.5" className="ts-snow" />}
        {now.state === 'open' && <text className="ts-q" textAnchor="middle" dy="4">?</text>}
      </g>
      {Array.from({ length: future }, (_, j) => {
        const i = past.length + 1 + j;
        return (
          <g key={`f${j}`} className="ts-stone ts-future" transform={`translate(${x(i)} ${y(i)})`}>
            <ellipse rx="11" ry="8" />
          </g>
        );
      })}
      {flagAt >= 0 && flagAt < n && (
        <g transform={`translate(${x(flagAt)} ${y(flagAt) - 10})`} className="ts-flag">
          <title>{`${tw.milestone!.at}-week badge`}</title>
          <path d="M0,0 V-26" />
          <path d="M0,-26 L16,-21 L0,-15 Z" />
          <text x="3" y="-30" textAnchor="middle">{tw.milestone!.at}</text>
        </g>
      )}
    </svg>
  );
}
