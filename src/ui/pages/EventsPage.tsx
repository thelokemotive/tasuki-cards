// Events: every race, relay, parkrun, session and test, newest first.
import { useMemo, useState } from 'react';
import { Empty, PageHeader, Panel } from '../components/common';
import { useData } from '../data/DataContext';
import { Link } from '../router';
import { formatKm } from '../../engine/format';
import { formatLongDate } from '../../engine/dates';

export function EventsPage() {
  const { snapshot } = useData();
  const [q, setQ] = useState('');
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of snapshot.performances) if (!p.deleted && p.eventId) m.set(p.eventId, (m.get(p.eventId) ?? 0) + 1);
    return m;
  }, [snapshot.performances]);
  const list = [...snapshot.events].filter((e) => !q.trim() || e.name.toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.name.localeCompare(b.name)));
  return (
    <div className="stack">
      <PageHeader title="Events" subtitle="Events are created automatically when you approve pasted results or save a Quick Entry with a new event name." actions={<Link className="btn btn-primary" to="/paste">Paste results</Link>} />
      <Panel>
        {snapshot.events.length === 0 ? (
          <Empty title="No events yet">
            <p>Paste a results table or line-format text to create one.</p>
          </Empty>
        ) : (
          <>
            <input className="input" style={{ maxWidth: 300, marginBottom: 12 }} placeholder="Search events" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Event</th>
                    <th>Kind</th>
                    <th>Course / distance</th>
                    <th className="num">Academy results</th>
                    <th className="num">Field</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((e) => {
                    const course = snapshot.courses.find((c) => c.id === e.courseId);
                    return (
                      <tr key={e.id}>
                        <td className="nowrap">{formatLongDate(e.date)}</td>
                        <td>
                          <Link to={`/event/${e.id}`}>
                            <strong>{e.name}</strong>
                          </Link>
                          {!e.official && <span className="pill" style={{ marginLeft: 6 }}>unofficial</span>}
                          {e.demo && <span className="pill" style={{ marginLeft: 6 }}>demo</span>}
                        </td>
                        <td>{e.kind.replace('_', ' ')}</td>
                        <td className="small">{course ? course.name : e.distanceKm ? `${formatKm(e.distanceKm)}${e.climbM ? ` +${e.climbM} m` : ''}` : '—'}</td>
                        <td className="num">{counts.get(e.id) ?? 0}</td>
                        <td className="num">{e.fieldSize ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
