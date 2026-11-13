// One event: details (editable), academy results with corrections, category winners, Tasuki Surge.
import { useState } from 'react';
import type { EventKind, Performance, TasukiEvent } from '../../types';
import { Empty, Field, Modal, PageHeader, Panel, Prov } from '../components/common';
import { useToast } from '../components/Toast';
import { useData } from '../data/DataContext';
import { Link, useRoute } from '../router';
import { PerformanceEditor, KIND_LABEL } from '../components/PerformanceEditor';
import { formatKm, formatTime } from '../../engine/format';
import { formatLongDate, isISODate } from '../../engine/dates';
import { fullName } from '../../engine/display';
import { formatPct } from '../../engine/boards';

const KINDS: EventKind[] = ['race', 'relay', 'parkrun', 'time_trial', 'session', 'test'];

function EventEditor({ event, onClose }: { event: TasukiEvent; onClose: () => void }) {
  const { commit, snapshot } = useData();
  const toast = useToast();
  const [e, setE] = useState(event);
  const n = (s: string) => (s === '' ? undefined : Number(s));
  return (
    <Modal
      title="Edit event"
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!e.name.trim() || !isISODate(e.date)}
            onClick={async () => {
              const next = { ...e, name: e.name.trim() };
              for (const k of Object.keys(next) as (keyof TasukiEvent)[]) if (next[k] === undefined) delete next[k];
              await commit({ put: { events: [next] } });
              toast('Event saved; results recalculated', 'ok');
              onClose();
            }}
          >
            Save
          </button>
        </>
      }
    >
      <div className="grid-2">
        <Field label="Name">
          <input className="input" value={e.name} onChange={(x) => setE({ ...e, name: x.target.value })} />
        </Field>
        <Field label="Date" hint="Results keep their own dates">
          <input className="input" type="date" value={e.date} onChange={(x) => setE({ ...e, date: x.target.value })} />
        </Field>
        <Field label="Kind">
          <select className="select" value={e.kind} onChange={(x) => setE({ ...e, kind: x.target.value as EventKind })}>
            {KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </Field>
        <Field label="Course">
          <select className="select" value={e.courseId ?? ''} onChange={(x) => setE({ ...e, courseId: x.target.value || undefined })}>
            <option value="">(none)</option>
            {snapshot.courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Distance km">
          <input className="input" type="number" step="0.01" value={e.distanceKm ?? ''} onChange={(x) => setE({ ...e, distanceKm: n(x.target.value) })} />
        </Field>
        <Field label="Climb m">
          <input className="input" type="number" value={e.climbM ?? ''} onChange={(x) => setE({ ...e, climbM: n(x.target.value) })} />
        </Field>
        <Field label="Field size">
          <input className="input" type="number" value={e.fieldSize ?? ''} onChange={(x) => setE({ ...e, fieldSize: n(x.target.value) })} />
        </Field>
        <Field label="Official">
          <label className="check">
            <input type="checkbox" checked={e.official} onChange={(x) => setE({ ...e, official: x.target.checked })} /> Official event
          </label>
        </Field>
      </div>
      <Field label="Notes">
        <input className="input" value={e.notes ?? ''} onChange={(x) => setE({ ...e, notes: x.target.value || undefined })} />
      </Field>
    </Modal>
  );
}

export function EventPage() {
  const route = useRoute();
  const { snapshot, derived } = useData();
  const event = snapshot.events.find((e) => e.id === route.params[0]);
  const [editing, setEditing] = useState(false);
  const [perfEdit, setPerfEdit] = useState<Performance | null>(null);
  if (!event) {
    return (
      <Panel>
        <Empty title="Event not found">
          <Link to="/events">All events</Link>
        </Empty>
      </Panel>
    );
  }
  const course = snapshot.courses.find((c) => c.id === event.courseId);
  const perfs = snapshot.performances.filter((p) => p.eventId === event.id && !p.deleted).sort((a, b) => (a.place ?? Infinity) - (b.place ?? Infinity) || (a.legNumber ?? 0) - (b.legNumber ?? 0) || (a.timeSec ?? Infinity) - (b.timeSec ?? Infinity) || (a.bleepLaps ?? 0) - (b.bleepLaps ?? 0));
  const surges = new Map(derived.surges.filter((s) => s.eventId === event.id).map((s) => [s.perfId, s]));
  return (
    <div className="stack">
      <PageHeader
        title={event.name}
        subtitle={`${formatLongDate(event.date)} · ${event.kind}${course ? ` · ${course.name}` : event.distanceKm ? ` · ${formatKm(event.distanceKm)}` : ''}${event.climbM ? ` · ${event.climbM} m climb` : ''}${event.fieldSize ? ` · field ${event.fieldSize}` : ''}`}
        actions={
          <>
            <Link className="btn" to="/paste">
              Paste more results
            </Link>
            <button className="btn" onClick={() => setEditing(true)}>
              Edit event
            </button>
          </>
        }
      />
      {(() => {
        // Where our runners sit in the whole field: fastest on the left, last finisher on the right.
        const field = Math.max(event.fieldSize ?? 0, ...perfs.map((p) => p.fieldSize ?? 0), ...perfs.map((p) => p.place ?? 0));
        const placed = perfs.filter((p) => p.place);
        if (!field || placed.length === 0) return null;
        return (
          <Panel title="Where we finished in the field">
            <div className="field-strip" aria-label={`${placed.length} academy runners in a field of ${field}`}>
              <div className="field-track" />
              {placed.map((p) => {
                const a = snapshot.athletes.find((x) => x.id === p.athleteId);
                const x = field > 1 ? ((p.place! - 1) / (field - 1)) * 100 : 0;
                return (
                  <Link key={p.id} to={`/athlete/${p.athleteId}`} className="field-dot" style={{ left: `${x}%` }} title={`${a ? fullName(a) : ''}: ${p.place}/${field}`}>
                    <span>{a ? (a.preferredName || a.givenName).slice(0, 8) : '?'}</span>
                  </Link>
                );
              })}
              <div className="field-ends small muted">
                <span>1st</span>
                <span>{field}th</span>
              </div>
            </div>
            <p className="small muted">
              {placed.length} of ours in a field of {field}. Median academy place: {placed.map((p) => p.place!).sort((a, b) => a - b)[Math.floor((placed.length - 1) / 2)]} (top {Math.round((placed.map((p) => p.place!).sort((a, b) => a - b)[Math.floor((placed.length - 1) / 2)] / field) * 100)}%).
            </p>
          </Panel>
        );
      })()}
      <Panel title={`Academy results (${perfs.length})`}>
        {perfs.length === 0 ? (
          <p className="muted">No academy results in this event.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  {event.kind === 'relay' && <th>Leg</th>}
                  <th>Athlete</th>
                  <th>Kind</th>
                  <th className="num">Result</th>
                  <th className="num">Place</th>
                  <th className="num" title="Share of the field finishing at or ahead of this runner">Top %</th>
                  <th className="num" title="Behind the fastest time in the field or category (when known)">Behind winner</th>
                  <th className="num">Score</th>
                  {event.kind === 'relay' && <th className="num">Tasuki Surge</th>}
                  <th />
                </tr>
              </thead>
              <tbody>
                {perfs.map((p) => {
                  const a = snapshot.athletes.find((x) => x.id === p.athleteId);
                  const s = derived.athletes.get(p.athleteId)?.ratings.perfScores.find((x) => x.perfId === p.id);
                  const sg = surges.get(p.id);
                  return (
                    <tr key={p.id} className={p.verified ? '' : 'row-warn'}>
                      {event.kind === 'relay' && <td className="num">{p.legNumber ?? '—'}</td>}
                      <td>
                        {a ? <Link to={`/athlete/${a.id}`}>{fullName(a)}</Link> : '(removed athlete)'} {p.teamName && <span className="muted small">· {p.teamName}</span>}
                        {!p.verified && <span className="pill pill-warn" style={{ marginLeft: 6 }}>unverified</span>}
                      </td>
                      <td>{KIND_LABEL[p.kind]}</td>
                      <td className="num">{p.timeSec != null ? formatTime(p.timeSec) : p.bleepLaps != null ? `${p.bleepLaps} laps` : '—'}</td>
                      <td className="num">{p.place ? `${p.place}${p.fieldSize ? `/${p.fieldSize}` : ''}` : '—'}</td>
                      <td className="num">{p.place && (p.fieldSize ?? event.fieldSize) ? `${Math.max(1, Math.round((p.place / (p.fieldSize ?? event.fieldSize)!) * 100))}%` : '—'}</td>
                      <td className="num small">
                        {(() => {
                          const w = event.categoryWinners?.find((c) => c.category === (p.category || 'Overall')) ?? event.categoryWinners?.[0];
                          return w && p.timeSec != null ? (p.timeSec - w.timeSec <= 0 ? 'winner' : `+${formatTime(p.timeSec - w.timeSec)}`) : '—';
                        })()}
                      </td>
                      <td className="num">
                        {s?.fresh ?? s?.score ?? '—'}
                        {s?.provisional && <Prov />}
                      </td>
                      {event.kind === 'relay' && (
                        <td className="num">
                          {sg ? (sg.pct != null ? <span className={sg.medal ? `tier-${sg.medal === 'gold' ? 'gold' : 'bronze'}` : ''}>{formatPct(sg.pct)}{sg.medal ? ` ${sg.medal}` : ''}</span> : <span className="muted small">no baseline</span>) : '—'}
                        </td>
                      )}
                      <td className="right">
                        <button className="btn btn-sm btn-ghost" onClick={() => setPerfEdit(p)}>
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {event.kind === 'relay' && [...surges.values()].some((s) => s.gateCorrectionPct > 0) && (
          <p className="small muted" style={{ marginTop: 8 }}>
            The course sanity gate applied: the median surge on a leg distance was above +{derived.config.surge.sanityMedianPct}%, so a correction was subtracted from everyone on that distance.
          </p>
        )}
      </Panel>
      {event.categoryWinners && event.categoryWinners.length > 0 && (
        <Panel title="Category winners (for reference)">
          <div className="row">
            {event.categoryWinners.map((w) => (
              <span key={w.category} className="pill">
                {w.category}: {formatTime(w.timeSec)}
              </span>
            ))}
          </div>
        </Panel>
      )}
      {editing && <EventEditor event={event} onClose={() => setEditing(false)} />}
      {perfEdit && <PerformanceEditor perf={perfEdit} onClose={() => setPerfEdit(null)} />}
    </div>
  );
}
