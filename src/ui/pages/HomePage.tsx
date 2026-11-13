// Home: a landscape for the season and time of day, the coach's checklist and to-dos, the week's level-ups,
// the squad on the mountain, and the latest results. Getting started when the roster is empty.
import './home.css';
import { useMemo } from 'react';
import { Panel } from '../components/common';
import { useData } from '../data/DataContext';
import { Link } from '../router';
import { displayName, fullName } from '../../engine/display';
import { addDays, formatLongDate } from '../../engine/dates';
import { formatTime } from '../../engine/format';
import { deriveAll } from '../../engine/derive';
import { CAMPS, coachToDos, currentWindow, houseCup, levelUps, setupChecklist, TIER_ORDER } from '../../engine/coach';
import { KIND_LABEL } from '../components/PerformanceEditor';
import { YamaScene, moodFor } from '../art/YamaScene';

function greeting(now: Date): { jp: string; en: string } {
  const h = now.getHours();
  if (h < 11) return { jp: 'おはよう', en: 'Good morning' };
  if (h < 17) return { jp: 'こんにちは', en: 'Good afternoon' };
  return { jp: 'こんばんは', en: 'Good evening' };
}

function Hero({ children }: { children: React.ReactNode }) {
  const now = new Date();
  return (
    <section className="home-hero">
      <YamaScene mood={moodFor(now)} shape="banner" seed={now.getDate()} className="home-hero-art" preserveAspectRatio="xMidYMid slice" />
      <div className="home-hero-body">{children}</div>
    </section>
  );
}

/** The squad on the mountain: how many runners are at each camp, drawn on a ridge. */
function SquadMountain({ counts }: { counts: Record<string, number> }) {
  const camps = TIER_ORDER;
  return (
    <div className="squad-mtn">
      <svg viewBox="0 0 400 150" className="squad-mtn-art" aria-hidden="true">
        <defs>
          <linearGradient id="smtn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#7f97c0" />
            <stop offset="1" stopColor="#4f7d5a" />
          </linearGradient>
        </defs>
        <path d="M0,150 C70,140 120,110 170,70 C190,52 200,22 214,14 L224,12 C240,26 252,48 270,66 C310,106 350,136 400,150 Z" fill="url(#smtn)" />
        <path d="M206,20 L214,14 L224,12 L232,20 L226,28 L220,22 L214,30 L209,24 Z" fill="#fff" />
        <path d="M30,150 C90,138 150,128 220,124 C290,120 350,132 400,150 Z" fill="#2f6a43" opacity="0.65" />
      </svg>
      {camps.map((t, i) => (
        <div key={t} className={`squad-camp squad-camp-${t}`} style={{ left: `${[12, 30, 46, 52][i]}%`, bottom: `${[6, 30, 56, 82][i]}%` }}>
          <span className="squad-camp-n num">{counts[t] ?? 0}</span>
          <span className="squad-camp-name">
            {CAMPS[t].jp} {CAMPS[t].name}
          </span>
        </div>
      ))}
    </div>
  );
}

export function HomePage() {
  const { snapshot, derived, today, config } = useData();
  const athletes = snapshot.athletes.filter((a) => a.active);
  const lastWeek = useMemo(() => (athletes.length ? deriveAll(snapshot, addDays(derived.asOf, -7), config) : null), [snapshot, derived.asOf, config, athletes.length]);
  const ups = useMemo(() => (lastWeek ? levelUps(lastWeek, derived) : []), [lastWeek, derived]);
  const g = greeting(new Date());
  const coachName = snapshot.meta.coachName;

  if (!athletes.length) {
    return (
      <div className="stack">
        <Hero>
          <div className="home-greet">
            <span className="home-jp">ようこそ</span> Welcome to Tasuki Cards
          </div>
          <p className="home-sub">Results in once; ratings, PBs, streaks, badges, cards and boards update themselves.</p>
          <div className="row">
            <Link className="btn btn-primary btn-lg" to="/paste">
              Paste your first results
            </Link>
            <Link className="btn btn-lg" to="/roster">
              Import a roster
            </Link>
            <Link className="btn btn-lg" to="/settings?tab=data">
              Try the demo data
            </Link>
          </div>
        </Hero>
        <Panel title="Three ways to start">
          <ol className="home-steps">
            <li>
              <strong>Paste a results table</strong> (or drop the .xlsx): every runner not on the roster gets a <em>New athlete</em> button, and runners from your school are flagged.
            </li>
            <li>
              <strong>Or import the roster</strong> from the school spreadsheet.
            </li>
            <li>
              <strong>Then print the cards</strong> and put the boards on the projector.
            </li>
          </ol>
        </Panel>
      </div>
    );
  }

  const all = [...derived.athletes.values()].filter((d) => d.athlete.active);
  const inForm = all.filter((d) => d.inForm.length);
  const streaking = all.filter((d) => d.streak.currentStreak >= 2).length;
  const checklist = setupChecklist(snapshot, derived, today);
  const open = checklist.filter((c) => !c.done);
  const todos = coachToDos(snapshot, derived);
  const camps: Record<string, number> = {};
  for (const d of all) camps[d.ratings.tier] = (camps[d.ratings.tier] ?? 0) + 1;
  const win = currentWindow(snapshot, derived.asOf);
  const houses = houseCup(derived, win.from, win.to);
  const recent = [...snapshot.performances].filter((p) => !p.deleted).sort((a, b) => ((a.createdAt ?? a.date) < (b.createdAt ?? b.date) ? 1 : -1)).slice(0, 8);
  const name = (id: string) => {
    const d = derived.athletes.get(id);
    return d ? displayName(d.athlete) : '';
  };

  return (
    <div className="stack home">
      <Hero>
        <div className="home-greet">
          <span className="home-jp">{g.jp}</span> {g.en}
          {coachName ? `, ${coachName}` : ''}
        </div>
        <p className="home-sub">
          {formatLongDate(derived.asOf)} · {all.length} runners on the mountain · {streaking} on a streak · {inForm.length} In-Form
        </p>
        <div className="row">
          <Link className="btn btn-primary" to="/entry">
            Quick Entry
          </Link>
          <Link className="btn" to="/paste">
            Paste &amp; Match
          </Link>
          <Link className="btn btn-accent" to="/projector?board=reveal">
            ✨ Reveal this week on the projector
          </Link>
        </div>
      </Hero>

      <div className="home-tiles">
        <Link className="tile" to="/boards?board=inform">
          <span className="tile-n num">{inForm.length}</span>
          <span className="tile-l">In-Form this week</span>
        </Link>
        <Link className="tile" to="/boards?board=streak">
          <span className="tile-n num">{streaking}</span>
          <span className="tile-l">on a streak of 2+ weeks</span>
        </Link>
        <Link className="tile tile-shu" to="/projector?board=reveal">
          <span className="tile-n num">{ups.length}</span>
          <span className="tile-l">levelled up this week</span>
        </Link>
        <Link className="tile" to="/squad">
          <span className="tile-n num">{(camps.gold ?? 0) + (camps.icon ?? 0)}</span>
          <span className="tile-l">on the ridge or the summit</span>
        </Link>
      </div>

      <div className="grid-2">
        <Panel title={open.length ? `Coach's checklist (${checklist.length - open.length}/${checklist.length})` : 'Coach’s checklist: all done'}>
          <ul className="checklist">
            {checklist.map((c) => (
              <li key={c.id} className={c.done ? 'is-done' : ''}>
                <span className="check-mark" aria-hidden="true">
                  {c.done ? '✓' : c.optional ? '○' : '!'}
                </span>
                <span>
                  {c.to && !c.done ? <Link to={c.to}>{c.label}</Link> : c.label}
                  {c.detail && <span className="muted small"> · {c.detail}</span>}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="To do">
          {todos.length === 0 ? (
            <p className="muted small">Nothing waiting. Go for a run.</p>
          ) : (
            <ul className="checklist">
              {todos.map((t) => (
                <li key={t.id}>
                  <span className="check-mark todo" aria-hidden="true">
                    {t.count}
                  </span>
                  <span>{t.to ? <Link to={t.to}>{t.text}</Link> : t.text}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid-2">
        <Panel
          title="This week’s level-ups"
          actions={
            <Link className="btn btn-sm btn-accent" to="/projector?board=reveal">
              Reveal
            </Link>
          }
        >
          {ups.length === 0 ? (
            <p className="muted small">No level-ups in the last 7 days yet.</p>
          ) : (
            <ul className="levelups">
              {[...ups].reverse().slice(0, 8).map((u) => (
                <li key={u.athleteId}>
                  <Link to={`/athlete/${u.athleteId}`}>{name(u.athleteId)}</Link>
                  <span className="levelup-lines">{u.lines.slice(0, 2).join(' · ')}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel
          title="The squad on the mountain"
          actions={
            <Link className="btn btn-sm" to="/squad">
              Squad view
            </Link>
          }
        >
          <SquadMountain counts={camps} />
          {houses.length >= 2 && (
            <div className="house-mini">
              <strong>House cup</strong> ({win.label}):{' '}
              {houses.map((h, i) => (
                <span key={h.house} className={`pill ${i === 0 ? 'pill-shu' : ''}`} style={{ marginRight: 4 }}>
                  {i === 0 ? '🏆 ' : ''}
                  {h.house} {h.perMember}
                </span>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Latest results">
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
                    <td className="small">{ev ? <Link to={`/event/${ev.id}`}>{ev.name}</Link> : ''}</td>
                    <td className="num">{p.timeSec != null ? formatTime(p.timeSec) : p.bleepLaps != null ? `${p.bleepLaps} laps` : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
