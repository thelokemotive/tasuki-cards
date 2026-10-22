// Boards (spec 6): screen, projector mode, A4/A3 print.
import { useState } from 'react';
import { PageHeader, Panel } from '../components/common';
import { useData } from '../data/DataContext';
import { navigate, useRoute } from '../router';
import { BoardView } from '../boards/BoardView';
import { BOARD_IDS, boardEvents, buildBoard, hiddenFromAbsoluteBoards, type BoardId } from '../../engine/boards';
import { fullName } from '../../engine/display';
import { formatLongDate } from '../../engine/dates';

export const BOARD_LABELS: Record<BoardId, string> = {
  race: 'RACE',
  spd: 'SPD Circuit times',
  records: 'Course records',
  end: 'END',
  inform: 'In-Form',
  streak: 'Streaks',
  surge: 'Tasuki Surge',
  caps: 'Caps ★',
};

/** Query string shared by the page, the projector and print. */
export function boardQuery(q: URLSearchParams) {
  return {
    id: (BOARD_IDS as string[]).includes(q.get('board') ?? '') ? (q.get('board') as BoardId) : 'race',
    full: q.get('full') === '1',
    courseId: q.get('course') || undefined,
    eventId: q.get('event') || undefined,
  };
}

export function BoardsPage() {
  const { derived, snapshot } = useData();
  const route = useRoute();
  const { id, full, courseId, eventId } = boardQuery(route.query);
  const [paper, setPaper] = useState<'a4' | 'a3'>('a4');
  const board = buildBoard(id, derived, { full, courseId, eventId });
  const set = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams(route.query);
    for (const [k, v] of Object.entries(patch)) v == null || v === '' ? q.delete(k) : q.set(k, v);
    navigate(`/boards?${q.toString()}`);
  };
  const hidden = hiddenFromAbsoluteBoards(derived);
  const circuits = snapshot.courses.filter((c) => c.kind === 'circuit');
  const relays = boardEvents(derived, snapshot);

  return (
    <div className="stack">
      <div className="no-print stack">
        <PageHeader
          title="Boards"
          subtitle="Absolute boards show the top 10 and leave out athletes who opted out. In-Form, Streak and Surge boards show everyone. Names follow each athlete’s display setting."
          actions={
            <>
              <button className="btn btn-primary" onClick={() => navigate(`/projector?${route.query.toString()}`)}>
                Projector mode
              </button>
              <select className="select" style={{ width: 'auto' }} value={paper} onChange={(e) => setPaper(e.target.value as 'a4' | 'a3')} aria-label="Paper size">
                <option value="a4">A4</option>
                <option value="a3">A3</option>
              </select>
              <button className="btn" onClick={() => window.print()}>
                Print
              </button>
            </>
          }
        />
        <Panel>
          <div className="row">
            <div className="seg" role="group" aria-label="Board">
              {BOARD_IDS.map((b) => (
                <button key={b} type="button" className={b === id ? 'on' : ''} onClick={() => set({ board: b })}>
                  {BOARD_LABELS[b]}
                </button>
              ))}
            </div>
            {board.absolute && (
              <label className="check small">
                <input type="checkbox" checked={full} onChange={(e) => set({ full: e.target.checked ? '1' : undefined })} /> Show everyone (not just the top 10)
              </label>
            )}
            {(id === 'spd' || id === 'records') && (
              <select className="select" style={{ width: 'auto' }} value={courseId ?? ''} onChange={(e) => set({ course: e.target.value })}>
                <option value="">{id === 'records' ? 'All courses' : 'Default circuit'}</option>
                {(id === 'spd' ? circuits : snapshot.courses).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            {id === 'surge' && relays.length > 0 && (
              <select className="select" style={{ width: 'auto' }} value={eventId ?? ''} onChange={(e) => set({ event: e.target.value })}>
                <option value="">Latest relay</option>
                {relays.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} · {formatLongDate(e.date)}
                  </option>
                ))}
              </select>
            )}
          </div>
        </Panel>
      </div>
      <div className={`board-print ${paper}`}>
        <BoardView board={board} coach />
      </div>
      {board.absolute && hidden.length > 0 && (
        <p className="small muted no-print">
          Not on absolute boards (opted out or inactive): {hidden.map((a) => fullName(a)).join(', ')}.
        </p>
      )}
    </div>
  );
}
