// Correct, verify, delete or restore a performance with a reason (spec 4.6). History is kept.
import { useState } from 'react';
import type { Performance, PerfKind } from '../../types';
import { PERF_KINDS } from '../../types';
import { Field, Modal } from './common';
import { useToast } from './Toast';
import { useData } from '../data/DataContext';
import { correctPerformance, deletePerformance, restorePerformance, type PerformancePatch } from '../../engine/corrections';
import { formatTime } from '../../engine/format';
import { parseTime } from '../../engine/time';
import { formatLongDate, isISODate } from '../../engine/dates';

export const KIND_LABEL: Record<PerfKind, string> = {
  race: 'Race',
  relay_leg: 'Relay leg',
  parkrun: 'parkrun',
  long_run: 'Long run',
  circuit: 'Circuit',
  climb: 'Climb',
  descent: 'Descent',
  bleep: 'Bleep test',
  nav: 'Navigation',
  arm: 'ARM tests',
};

const TIMED: PerfKind[] = ['race', 'relay_leg', 'parkrun', 'long_run', 'circuit', 'climb', 'descent', 'nav'];

const numOrUndef = (s: string) => (s.trim() === '' ? undefined : Number(s));

function show(v: unknown): string {
  if (v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function PerformanceEditor({ perf, onClose }: { perf: Performance; onClose: () => void }) {
  const { commit, snapshot } = useData();
  const toast = useToast();
  const by = snapshot.meta.coachName || 'Coach';
  const [p, setP] = useState<Performance>(perf);
  const [time, setTime] = useState(perf.timeSec != null ? formatTime(perf.timeSec) + (perf.timeSec % 1 ? `.${String(Math.round((perf.timeSec % 1) * 10))}` : '') : '');
  const [reason, setReason] = useState('');
  const set = <K extends keyof Performance>(k: K, v: Performance[K]) => setP((x) => ({ ...x, [k]: v }));
  const tp = time.trim() ? parseTime(time, { context: 'time' }) : null;
  const events = [...snapshot.events].sort((a, b) => (a.date < b.date ? 1 : -1));
  const err = !isISODate(p.date) ? 'Date is not valid' : tp && !tp.ok ? tp.error : null;

  const patch = (): PerformancePatch => {
    const out: PerformancePatch = {};
    const keys: (keyof PerformancePatch)[] = ['date', 'kind', 'eventId', 'courseId', 'distanceKm', 'climbM', 'place', 'fieldSize', 'legNumber', 'teamName', 'racedEarlierSameDay', 'bleepLaps', 'navErrors', 'navVariant', 'routeKmEff', 'arm', 'cleanRun', 'verified', 'category'];
    for (const k of keys) (out as Record<string, unknown>)[k] = p[k];
    out.timeSec = tp && tp.ok ? tp.sec : time.trim() ? perf.timeSec : undefined;
    return out;
  };

  const save = async () => {
    if (err) return;
    const next = correctPerformance(perf, patch(), reason, by, new Date().toISOString());
    if (!next) {
      toast('Nothing changed', 'info');
      return onClose();
    }
    await commit({ put: { performances: [next] } });
    toast('Correction saved; ratings recalculated', 'ok');
    onClose();
  };

  const del = async () => {
    await commit({ put: { performances: [deletePerformance(perf, reason, by, new Date().toISOString())] } });
    toast('Result deleted (kept in history)', 'ok');
    onClose();
  };

  const restore = async () => {
    await commit({ put: { performances: [restorePerformance(perf, reason, by, new Date().toISOString())] } });
    toast('Result restored', 'ok');
    onClose();
  };

  const kind = p.kind;
  return (
    <Modal
      title={`${perf.deleted ? 'Deleted result' : 'Correct result'}: ${KIND_LABEL[perf.kind]}, ${formatLongDate(perf.date)}`}
      onClose={onClose}
      wide
      actions={
        <>
          {perf.deleted ? (
            <button className="btn" onClick={restore} disabled={!reason.trim()}>
              Restore
            </button>
          ) : (
            <button className="btn btn-danger" onClick={del} disabled={!reason.trim()} title={reason.trim() ? '' : 'Give a reason first'}>
              Delete…
            </button>
          )}
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          {!perf.deleted && (
            <button className="btn btn-primary" onClick={save} disabled={!!err || !reason.trim()} title={reason.trim() ? '' : 'Give a reason first'}>
              Save correction
            </button>
          )}
        </>
      }
    >
      <div className="stack">
        <div className="grid-3">
          <Field label="Date">
            <input className="input" type="date" value={p.date} onChange={(e) => set('date', e.target.value)} />
          </Field>
          <Field label="Kind">
            <select className="select" value={p.kind} onChange={(e) => set('kind', e.target.value as PerfKind)}>
              {PERF_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Verified">
            <label className="check">
              <input type="checkbox" checked={p.verified} onChange={(e) => set('verified', e.target.checked)} /> Checked by the coach
            </label>
          </Field>
          <Field label="Event">
            <select className="select" value={p.eventId ?? ''} onChange={(e) => set('eventId', e.target.value || undefined)}>
              <option value="">(none)</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} · {e.date}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Course">
            <select className="select" value={p.courseId ?? ''} onChange={(e) => set('courseId', e.target.value || undefined)}>
              <option value="">(from event / none)</option>
              {snapshot.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          {TIMED.includes(kind) && (
            <Field label="Time" hint={tp?.ok ? (tp.warnings[0] ?? `= ${tp.normalized}`) : tp?.error}>
              <input className={`input ${tp && !tp.ok ? 'invalid' : ''}`} value={time} onChange={(e) => setTime(e.target.value)} placeholder="16:15" />
            </Field>
          )}
          {TIMED.includes(kind) && (
            <>
              <Field label="Distance km (blank = from course/event)">
                <input className="input" type="number" step="0.01" value={p.distanceKm ?? ''} onChange={(e) => set('distanceKm', numOrUndef(e.target.value))} />
              </Field>
              <Field label="Climb m (blank = from course/event)">
                <input className="input" type="number" value={p.climbM ?? ''} onChange={(e) => set('climbM', numOrUndef(e.target.value))} />
              </Field>
            </>
          )}
          {(kind === 'race' || kind === 'parkrun') && (
            <>
              <Field label="Place">
                <input className="input" type="number" value={p.place ?? ''} onChange={(e) => set('place', numOrUndef(e.target.value))} />
              </Field>
              <Field label="Field size">
                <input className="input" type="number" value={p.fieldSize ?? ''} onChange={(e) => set('fieldSize', numOrUndef(e.target.value))} />
              </Field>
            </>
          )}
          {kind === 'relay_leg' && (
            <>
              <Field label="Leg">
                <input className="input" type="number" value={p.legNumber ?? ''} onChange={(e) => set('legNumber', numOrUndef(e.target.value))} />
              </Field>
              <Field label="Team">
                <input className="input" value={p.teamName ?? ''} onChange={(e) => set('teamName', e.target.value || undefined)} />
              </Field>
              <Field label="Raced earlier the same day">
                <label className="check">
                  <input type="checkbox" checked={!!p.racedEarlierSameDay} onChange={(e) => set('racedEarlierSameDay', e.target.checked || undefined)} /> Yes
                </label>
              </Field>
            </>
          )}
          {kind === 'bleep' && (
            <Field label="Laps (20 m shuttles)">
              <input className="input" type="number" value={p.bleepLaps ?? ''} onChange={(e) => set('bleepLaps', numOrUndef(e.target.value))} />
            </Field>
          )}
          {kind === 'descent' && (
            <Field label="Clean run">
              <label className="check">
                <input type="checkbox" checked={p.cleanRun !== false} onChange={(e) => set('cleanRun', e.target.checked)} /> Clean (no falls, no shortcuts)
              </label>
            </Field>
          )}
          {kind === 'nav' && (
            <>
              <Field label="Control errors">
                <input className="input" type="number" min="0" value={p.navErrors ?? ''} onChange={(e) => set('navErrors', numOrUndef(e.target.value))} />
              </Field>
              <Field label="Route km (effective)">
                <input className="input" type="number" step="0.01" value={p.routeKmEff ?? ''} onChange={(e) => set('routeKmEff', numOrUndef(e.target.value))} />
              </Field>
              <Field label="Variant">
                <input className="input" value={p.navVariant ?? ''} onChange={(e) => set('navVariant', e.target.value || undefined)} />
              </Field>
            </>
          )}
          {kind === 'arm' && (
            <>
              <Field label="Ankle, knee-to-wall (cm)">
                <input className="input" type="number" step="0.5" value={p.arm?.ankleCm ?? ''} onChange={(e) => set('arm', { ...p.arm, ankleCm: numOrUndef(e.target.value) })} />
              </Field>
              <Field label="Calf raises (reps)">
                <input className="input" type="number" value={p.arm?.calfReps ?? ''} onChange={(e) => set('arm', { ...p.arm, calfReps: numOrUndef(e.target.value) })} />
              </Field>
              <Field label="Stork, eyes closed (s)">
                <input className="input" type="number" value={p.arm?.storkSec ?? ''} onChange={(e) => set('arm', { ...p.arm, storkSec: numOrUndef(e.target.value) })} />
              </Field>
              <Field label="Hop and stick, both legs">
                <label className="check">
                  <input type="checkbox" checked={!!p.arm?.hopStickBothLegs} onChange={(e) => set('arm', { ...p.arm, hopStickBothLegs: e.target.checked })} /> Passed
                </label>
              </Field>
            </>
          )}
        </div>
        <Field label="Reason (required)" hint="Recorded in the history with your name and the date.">
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. typo in the results sheet" />
        </Field>
        {err && <p className="small" style={{ color: 'var(--err)' }}>{err}</p>}
        <div>
          <div className="small muted">
            Source: {perf.source} · entered as <code>{perf.rawInput || '—'}</code>
          </div>
          {perf.history.length > 0 && (
            <div className="table-wrap" style={{ marginTop: 8 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>By</th>
                    <th>Change</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {perf.history.map((h, i) => (
                    <tr key={i}>
                      <td className="small nowrap">{new Date(h.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                      <td className="small">{h.by}</td>
                      <td className="small">
                        {Object.keys(h.after ?? {}).map((k) => (
                          <div key={k}>
                            {k}: {show((h.before as Record<string, unknown> | null)?.[k])} → {show((h.after as Record<string, unknown>)[k])}
                          </div>
                        ))}
                      </td>
                      <td className="small">{h.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
