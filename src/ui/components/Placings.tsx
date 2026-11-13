// "Compared with the school": every result with a finishing place, as a share of the field, and the change
// since the last time in the same race series (e.g. the Green Long Ducker 2025 → 2026). Uses places, so it
// works for whole-school races where only positions are recorded.
import type { AthleteDerived } from '../../engine/derive';
import type { Lookup } from '../../engine/perf';
import { formatLongDate } from '../../engine/dates';
import { Link } from '../router';

/** "Green Long Ducker 2026 senior boys" → "green long ducker senior boys": same race, different year. */
export function seriesKey(name: string): string {
  return name.toLowerCase().replace(/\b(19|20)\d\d\b/g, '').replace(/\s+/g, ' ').trim();
}

export interface Placing {
  perfId: string;
  eventId?: string;
  name: string;
  date: string;
  place: number;
  field: number;
  /** Share of the field finishing at or ahead (lower is better), 1–100. */
  topPct: number;
  /** Change in top % since the previous result in the same series (negative = better). */
  change?: number;
}

export function placingsOf(d: AthleteDerived, lookup: Lookup): Placing[] {
  const out: Placing[] = [];
  for (const p of d.perfs) {
    if (p.deleted || !p.place) continue;
    const ev = p.eventId ? lookup.events.get(p.eventId) : undefined;
    const field = Math.max(p.fieldSize ?? 0, ev?.fieldSize ?? 0, p.place);
    if (field < 2) continue;
    out.push({ perfId: p.id, eventId: ev?.id, name: ev?.name ?? 'Race', date: p.date, place: p.place, field, topPct: Math.max(1, Math.round((p.place / field) * 100)) });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : 1));
  const last = new Map<string, Placing>();
  for (const x of out) {
    const k = seriesKey(x.name);
    const prev = last.get(k);
    if (prev) x.change = x.topPct - prev.topPct;
    last.set(k, x);
  }
  return out.reverse();
}

export function Placings({ d, lookup }: { d: AthleteDerived; lookup: Lookup }) {
  const rows = placingsOf(d, lookup);
  if (!rows.length) return <p className="muted small">No placed results yet. Paste a placings list (positions only is fine) to see where this runner sits in the school.</p>;
  return (
    <ul className="placings">
      {rows.map((r) => (
        <li key={r.perfId}>
          <div className="placing-bar" aria-hidden="true">
            <span style={{ width: `${100 - r.topPct + 1}%` }} />
          </div>
          <div className="placing-text">
            <strong>Top {r.topPct}%</strong> · {r.place} of {r.field} ·{' '}
            {r.eventId ? <Link to={`/event/${r.eventId}`}>{r.name}</Link> : r.name} <span className="muted small">{formatLongDate(r.date)}</span>
            {r.change != null && (
              <span className={`pill ${r.change < 0 ? 'pill-ok' : r.change > 0 ? 'pill-warn' : ''}`} style={{ marginLeft: 6 }}>
                {r.change < 0 ? `▲ ${-r.change} places in 100 better than last time` : r.change > 0 ? `▼ ${r.change} in 100 behind last time` : 'same as last time'}
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
