// One board (spec 6), rendered the same way on screen, on the projector and in print.
import './boards.css';
import type { Board } from '../../engine/boards';
import { Prov } from '../components/common';

export function BoardView({ board, variant = 'screen', coach = false }: { board: Board; variant?: 'screen' | 'projector' | 'print'; coach?: boolean }) {
  const groups = board.groups.filter((g) => g.rows.length);
  const many = groups.length > 1;
  return (
    <section className={`board board--${variant}`} aria-label={board.title}>
      <header className="board-head">
        <h2 className="board-title">{board.title}</h2>
        {board.subtitle && <p className="board-sub">{board.subtitle}</p>}
      </header>
      {groups.length === 0 ? (
        <p className="board-empty">Nothing on this board yet.</p>
      ) : (
        <div className={`board-groups ${many ? 'board-groups--multi' : ''}`} style={many ? { ['--cols' as string]: Math.min(groups.length, variant === 'projector' ? 4 : 3) } : undefined}>
          {groups.map((g) => (
            <div className="board-group" key={g.title}>
              {many && <h3 className="board-group-title">{g.title}</h3>}
              <ol className="board-rows">
                {g.rows.map((r) => (
                  <li key={`${r.athleteId}-${r.rank}-${r.detail ?? ''}`} className={`board-row ${r.rank <= 3 && board.id !== 'surge' ? `board-row--top${r.rank}` : ''}`}>
                    <span className="board-rank num">{r.rank}</span>
                    <span className="board-name">
                      {r.name}
                      {r.yearGroup && <span className="board-year">{r.yearGroup}</span>}
                    </span>
                    <span className="board-value num">
                      {r.value}
                      {coach && r.provisional && <Prov />}
                    </span>
                    {r.detail && <span className="board-detail">{r.detail}</span>}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
      <footer className="board-foot">Tasuki Cards · Harrow Appi Trail Running</footer>
    </section>
  );
}
