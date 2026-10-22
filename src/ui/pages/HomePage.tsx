// Home: getting started when empty; otherwise this week at a glance.
import { Empty, PageHeader, Panel } from '../components/common';
import { useData } from '../data/DataContext';
import { Link } from '../router';
import { fullName } from '../../engine/display';
import { formatLongDate } from '../../engine/dates';
import { formatTime } from '../../engine/format';
import { KIND_LABEL } from '../components/PerformanceEditor';

export function HomePage() {
  const { snapshot, derived } = useData();
  const athletes = snapshot.athletes.filter((a) => a.active);
  if (!athletes.length) {
    return (
      <div className="stack">
        <PageHeader title="Welcome to Tasuki Cards" subtitle="Results in once; ratings, PBs, streaks, badges, cards and boards update themselves." />
        <Panel>
          <Empty title="Start by importing the roster">
            <p>Paste rows from the school spreadsheet. Then add results with Quick Entry or Paste &amp; Match.</p>
            <div className="row" style={{ justifyContent: 'center' }}>
              <Link className="btn btn-primary btn-lg" to="/roster">
                Import the roster
              </Link>
              <Link className="btn btn-lg" to="/settings?tab=data">
                Or try the demo data
              </Link>
            </div>
          </Empty>
        </Panel>
      </div>
    );
  }
  const all = [...derived.athletes.values()].filter((d) => d.athlete.active);
  const inForm = all.filter((d) => d.inForm.length);
  const unverified = snapshot.performances.filter((p) => !p.deleted && !p.verified);
  const recent = [...snapshot.performances].filter((p) => !p.deleted).sort((a, b) => (a.createdAt ?? a.date) < (b.createdAt ?? b.date) ? 1 : -1).slice(0, 10);
  const streaking = all.filter((d) => d.streak.currentStreak >= 2).length;
  return (
    <div className="stack">
      <PageHeader
        title="This week"
        subtitle={`As of ${formatLongDate(derived.asOf)} · ${athletes.length} active athletes`}
        actions={
          <>
            <Link className="btn btn-primary" to="/entry">
              Quick Entry
            </Link>
            <Link className="btn" to="/paste">
              Paste &amp; Match
            </Link>
          </>
        }
      />
      <div className="grid-3">
        <Panel title={`In-Form (${inForm.length})`}>
          {inForm.length === 0 ? (
            <p className="muted small">No PBs in the last {derived.config.inForm.days} days.</p>
          ) : (
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
              {inForm.slice(0, 8).map((d) => (
                <li key={d.athlete.id}>
                  <Link to={`/athlete/${d.athlete.id}`}>{fullName(d.athlete)}</Link>: {d.inForm[0].text}
                </li>
              ))}
            </ul>
          )}
          <div style={{ marginTop: 10 }}>
            <Link to="/cards?select=inform" className="btn btn-sm">
              Print In-Form cards
            </Link>
          </div>
        </Panel>
        <Panel title="Streaks">
          <p style={{ fontSize: '2rem', fontWeight: 800, margin: 0 }} className="num">
            {streaking}
          </p>
          <p className="muted small">athletes on a streak of 2+ weeks</p>
          <Link to="/boards?board=streak" className="btn btn-sm">
            Streak board
          </Link>
        </Panel>
        <Panel title="To check">
          <p style={{ fontSize: '2rem', fontWeight: 800, margin: 0 }} className="num">
            {unverified.length}
          </p>
          <p className="muted small">unverified (student-reported) results. They do not count until ticked.</p>
          {unverified.length > 0 && (
            <Link to={`/athlete/${unverified[0].athleteId}`} className="btn btn-sm">
              Review
            </Link>
          )}
        </Panel>
      </div>
      <Panel title="Latest results">
        {recent.length === 0 ? (
          <p className="muted small">No results yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <tbody>
                {recent.map((p) => {
                  const a = snapshot.athletes.find((x) => x.id === p.athleteId);
                  const ev = snapshot.events.find((e) => e.id === p.eventId);
                  return (
                    <tr key={p.id}>
                      <td className="nowrap">{formatLongDate(p.date)}</td>
                      <td>{a ? <Link to={`/athlete/${a.id}`}>{fullName(a)}</Link> : '—'}</td>
                      <td>{KIND_LABEL[p.kind]}</td>
                      <td className="small">{ev?.name ?? ''}</td>
                      <td className="num">{p.timeSec != null ? formatTime(p.timeSec) : p.bleepLaps != null ? `${p.bleepLaps} laps` : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
