// The squad, for pupils: the shared quest (counts only, nobody named for missing a week), the house cup
// when there is one, the way to the boards, and every runner's card.
import './pupil.css';
import { useMemo } from 'react';
import { useData } from '../data/DataContext';
import { Link } from '../router';
import { SpiritPortrait } from '../art/Spirits';
import { ViewerHome } from '../cloud/ViewerHome';
import { squadQuest } from '../../engine/trail';
import { currentWindow, houseCup } from '../../engine/coach';

export function SquadHub() {
  const { derived, snapshot, today } = useData();
  const quest = useMemo(() => squadQuest(derived, today), [derived, today]);
  const win = currentWindow(snapshot, derived.asOf);
  const houses = useMemo(() => houseCup(derived, win.from, win.to), [derived, win.from, win.to]);
  return (
    <div className="stack">
      <section className="trail-panel squad-quest">
        <div className="quest">
          <SpiritPortrait id="monkey" className="quest-spirit quest-spirit-lg" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="trail-h" style={{ fontSize: '1.3rem' }}>
              Squad quest
            </h1>
            <div>
              <strong className="num" style={{ fontSize: '1.6rem' }}>
                {quest.kept}
              </strong>{' '}
              {quest.kept === 1 ? 'runner has' : 'runners have'} kept this week · goal {quest.target}
              {quest.reached ? ' 🎉' : ''}
            </div>
            <div className="bar bar-moss" aria-hidden="true">
              <span style={{ width: `${quest.target ? Math.min(100, (quest.kept / quest.target) * 100) : 0}%` }} />
            </div>
            <p className="tiny muted" style={{ margin: '6px 0 0' }}>
              {quest.reached ? 'Quest complete: the squad beat its best week of the month.' : `One more than the squad's best week this month (${quest.bestRecent}). Last week ${quest.lastWeek} of ${quest.runners}.`} Snow monkeys get through the winter as a troop.
            </p>
          </div>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <Link className="btn-press btn-press-ai" to="/boards">
            🏆 Boards
          </Link>
          <Link className="btn" to="/armour">
            🛡 What is ARM?
          </Link>
        </div>
      </section>
      {houses.length >= 2 && (
        <section className="trail-panel">
          <h2 className="trail-h">House cup · {win.label}</h2>
          <ol className="house-list">
            {houses.map((h) => (
              <li key={h.house}>
                <span>{h.house}</span>
                <span className="small muted">{h.perMember} per runner</span>
              </li>
            ))}
          </ol>
          <p className="tiny muted" style={{ margin: 0 }}>
            Points for turning up and improving (kept weeks, PBs, race caps, Surge medals), per runner so a small house can win.
          </p>
        </section>
      )}
      <ViewerHome title="Every runner's card" />
    </div>
  );
}
