// Home for everyone at school who is not a coach: find your card, then your sheet; boards are one tap away.
import { useMemo, useState } from 'react';
import { useData } from '../data/DataContext';
import { Link } from '../router';
import { PageHeader, Panel } from '../components/common';
import { TradingCard } from '../cards/TradingCard';
import { buildCardData } from '../cards/cardData';
import { displayName } from '../../engine/display';
import { YEAR_GROUPS, type YearGroup } from '../../types';
import { formatLongDate } from '../../engine/dates';

export function ViewerHome() {
  const { derived } = useData();
  const [q, setQ] = useState('');
  const [band, setBand] = useState<YearGroup | 'all'>('all');
  const all = useMemo(
    () => [...derived.athletes.values()].filter((d) => d.athlete.active && !d.athlete.hiddenOnline).sort((a, b) => displayName(a.athlete).localeCompare(displayName(b.athlete))),
    [derived],
  );
  const needle = q.trim().toLowerCase();
  const shown = all.filter((d) => (band === 'all' || d.athlete.yearGroup === band) && (!needle || displayName(d.athlete).toLowerCase().includes(needle)));
  return (
    <div className="stack">
      <PageHeader title="Find your card" subtitle={`Harrow Appi Trail Running · ratings as of ${formatLongDate(derived.asOf)}`} actions={<Link className="btn btn-primary" to="/boards">Boards</Link>} />
      <Panel>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <input className="input" style={{ flex: '1 1 200px' }} placeholder="Type your name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search by name" />
          <select className="select" value={band} onChange={(e) => setBand(e.target.value as YearGroup | 'all')} aria-label="Year group">
            <option value="all">All years</option>
            {YEAR_GROUPS.map((y) => (
              <option key={y} value={y}>
                {y === 'Staff' ? 'Staff' : `Year ${y.slice(1)}`}
              </option>
            ))}
          </select>
        </div>
        <p className="tiny muted" style={{ marginTop: 8 }}>
          Tap a card to see how your ratings are worked out and what to work on next. New: <Link to="/armour">what ARM (armour) is, and why the Lunge, the Wall and the Throne matter on the trail</Link>.
        </p>
      </Panel>
      <div className="viewer-cards">
        {shown.map((d) => (
          <Link key={d.athlete.id} to={`/athlete/${d.athlete.id}/share`} className="viewer-card" aria-label={displayName(d.athlete)}>
            <TradingCard data={buildCardData(d)} />
          </Link>
        ))}
        {!shown.length && <p className="muted">No runner by that name. Names are shown the way each runner chose.</p>}
      </div>
    </div>
  );
}
