// Squad view (#/squad): every runner's stats as a heatmap, for planning groups and spotting gaps. Sort by any
// column; filter by year band and sex. Click a runner for their page.
import './squad.css';
import { useMemo, useState } from 'react';
import { PageHeader, Panel, Seg } from '../components/common';
import { useData } from '../data/DataContext';
import { Link } from '../router';
import { displayName, fullName, yearBand } from '../../engine/display';
import { STAT_KEYS, type RatingKey, type YearBand } from '../../engine/types';
import { CAMPS, developmentFocus } from '../../engine/coach';
import type { AthleteDerived } from '../../engine/derive';
import { formatTime } from '../../engine/format';

type Col = RatingKey | 'OVR';
const COLS: Col[] = ['OVR', 'RACE', ...STAT_KEYS];

function value(d: AthleteDerived, k: Col): number | undefined {
  const r = d.ratings;
  if (k === 'OVR') return r.ovr.value;
  const s = k === 'RACE' ? r.race : r.stats[k];
  return s.locked ? undefined : s.value;
}

/** 40 → pale mist, 99 → deep forest green (a single-hue scale reads in both directions). */
function heat(v: number | undefined): React.CSSProperties {
  if (v == null) return {};
  const f = Math.max(0, Math.min(1, (v - 40) / 59));
  const l = 96 - f * 58;
  return { background: `hsl(${140 - f * 10} ${30 + f * 25}% ${l}%)`, color: l < 60 ? '#fff' : 'var(--ink)' };
}

export function SquadPage() {
  const { derived } = useData();
  const [sort, setSort] = useState<Col>('OVR');
  const [band, setBand] = useState<'all' | YearBand>('all');
  const [sex, setSex] = useState<'all' | 'F' | 'M'>('all');
  const [names, setNames] = useState<'coach' | 'display'>('coach');
  const rows = useMemo(() => {
    const list = [...derived.athletes.values()].filter((d) => d.athlete.active && (band === 'all' || yearBand(d.athlete.yearGroup) === band) && (sex === 'all' || d.athlete.sex === sex));
    return list.sort((a, b) => (value(b, sort) ?? -1) - (value(a, sort) ?? -1) || fullName(a.athlete).localeCompare(fullName(b.athlete)));
  }, [derived, sort, band, sex]);
  const avg = (k: Col) => {
    const xs = rows.map((d) => value(d, k)).filter((x): x is number => x != null);
    return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : undefined;
  };
  const unlocked = (k: Col) => rows.filter((d) => value(d, k) != null).length;
  return (
    <div className="stack">
      <PageHeader title="Squad" subtitle="Every runner's ratings at a glance: darker green is higher. Click a column to sort; the focus column suggests what each runner should work on next." />
      <Panel
        actions={
          <>
            <Seg value={band} onChange={setBand} options={[{ value: 'all', label: 'All' }, { value: 'Y7-8', label: 'Y7–8' }, { value: 'Y9-11', label: 'Y9–11' }, { value: 'Y12-13', label: 'Y12–13' }, { value: 'Staff', label: 'Staff' }]} />
            <Seg value={sex} onChange={setSex} options={[{ value: 'all', label: 'All' }, { value: 'F', label: 'Girls' }, { value: 'M', label: 'Boys' }]} />
            <Seg value={names} onChange={setNames} options={[{ value: 'coach', label: 'Full names' }, { value: 'display', label: 'Display names' }]} />
          </>
        }
      >
        <div className="table-wrap">
          <table className="table squad-table">
            <thead>
              <tr>
                <th>Runner</th>
                <th>Camp</th>
                {COLS.map((k) => (
                  <th key={k} className={`num sortable ${sort === k ? 'sorted' : ''}`} onClick={() => setSort(k)} title={`Sort by ${k}`}>
                    {k}
                    {sort === k ? ' ▾' : ''}
                  </th>
                ))}
                <th className="num">5K now</th>
                <th className="num">Target</th>
                <th>Focus</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const focus = developmentFocus(d, derived.config).find((f) => f.kind === 'focus' || f.kind === 'unlock');
                return (
                  <tr key={d.athlete.id}>
                    <td className="nowrap">
                      <Link to={`/athlete/${d.athlete.id}`}>{names === 'coach' ? fullName(d.athlete) : displayName(d.athlete)}</Link> <span className="muted tiny">{d.athlete.yearGroup}</span>
                    </td>
                    <td className="nowrap small">
                      <span className={`tier-dot tier-dot-${d.ratings.tier}`} /> {CAMPS[d.ratings.tier].jp}
                    </td>
                    {COLS.map((k) => {
                      const v = value(d, k);
                      return (
                        <td key={k} className="num squad-cell" style={heat(v)}>
                          {v ?? <span className="muted">🔒</span>}
                        </td>
                      );
                    })}
                    <td className="num small nowrap" title={d.prediction ? `${formatTime(d.prediction.lowSec)}–${formatTime(d.prediction.highSec)}` : undefined}>
                      {d.prediction ? `${formatTime(d.prediction.predictedSec)} ±${d.prediction.plusMinusPct.toFixed(0)}%` : '—'}
                    </td>
                    <td className="num small">{d.prediction ? <strong>{formatTime(d.prediction.realisticSec)}</strong> : '—'}</td>
                    <td className="small">{focus ? `${focus.kind === 'unlock' ? 'Unlock' : 'Work on'} ${focus.stat}` : ''}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} className="small muted">
                  Average · unlocked
                </td>
                {COLS.map((k) => (
                  <td key={k} className="num small">
                    <strong>{avg(k) ?? '—'}</strong>
                    <div className="tiny muted">
                      {unlocked(k)}/{rows.length}
                    </div>
                  </td>
                ))}
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>
    </div>
  );
}
