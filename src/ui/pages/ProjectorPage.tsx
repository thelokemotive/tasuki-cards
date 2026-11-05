// Projector mode (spec 6): full-screen, large type, over a night-time mountain. ← → change board, C cycles,
// F full screen, Esc exits. board=reveal is the week's level-ups: each card flips over and its upgrades
// appear one by one, smallest first, so the biggest moments come last.
import { useEffect, useMemo, useState } from 'react';
import { useData } from '../data/DataContext';
import { navigate, useRoute } from '../router';
import { BoardView } from '../boards/BoardView';
import { availableBoards, buildBoard, type BoardId } from '../../engine/boards';
import { boardQuery, useBoardExtras } from './BoardsPage';
import { BrandMark } from '../components/BrandMark';
import { YamaScene } from '../art/YamaScene';
import { TradingCard } from '../cards/TradingCard';
import { buildCardData } from '../cards/cardData';
import { deriveAll } from '../../engine/derive';
import { addDays } from '../../engine/dates';
import { displayName } from '../../engine/display';
import { CAMPS, levelUps, type LevelUp } from '../../engine/coach';

const CYCLE_MS = 20_000;
const REVEAL_MS = 9_000;

type Screen = BoardId | 'reveal';

function CardBack() {
  return (
    <div className="card-back">
      <YamaScene mood="night" shape="tall" seed={11} className="card-back-art" preserveAspectRatio="xMidYMid slice" />
      <div className="card-back-mark">
        <BrandMark size={64} />
        <div>TASUKI CARDS</div>
        <div className="card-back-jp">山</div>
      </div>
    </div>
  );
}

function RevealView({ step, ups }: { step: number; ups: LevelUp[] }) {
  const { derived } = useData();
  if (step < 0) {
    return (
      <div className="reveal-intro">
        <div className="reveal-jp">今週の進化</div>
        <h1>This week’s level-ups</h1>
        <p>{ups.length === 0 ? 'No level-ups in the last 7 days. Next week, then.' : `${ups.length} runner${ups.length === 1 ? '' : 's'} climbed this week. Press → to reveal.`}</p>
      </div>
    );
  }
  if (step >= ups.length) {
    return (
      <div className="reveal-finale">
        <div className="reveal-jp">お疲れさま</div>
        <h1>That’s the week</h1>
        <div className="reveal-grid">
          {ups.map((u) => {
            const d = derived.athletes.get(u.athleteId);
            return d ? <TradingCard key={u.athleteId} data={buildCardData(d)} /> : null;
          })}
        </div>
      </div>
    );
  }
  const u = ups[step];
  const d = derived.athletes.get(u.athleteId);
  if (!d) return null;
  return (
    <div className="reveal-item" key={u.athleteId}>
      <div className="reveal-card">
        <div className="reveal-flip">
          <div className="reveal-face reveal-front">
            <TradingCard data={buildCardData(d)} />
          </div>
          <div className="reveal-face reveal-back">
            <CardBack />
          </div>
        </div>
      </div>
      <div className="reveal-text">
        <div className="reveal-count">
          {step + 1} / {ups.length}
        </div>
        <h1 className="reveal-name">{displayName(d.athlete)}</h1>
        {u.tierUp && (
          <div className="reveal-tier">
            {CAMPS[u.tierUp.to].jp} · {u.tierUp.to[0].toUpperCase() + u.tierUp.to.slice(1)}: {CAMPS[u.tierUp.to].name}
          </div>
        )}
        <ul className="reveal-lines">
          {u.lines.slice(0, 6).map((l, i) => (
            <li key={l} style={{ animationDelay: `${1.1 + i * 0.55}s` }}>
              {l}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function ProjectorPage() {
  const { derived, snapshot, config, ready } = useData();
  const route = useRoute();
  const reveal = route.query.get('board') === 'reveal';
  const q = boardQuery(route.query);
  const screens: Screen[] = useMemo(() => ['reveal', ...availableBoards(derived)], [derived]);
  const current: Screen = reveal ? 'reveal' : q.id;
  const extras = useBoardExtras(current);
  const lastWeek = useMemo(() => (reveal ? deriveAll(snapshot, addDays(derived.asOf, -7), config) : null), [reveal, snapshot, derived.asOf, config]);
  const ups = useMemo(() => (lastWeek ? levelUps(lastWeek, derived) : []), [lastWeek, derived]);
  const [step, setStep] = useState(-1);
  const [cycle, setCycle] = useState(route.query.get('cycle') === '1');

  const goBoard = (delta: number) => {
    const i = (screens.indexOf(current) + delta + screens.length) % screens.length;
    const next = new URLSearchParams(route.query);
    next.set('board', screens[i]);
    setStep(-1);
    navigate(`/projector?${next.toString()}`);
  };
  const go = (delta: number) => {
    if (reveal) {
      const s = step + delta;
      if (s < -1) return goBoard(-1);
      if (s > ups.length) return goBoard(1);
      setStep(s);
      return;
    }
    goBoard(delta);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        go(1);
      } else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'Escape') navigate(`/boards?${reveal ? '' : route.query.toString()}`);
      else if (e.key.toLowerCase() === 'c') setCycle((c) => !c);
      else if (e.key.toLowerCase() === 'f') document.documentElement.requestFullscreen?.().catch(() => {});
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  useEffect(() => {
    if (!cycle) return;
    const t = setTimeout(() => go(1), reveal ? REVEAL_MS : CYCLE_MS);
    return () => clearTimeout(t);
  });
  if (!ready) return <div className="projector">Loading…</div>;
  return (
    <div className="projector">
      <YamaScene mood="night" shape="banner" seed={5} className="projector-art" preserveAspectRatio="xMidYMax slice" />
      <div className="projector-shade" />
      <div className="projector-body">
        <div className="projector-brand">
          <BrandMark size={34} />
          <strong>TASUKI CARDS</strong>
          <span className="projector-jp">山</span>
        </div>
        {reveal ? <RevealView step={step} ups={ups} /> : <BoardView board={buildBoard(q.id, derived, { full: q.full, courseId: q.courseId, eventId: q.eventId, ...extras })} variant="projector" />}
      </div>
      <div className="projector-bar">
        <button className="btn btn-sm" onClick={() => go(-1)}>
          ← Previous
        </button>
        <button className="btn btn-sm" onClick={() => go(1)}>
          Next →
        </button>
        <button className="btn btn-sm" onClick={() => setCycle(!cycle)}>
          {cycle ? 'Stop cycling' : 'Cycle'}
        </button>
        <button className="btn btn-sm" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}>
          Full screen
        </button>
        <button className="btn btn-sm" onClick={() => navigate(`/boards?${reveal ? '' : route.query.toString()}`)}>
          Exit
        </button>
      </div>
    </div>
  );
}
