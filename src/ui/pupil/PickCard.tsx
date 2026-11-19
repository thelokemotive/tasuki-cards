// First time on a phone: "Which runner are you?" Picked once and remembered on this phone only (the same
// choice the Log a run page has used since November). Anyone at school can already see every card, so the
// choice unlocks nothing private: it just makes the app open on your own trail.
import { useMemo, useState } from 'react';
import { useData } from '../data/DataContext';
import { SpiritPortrait } from '../art/Spirits';
import { displayName } from '../../engine/display';
import { STAT_SPIRITS } from '../../engine/spirits';
import { chime } from './juice';

export function PickCard({ onPick }: { onPick: (id: string) => void }) {
  const { derived } = useData();
  const [q, setQ] = useState('');
  const [sure, setSure] = useState<string | null>(null);
  const all = useMemo(
    () => [...derived.athletes.values()].filter((d) => d.athlete.active && !d.athlete.hiddenOnline && d.athlete.squad !== false).sort((a, b) => displayName(a.athlete).localeCompare(displayName(b.athlete))),
    [derived],
  );
  const needle = q.trim().toLowerCase();
  const shown = needle ? all.filter((d) => displayName(d.athlete).toLowerCase().includes(needle)) : all;
  const picked = sure ? derived.athletes.get(sure) : undefined;
  return (
    <div className="pick">
      <div className="pick-hero">
        <div className="pick-spirits" aria-hidden="true">
          {STAT_SPIRITS.map((s, i) => (
            <SpiritPortrait key={s} id={s} className="pick-spirit" style={{ animationDelay: `${i * 0.12}s` }} />
          ))}
        </div>
        <h1>Welcome to the trail</h1>
        <p>Six spirits of Japan's wild places, one for each of your stats. Find your card and meet yours.</p>
      </div>
      <div className="trail-panel">
        <label className="trail-h" htmlFor="pick-q">
          Which runner are you?
        </label>
        <input id="pick-q" className="input" placeholder="Type your name" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        <ul className="pick-list">
          {shown.map((d) => (
            <li key={d.athlete.id}>
              <button
                className="pick-row"
                onClick={() => {
                  chime('tap');
                  setSure(d.athlete.id);
                }}
              >
                <span className="pick-name">{displayName(d.athlete)}</span>
                <span className="muted small">{d.athlete.yearGroup === 'Staff' ? 'Staff' : `Year ${d.athlete.yearGroup.slice(1)}`}</span>
              </button>
            </li>
          ))}
          {!shown.length && <li className="muted small">No runner by that name. Names show the way each runner chose. Not on the list? Ask your coach.</li>}
        </ul>
        <p className="tiny muted" style={{ marginBottom: 0 }}>
          This phone remembers your choice; nothing is sent anywhere. Pick your own card: your coach can see which school account sends each treadmill run.
        </p>
      </div>
      {picked && (
        <div className="pick-confirm" role="dialog" aria-modal="true" aria-label="Is this you?">
          <div className="pick-confirm-card">
            <p className="small muted" style={{ margin: 0 }}>
              Is this you?
            </p>
            <h2 style={{ margin: '4px 0 12px' }}>
              {displayName(picked.athlete)} <span className="muted small">{picked.athlete.yearGroup}</span>
            </h2>
            <div className="row" style={{ justifyContent: 'center' }}>
              <button className="btn" onClick={() => setSure(null)}>
                No
              </button>
              <button
                className="btn-press btn-press-shu"
                onClick={() => {
                  chime('moment');
                  onPick(picked.athlete.id);
                }}
              >
                Yes, that's me
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
