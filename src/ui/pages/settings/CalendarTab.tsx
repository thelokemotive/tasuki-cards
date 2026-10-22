// Settings → Calendar: holiday weeks (neither count nor break a streak) and half-terms (one freeze each).
import { useState } from 'react';
import type { Calendar, HalfTerm } from '../../../types';
import { Field, Panel, newId } from '../../components/common';
import { useData } from '../../data/DataContext';
import { formatLongDate, isoWeek, isISODate, weekMonday, weekSunday } from '../../../engine/dates';
import { halfTermOfWeek } from '../../../engine/streak';

export function CalendarTab() {
  const { snapshot, commit } = useData();
  const cal = snapshot.calendar;
  const [holidayDate, setHolidayDate] = useState('');
  const [term, setTerm] = useState({ name: '', start: '', end: '' });
  const save = (c: Calendar) => commit({ calendar: c });
  const orphanFreezes = snapshot.participation.filter((p) => p.type === 'freeze' && !halfTermOfWeek(p.isoWeek, cal.halfTerms));

  return (
    <div className="stack">
      <Panel title="Half-terms">
        <p className="small muted">Each half-term allows one streak freeze (applied by the coach). A freeze outside every half-term is not honoured.</p>
        {orphanFreezes.length > 0 && (
          <p className="small" style={{ color: 'var(--warn)' }}>
            {orphanFreezes.length} freeze{orphanFreezes.length > 1 ? 's are' : ' is'} outside every half-term and will be ignored until a half-term covers {orphanFreezes.length > 1 ? 'them' : 'it'}.
          </p>
        )}
        <div className="table-wrap" style={{ marginBottom: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Half-term</th>
                <th>From</th>
                <th>To</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {cal.halfTerms.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    No half-terms yet.
                  </td>
                </tr>
              )}
              {cal.halfTerms.map((h) => (
                <tr key={h.id}>
                  <td>{h.name}</td>
                  <td>{formatLongDate(h.start)}</td>
                  <td>{formatLongDate(h.end)}</td>
                  <td className="right">
                    <button className="btn btn-sm btn-danger" onClick={() => save({ ...cal, halfTerms: cal.halfTerms.filter((x) => x.id !== h.id) })}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <Field label="Name">
            <input className="input" value={term.name} placeholder="Autumn 1" onChange={(e) => setTerm({ ...term, name: e.target.value })} />
          </Field>
          <Field label="From">
            <input className="input" type="date" value={term.start} onChange={(e) => setTerm({ ...term, start: e.target.value })} />
          </Field>
          <Field label="To">
            <input className="input" type="date" value={term.end} onChange={(e) => setTerm({ ...term, end: e.target.value })} />
          </Field>
          <button
            className="btn btn-primary"
            disabled={!term.name.trim() || !isISODate(term.start) || !isISODate(term.end) || term.end < term.start}
            onClick={() => {
              const h: HalfTerm = { id: newId('ht'), name: term.name.trim(), start: term.start, end: term.end };
              save({ ...cal, halfTerms: [...cal.halfTerms, h].sort((a, b) => (a.start < b.start ? -1 : 1)) });
              setTerm({ name: '', start: '', end: '' });
            }}
          >
            Add half-term
          </button>
        </div>
      </Panel>

      <Panel title="Holiday weeks">
        <p className="small muted">Holiday weeks neither count towards nor break a streak. A verified parkrun or long run in a holiday week earns a bonus flame.</p>
        <div className="row" style={{ alignItems: 'flex-end', marginBottom: 12 }}>
          <Field label="Any date in the week">
            <input className="input" type="date" value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} />
          </Field>
          <button
            className="btn btn-primary"
            disabled={!isISODate(holidayDate) || cal.holidayWeeks.includes(isISODate(holidayDate) ? isoWeek(holidayDate) : '')}
            onClick={() => {
              save({ ...cal, holidayWeeks: [...new Set([...cal.holidayWeeks, isoWeek(holidayDate)])].sort() });
              setHolidayDate('');
            }}
          >
            Add holiday week {isISODate(holidayDate) && `(${isoWeek(holidayDate)})`}
          </button>
        </div>
        <div className="row">
          {cal.holidayWeeks.length === 0 && <span className="muted small">No holiday weeks yet.</span>}
          {cal.holidayWeeks.map((w) => (
            <span key={w} className="pill pill-ai" title={`${formatLongDate(weekMonday(w))} – ${formatLongDate(weekSunday(w))}`}>
              {formatLongDate(weekMonday(w))}
              <button className="btn btn-ghost btn-sm" style={{ padding: '0 2px' }} aria-label={`Remove ${w}`} onClick={() => save({ ...cal, holidayWeeks: cal.holidayWeeks.filter((x) => x !== w) })}>
                ✕
              </button>
            </span>
          ))}
        </div>
      </Panel>
    </div>
  );
}
