// Roster: everyone, with search across aliases, and the roster import.
import { useMemo, useState } from 'react';
import type { Athlete, YearGroup } from '../../types';
import { YEAR_GROUPS } from '../../types';
import { Empty, PageHeader, Panel, Prov } from '../components/common';
import { useData } from '../data/DataContext';
import { AthleteEditor, useNewAthlete } from '../components/AthleteEditor';
import { searchAthletes } from '../components/AthletePicker';
import { RosterImport } from './RosterImport';
import { Link } from '../router';
import { displayName, fullName } from '../../engine/display';

export function RosterPage() {
  const { snapshot, derived } = useData();
  const make = useNewAthlete();
  const [q, setQ] = useState('');
  const [year, setYear] = useState<YearGroup | ''>('');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Athlete | null>(null);
  const [importing, setImporting] = useState(false);

  const list = useMemo(() => {
    let xs = snapshot.athletes.filter((a) => (showInactive || a.active) && (!year || a.yearGroup === year));
    if (q.trim()) {
      const hits = new Set(searchAthletes(q, xs, 500).map((h) => h.athlete.id));
      xs = xs.filter((a) => hits.has(a.id));
    }
    return [...xs].sort((a, b) => YEAR_GROUPS.indexOf(a.yearGroup) - YEAR_GROUPS.indexOf(b.yearGroup) || a.familyName.localeCompare(b.familyName) || a.preferredName.localeCompare(b.preferredName));
  }, [snapshot.athletes, q, year, showInactive]);

  return (
    <div className="stack">
      <PageHeader
        title="Roster"
        subtitle={`${snapshot.athletes.filter((a) => a.active).length} active athletes${snapshot.athletes.some((a) => !a.active) ? `, ${snapshot.athletes.filter((a) => !a.active).length} inactive` : ''}`}
        actions={
          <>
            <button className="btn btn-primary" onClick={() => setImporting(true)} data-testid="import-roster">
              Import roster
            </button>
            <button className="btn" onClick={() => setEditing(make())}>
              Add athlete
            </button>
          </>
        }
      />
      {snapshot.athletes.length === 0 ? (
        <Panel>
          <Empty title="No athletes yet">
            <p>Start by importing the roster: paste rows from the school spreadsheet.</p>
            <button className="btn btn-primary" onClick={() => setImporting(true)}>
              Import roster
            </button>
          </Empty>
        </Panel>
      ) : (
        <Panel>
          <div className="row" style={{ marginBottom: 12 }}>
            <input className="input" style={{ maxWidth: 320 }} placeholder="Search names, aliases, kana…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="select" style={{ maxWidth: 140 }} value={year} onChange={(e) => setYear(e.target.value as YearGroup | '')}>
              <option value="">All years</option>
              {YEAR_GROUPS.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
            <label className="check small">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive
            </label>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Shown as</th>
                  <th>Year</th>
                  <th>Sex</th>
                  <th className="num">OVR</th>
                  <th className="num">RACE</th>
                  <th>Tier</th>
                  <th className="num">★</th>
                  <th className="num">Streak</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((a) => {
                  const d = derived.athletes.get(a.id);
                  const r = d?.ratings;
                  return (
                    <tr key={a.id} className={a.active ? '' : 'row-muted'}>
                      <td>
                        <Link to={`/athlete/${a.id}`}>
                          <strong>{fullName(a)}</strong>
                        </Link>
                        {a.aliases.length > 0 && <span className="muted tiny"> · {a.aliases.slice(0, 2).join(', ')}{a.aliases.length > 2 ? '…' : ''}</span>}
                        {a.demo && <span className="pill" style={{ marginLeft: 6 }}>demo</span>}
                        {a.absoluteBoardOptOut && <span className="pill" style={{ marginLeft: 6 }} title="Opted out of absolute boards">opt-out</span>}
                      </td>
                      <td className="small">{displayName(a)}</td>
                      <td>{a.yearGroup}</td>
                      <td>{a.sex}</td>
                      <td className="num">
                        {r?.ovr.display}
                        <span className="muted tiny"> {r?.ovr.unlocked}/6</span>
                        {r?.provisionalAny && <Prov />}
                      </td>
                      <td className="num">{r && !r.race.locked ? r.race.value : <span className="lock">🔒</span>}</td>
                      <td className={`tier-${r?.tier}`}>{r?.tier}</td>
                      <td className="num">{r?.race.caps ?? 0}</td>
                      <td className="num">{d?.streak.currentStreak ?? 0}</td>
                      <td className="right">
                        <button className="btn btn-sm btn-ghost" onClick={() => setEditing(a)}>
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {list.length === 0 && <p className="muted small" style={{ marginTop: 8 }}>No athletes match.</p>}
        </Panel>
      )}
      {editing && <AthleteEditor athlete={editing} onClose={() => setEditing(null)} />}
      {importing && <RosterImport onClose={() => setImporting(false)} />}
    </div>
  );
}
