// Projector mode (spec 6): full-screen, dark, large type. ← → change board, C cycles, Esc exits.
import { useEffect, useState } from 'react';
import { useData } from '../data/DataContext';
import { navigate, useRoute } from '../router';
import { BoardView } from '../boards/BoardView';
import { BOARD_IDS, buildBoard } from '../../engine/boards';
import { boardQuery } from './BoardsPage';
import { BrandMark } from '../components/BrandMark';

const CYCLE_MS = 20_000;

export function ProjectorPage() {
  const { derived, ready } = useData();
  const route = useRoute();
  const q = boardQuery(route.query);
  const [cycle, setCycle] = useState(route.query.get('cycle') === '1');
  const go = (delta: number) => {
    const i = (BOARD_IDS.indexOf(q.id) + delta + BOARD_IDS.length) % BOARD_IDS.length;
    const next = new URLSearchParams(route.query);
    next.set('board', BOARD_IDS[i]);
    navigate(`/projector?${next.toString()}`);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'Escape') navigate(`/boards?${route.query.toString()}`);
      else if (e.key.toLowerCase() === 'c') setCycle((c) => !c);
      else if (e.key.toLowerCase() === 'f') document.documentElement.requestFullscreen?.().catch(() => {});
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  useEffect(() => {
    if (!cycle) return;
    const t = setTimeout(() => go(1), CYCLE_MS);
    return () => clearTimeout(t);
  });
  if (!ready) return <div className="projector">Loading…</div>;
  const board = buildBoard(q.id, derived, { full: q.full, courseId: q.courseId, eventId: q.eventId });
  return (
    <div className="projector">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6em', marginBottom: '1em', opacity: 0.85 }}>
        <BrandMark size={34} />
        <strong style={{ letterSpacing: '0.04em' }}>TASUKI CARDS</strong>
      </div>
      <BoardView board={board} variant="projector" />
      <div className="projector-bar">
        <button className="btn btn-sm" onClick={() => go(-1)}>
          ← Previous
        </button>
        <button className="btn btn-sm" onClick={() => go(1)}>
          Next →
        </button>
        <button className="btn btn-sm" onClick={() => setCycle(!cycle)}>
          {cycle ? 'Stop cycling' : 'Cycle boards'}
        </button>
        <button className="btn btn-sm" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}>
          Full screen
        </button>
        <button className="btn btn-sm" onClick={() => navigate(`/boards?${route.query.toString()}`)}>
          Exit
        </button>
      </div>
    </div>
  );
}
