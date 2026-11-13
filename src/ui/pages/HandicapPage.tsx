// Circuit handicap start sheet (spec 3.14): offset = slowest PB − own PB, rounded to 5 s; runners
// without a PB go in the first wave. Printable as a start list in start order.
import { useMemo, useState } from 'react';
import { Empty, PageHeader, Panel } from '../components/common';
import { useData } from '../data/DataContext';
import { handicapFromPredictions, handicapStartSheet } from '../../engine/handicap';
import { ageOnDate } from '../../engine/age';
import { displayName, fullName } from '../../engine/display';
import { formatTime } from '../../engine/format';
import { formatLongDate } from '../../engine/dates';
import { YEAR_GROUPS } from '../../types';

export function HandicapPage() {
  const { snapshot, derived, config } = useData();
  const circuits = snapshot.courses.filter((c) => c.kind === 'circuit');
  const [courseId, setCourseId] = useState(circuits[0]?.id ?? '');
  const active = useMemo(() => snapshot.athletes.filter((a) => a.active).sort((a, b) => YEAR_GROUPS.indexOf(a.yearGroup) - YEAR_GROUPS.indexOf(b.yearGroup) || fullName(a).localeCompare(fullName(b))), [snapshot.athletes]);
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const selected = chosen ?? new Set(active.filter((a) => a.yearGroup !== 'Staff').map((a) => a.id));
  // Two modes: Circuit PBs (the original), or any course from each runner's 5K prediction.
  const [mode, setMode] = useState<'circuit' | 'any'>('circuit');
  const [km, setKm] = useState('3');
  const [climb, setClimb] = useState('0');
  const [courseName, setCourseName] = useState('');
  const picked = active.filter((a) => selected.has(a.id));
  const rows =
    mode === 'any'
      ? handicapFromPredictions({
          athletes: picked.map((a) => ({ id: a.id, age: ageOnDate(a, derived.asOf, config, derived.asOf).age, predicted5kSec: derived.athletes.get(a.id)?.prediction?.predictedSec })),
          distanceKm: Number(km) || 0,
          climbM: Number(climb) || 0,
          config,
        })
      : courseId
        ? handicapStartSheet({ athleteIds: picked.map((a) => a.id), perfs: snapshot.performances, lookup: derived.lookup, courseId, config })
        : [];
  const byId = new Map(snapshot.athletes.map((a) => [a.id, a]));
  const course = circuits.find((c) => c.id === courseId);
  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    setChosen(next);
  };
  // group consecutive runners with the same offset into start waves
  const waves: { offset: number; ids: string[] }[] = [];
  for (const r of rows) {
    const last = waves.at(-1);
    if (last && last.offset === r.offsetSec) last.ids.push(r.athleteId);
    else waves.push({ offset: r.offsetSec, ids: [r.athleteId] });
  }

  if (!circuits.length && mode === 'circuit') {
    return (
      <Panel>
        <Empty title="No Circuit course">Add a course of kind Circuit in Settings → Courses.</Empty>
      </Panel>
    );
  }

  return (
    <div className="stack">
      <div className="no-print stack">
        <PageHeader
          title="Circuit handicap start"
          subtitle={`Slower runners start first, so everyone races to the line together. Offsets are rounded to ${config.handicap.roundSec} s; runners without a PB start in the first wave.`}
          actions={
            <button className="btn btn-primary" onClick={() => window.print()} disabled={!rows.length}>
              Print start list
            </button>
          }
        />
        <Panel>
          <div className="row" style={{ marginBottom: 10 }}>
            <div className="seg" role="group" aria-label="Handicap mode">
              <button type="button" className={mode === 'circuit' ? 'on' : ''} onClick={() => setMode('circuit')}>
                Circuit PBs
              </button>
              <button type="button" className={mode === 'any' ? 'on' : ''} onClick={() => setMode('any')}>
                Any course (from 5K predictions)
              </button>
            </div>
            {mode === 'any' && (
              <>
                <select className="select" style={{ width: 'auto' }} value="" onChange={(e) => {
                  const c = snapshot.courses.find((x) => x.id === e.target.value);
                  if (c) {
                    setKm(String(c.distanceKm));
                    setClimb(String(c.climbM));
                    setCourseName(c.name);
                  }
                }}>
                  <option value="">Use a saved course…</option>
                  {snapshot.courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <label className="small">
                  Name <input className="input" style={{ width: 160 }} value={courseName} onChange={(e) => setCourseName(e.target.value)} placeholder="e.g. Ski slope loop" />
                </label>
                <label className="small">
                  km <input className="input" style={{ width: 80 }} type="number" step="0.1" value={km} onChange={(e) => setKm(e.target.value)} />
                </label>
                <label className="small">
                  climb m <input className="input" style={{ width: 90 }} type="number" step="10" value={climb} onChange={(e) => setClimb(e.target.value)} />
                </label>
              </>
            )}
            {mode === 'circuit' && circuits.length > 1 && (
              <select className="select" style={{ width: 'auto' }} value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                {circuits.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            <button className="btn btn-sm" onClick={() => setChosen(new Set(active.map((a) => a.id)))}>
              Everyone
            </button>
            <button className="btn btn-sm" onClick={() => setChosen(new Set())}>
              Nobody
            </button>
            <span className="muted small">{selected.size} runners</span>
          </div>
          <div className="row">
            {active.map((a) => (
              <label key={a.id} className="check small" style={{ minWidth: 170 }}>
                <input type="checkbox" checked={selected.has(a.id)} onChange={(e) => toggle(a.id, e.target.checked)} />
                {fullName(a)} <span className="muted">{a.yearGroup}</span>
              </label>
            ))}
          </div>
        </Panel>
      </div>

      <section className="panel handicap-sheet">
        <h2 style={{ marginBottom: 2 }}>{mode === 'any' ? `${courseName || `${km} km${Number(climb) ? ` +${climb} m` : ''}`}` : course?.name} handicap start</h2>
        <p className="muted small" style={{ marginTop: 0 }}>
          {formatLongDate(derived.asOf)} · start the watch when the first wave goes · {rows.length} runners
        </p>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Go at</th>
                <th>Runner</th>
                <th>Year</th>
                <th className="num">{mode === 'any' ? 'Predicted' : 'PB'}</th>
                <th>✓</th>
              </tr>
            </thead>
            <tbody>
              {waves.map((w) =>
                w.ids.map((id, i) => {
                  const a = byId.get(id)!;
                  const r = rows.find((x) => x.athleteId === id)!;
                  return (
                    <tr key={id} style={i === 0 ? { borderTop: '2px solid var(--ink-3)' } : undefined}>
                      <td className="num" style={{ fontSize: '1.1rem', fontWeight: 800 }}>
                        {i === 0 ? (w.offset === 0 ? 'GO' : `+${formatTime(w.offset)}`) : ''}
                      </td>
                      <td>
                        <strong>{displayName(a)}</strong>
                      </td>
                      <td>{a.yearGroup}</td>
                      <td className="num">{r.pbSec != null ? formatTime(r.pbSec) : <span className="muted">{mode === 'any' ? 'no prediction' : 'no PB'}</span>}</td>
                      <td style={{ width: 40 }}>☐</td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
