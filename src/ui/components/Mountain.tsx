// Coaching visuals: the six-stat radar (the shape of a runner), the summit ladder (the four camps and what the
// next one needs) and the development focus (what to work on, with session ideas).
import type { AthleteDerived } from '../../engine/derive';
import type { Config } from '../../engine/config';
import { STAT_KEYS } from '../../engine/types';
import { CAMPS, developmentFocus, summitLadder, TIER_ORDER, type FocusItem } from '../../engine/coach';

/** Six stats on a hexagon, 40 at the centre ring and 99 at the edge. Locked stats sit at the centre, dashed. */
export function StatRadar({ d, size = 220, compare }: { d: AthleteDerived; size?: number; compare?: AthleteDerived }) {
  const c = size / 2;
  const R = size * 0.36;
  const angle = (i: number) => -Math.PI / 2 + (i * Math.PI * 2) / 6;
  const pt = (i: number, v: number) => {
    const f = Math.max(0, Math.min(1, (v - 30) / (99 - 30)));
    return [c + Math.cos(angle(i)) * R * f, c + Math.sin(angle(i)) * R * f] as const;
  };
  const shape = (x: AthleteDerived) => STAT_KEYS.map((k, i) => pt(i, x.ratings.stats[k].locked ? 30 : (x.ratings.stats[k].value ?? 30)).join(',')).join(' ');
  const ring = (v: number) => STAT_KEYS.map((_, i) => pt(i, v).join(',')).join(' ');
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="radar" role="img" aria-label={STAT_KEYS.map((k) => `${k} ${d.ratings.stats[k].locked ? 'locked' : d.ratings.stats[k].value}`).join(', ')}>
      {[50, 65, 80, 99].map((v) => (
        <polygon key={v} points={ring(v)} fill={v === 99 ? 'var(--surface-2)' : 'none'} stroke="var(--line-strong)" strokeWidth={v === 99 ? 1.2 : 0.7} strokeDasharray={v === 99 ? undefined : '2 3'} />
      ))}
      {STAT_KEYS.map((_, i) => {
        const [x, y] = pt(i, 99);
        return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="var(--line)" strokeWidth="0.7" />;
      })}
      {compare && <polygon points={shape(compare)} fill="rgb(120 120 120 / 8%)" stroke="var(--ink-3)" strokeWidth="1" strokeDasharray="3 3" />}
      <polygon points={shape(d)} fill="color-mix(in srgb, var(--shu) 22%, transparent)" stroke="var(--shu)" strokeWidth="2" strokeLinejoin="round" />
      {STAT_KEYS.map((k, i) => {
        const s = d.ratings.stats[k];
        const [x, y] = pt(i, s.locked ? 30 : (s.value ?? 30));
        const [lx, ly] = pt(i, 99 + 22);
        return (
          <g key={k}>
            {!s.locked && <circle cx={x} cy={y} r="3.2" fill="var(--shu)" />}
            <text x={lx} y={ly - 5} textAnchor="middle" fontSize="11" fontWeight="800" fill="var(--ink-2)">
              {k}
            </text>
            <text x={lx} y={ly + 9} textAnchor="middle" fontSize="13" fontWeight="800" fill={s.locked ? 'var(--ink-3)' : 'var(--ink)'} className="num">
              {s.locked ? '🔒' : s.value}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** The four camps, the current one highlighted, with the steps to the next. */
export function SummitLadder({ d, config }: { d: AthleteDerived; config: Config }) {
  const l = summitLadder(d, config);
  const idx = TIER_ORDER.indexOf(l.tier);
  return (
    <div className="ladder">
      <ol className="ladder-camps">
        {[...TIER_ORDER].reverse().map((t) => {
          const i = TIER_ORDER.indexOf(t);
          const state = i < idx ? 'passed' : i === idx ? 'here' : i === idx + 1 ? 'next' : 'ahead';
          return (
            <li key={t} className={`ladder-camp ladder-${state} tier-bg-${t}`}>
              <span className="ladder-jp">{CAMPS[t].jp}</span>
              <span className="ladder-name">
                {CAMPS[t].name} <span className="muted tiny">{t[0].toUpperCase() + t.slice(1)}</span>
              </span>
              {state === 'here' && <span className="pill pill-shu">you are here</span>}
            </li>
          );
        })}
      </ol>
      <div className="ladder-goal">
        <strong>{l.headline}</strong>
        {l.next && (
          <>
            <div className="ladder-bar" aria-label={`${Math.round(l.progress * 100)}% of the way`}>
              <span style={{ width: `${Math.round(l.progress * 100)}%` }} />
            </div>
            <ul className="small">
              {l.steps.map((s) => (
                <li key={s.text} className={s.done ? 'muted' : ''}>
                  {s.done ? '✓ ' : '○ '}
                  {s.text}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

const FOCUS_LABEL: Record<FocusItem['kind'], string> = { focus: 'Focus', unlock: 'Unlock', refresh: 'Freshen', superpower: 'Superpower' };

/** What to work on next, with session ideas (coach view) or without (student view). */
export function DevelopmentFocus({ d, config, ideas = true, max = 4 }: { d: AthleteDerived; config: Config; ideas?: boolean; max?: number }) {
  const items = developmentFocus(d, config);
  const shown = [...items.filter((i) => i.kind === 'superpower'), ...items.filter((i) => i.kind !== 'superpower')].slice(0, max);
  if (!shown.length) return <p className="muted small">Add a few results to see what to work on.</p>;
  return (
    <ul className="focus-list">
      {shown.map((f, i) => (
        <li key={`${f.kind}-${f.stat}-${i}`} className={`focus-${f.kind}`}>
          <span className="focus-tag">{FOCUS_LABEL[f.kind]}</span>
          <span>
            {f.text}
            {ideas && f.ideas.length > 0 && <span className="focus-ideas">Try: {f.ideas.join(' · ')}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
