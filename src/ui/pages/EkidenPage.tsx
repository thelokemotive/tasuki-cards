// The Winter Ekiden board (spec §6): the team tasuki travels the Hakone route, one credited gym session at a
// time. Team only: never individual session counts, who did not train, freezes, frost or "!" flags. The pin
// line and the weekly post helper are for the coach only (never projected or printed).
import './ekiden.css';
import { useMemo, useState } from 'react';
import type { ISOWeek } from '../../types';
import type { Config, RouteStation } from '../../engine/config';
import { displayName } from '../../engine/display';
import { formatLongDate, isoWeek, weekMonday } from '../../engine/dates';
import { ekidenPosition, km1, pinLine, type EkidenPosition, type TeamEkiden } from '../../engine/white';
import { postValues, weeklyPost } from '../../engine/weeklyPost';
import { Empty, PageHeader, Panel, Seg } from '../components/common';
import { useData } from '../data/DataContext';
import { useToast } from '../components/Toast';
import { Link, navigate, useRoute } from '../router';

// Route drawing: Day 1 runs left → right along the top, Day 2 returns right → left along the bottom.
const X0 = 70;
const X1 = 840;
const Y1 = 120;
const Y2 = 300;

function pointAt(km: number, route: RouteStation[]): { x: number; y: number } {
  const stations = [...route].sort((a, b) => a.km - b.km);
  const finish = stations.at(-1)?.km ?? 1;
  const turnIdx = stations.findIndex((s) => s.dayFinish);
  const turn = turnIdx >= 0 ? stations[turnIdx].km : finish / 2;
  const k = Math.max(0, Math.min(finish, km));
  if (k <= turn) return { x: X0 + ((X1 - X0) * k) / turn, y: Y1 };
  return { x: X1 - ((X1 - X0) * (k - turn)) / Math.max(0.001, finish - turn), y: Y2 };
}

/** The route as a path up to `km` (the travelled part). */
function pathTo(km: number, route: RouteStation[]): string {
  const stations = [...route].sort((a, b) => a.km - b.km);
  const turnIdx = stations.findIndex((s) => s.dayFinish);
  const turn = turnIdx >= 0 ? stations[turnIdx].km : (stations.at(-1)?.km ?? 1) / 2;
  const p = pointAt(km, route);
  if (km <= turn) return `M ${X0} ${Y1} L ${p.x} ${p.y}`;
  const r = (Y2 - Y1) / 2;
  return `M ${X0} ${Y1} L ${X1} ${Y1} A ${r} ${r} 0 0 1 ${X1} ${Y2} L ${p.x} ${p.y}`;
}

function RouteSvg({ km, config }: { km: number; config: Config }) {
  const route = config.winter.route;
  const finish = Math.max(0, ...route.map((s) => s.km));
  const marker = pointAt(km, route);
  return (
    <svg className="ek-svg" viewBox="0 0 1000 420" role="img" aria-label={`Winter Ekiden route, tasuki at ${km1(km).toFixed(1)} km`}>
      <text x={X0} y={44} className="ek-day">Day 1 · outward</text>
      <text x={X0} y={400} className="ek-day">Day 2 · return</text>
      <path d={pathTo(finish, route)} className="ek-road" />
      <path d={pathTo(Math.min(km, finish), route)} className="ek-done" />
      {route.map((s, i) => {
        const p = pointAt(s.km, route);
        const top = p.y === Y1;
        const passed = km >= s.km;
        // The Day 1 finish sits at the turn: its label goes inside the U, beside the bend.
        const labelY = s.dayFinish ? (Y1 + Y2) / 2 + 16 : top ? p.y - 42 : p.y + 42;
        const labelX = s.dayFinish ? X1 + (Y2 - Y1) / 2 - 22 : p.x;
        return (
          <g key={`${s.name}-${s.km}`}>
            <circle cx={p.x} cy={p.y} r={s.dayFinish || i === 0 || i === route.length - 1 ? 12 : 9} className={passed ? 'ek-stn ek-stn-done' : 'ek-stn'} />
            <text x={labelX} y={labelY} textAnchor={s.dayFinish ? 'end' : 'middle'} className={`ek-stn-name${s.dayFinish ? ' ek-turn' : ''}`}>
              {s.name}
            </text>
            <text x={labelX} y={labelY + 20} textAnchor={s.dayFinish ? 'end' : 'middle'} className="ek-stn-km">
              {s.km.toFixed(1)} km{s.dayFinish ? ' · Day 1 finish' : ''}
            </text>
          </g>
        );
      })}
      {/* The tasuki marker: a pin whose head carries a red sash. */}
      {/* On Day 1 the station names are above the line, so the pin hangs below it; on Day 2 it stands above. */}
      <g transform={`translate(${marker.x} ${marker.y === Y1 ? marker.y + 4 : marker.y - 4})`} className="ek-marker">
        <g transform={marker.y === Y1 ? 'scale(1 -1)' : undefined}>
          <path d="M 0 0 C -10 -12 -17 -20 -17 -31 A 17 17 0 1 1 17 -31 C 17 -20 10 -12 0 0 Z" className="ek-pin" />
          <rect x={-15} y={-36} width={30} height={10} rx={2} transform="rotate(-32 0 -31)" className="ek-sash" />
        </g>
        <text y={marker.y === Y1 ? 68 : -52} textAnchor="middle" className="ek-pin-label">
          {km1(km).toFixed(1)} km
        </text>
      </g>
    </svg>
  );
}

export interface BoardWeek {
  week: ISOWeek;
  index: number;
  pos: EkidenPosition;
  cards: number;
  km: number;
  total: number;
  thawNames: string[];
}

export function boardWeek(team: TeamEkiden, week: ISOWeek, config: Config, name: (id: string) => string): BoardWeek | undefined {
  const index = team.weeks.findIndex((w) => w.week === week);
  const wk = team.weeks[index];
  if (!wk) return undefined;
  return { week, index, pos: ekidenPosition(wk.totalKm, config.winter.route), cards: wk.cards, km: wk.km, total: wk.totalKm, thawNames: wk.thaws.map(name).sort() };
}

/** The board itself: identical on screen, in projector mode and in print. Team numbers only. */
export function EkidenBoard({ bw, config, big }: { bw: BoardWeek; config: Config; big?: boolean }) {
  const { pos } = bw;
  return (
    <div className={`ek-board${big ? ' ek-big' : ''}`} data-testid="ekiden-board">
      <div className="ek-title">
        <div>
          <div className="ek-kicker">Winter Ekiden · {config.winter.season.name}</div>
          <h2>Hakone route, {pos.finishKm.toFixed(1)} km</h2>
        </div>
        <div className="ek-slogan">{config.winter.slogan}</div>
      </div>
      <RouteSvg km={bw.total} config={config} />
      <div className="ek-facts">
        {pos.finished ? (
          <div className="ek-fact ek-finished">
            <strong>FINISHED</strong>
            <span>{pos.lapKm > 0 ? `victory lap +${pos.lapKm.toFixed(1)} km` : 'Ōtemachi reached'}</span>
          </div>
        ) : (
          <>
            <div className="ek-fact">
              <span>Leg</span>
              <strong>{pos.leg}</strong>
              <em>Day {pos.day}: {pos.from.name} → {pos.next.name}</em>
            </div>
            <div className="ek-fact">
              <span>Next station</span>
              <strong>{pos.next.name}</strong>
              <em>{pos.kmToNext.toFixed(1)} km to go</em>
            </div>
          </>
        )}
        <div className="ek-fact">
          <span>Week of {formatLongDate(weekMonday(bw.week))}</span>
          <strong>{bw.cards} cards</strong>
          <em>{km1(bw.km).toFixed(1)} km</em>
        </div>
        <div className="ek-fact">
          <span>Season total</span>
          <strong>{km1(bw.total).toFixed(1)} km</strong>
          <em>&nbsp;</em>
        </div>
      </div>
      {bw.thawNames.length > 0 && (
        <div className="ek-thaws">
          <strong>Comeback Thaws this week:</strong> {bw.thawNames.join(', ')}
        </div>
      )}
    </div>
  );
}

export function EkidenPage() {
  const { derived, config, snapshot, asOf: today, commit } = useData();
  const toast = useToast();
  const route = useRoute();
  const team = derived.ekiden;
  const athletes = useMemo(() => new Map(snapshot.athletes.map((a) => [a.id, a])), [snapshot.athletes]);
  const name = (id: string) => {
    const a = athletes.get(id);
    return a ? displayName(a) : '';
  };
  const weeks = team?.weeks ?? [];
  // Default: the last completed week (the one just imported); during the first week, that week.
  const thisWeek = isoWeek(today);
  const def = [...weeks].reverse().find((w) => w.week < thisWeek)?.week ?? weeks.at(-1)?.week;
  const [picked, setPicked] = useState<string | undefined>(route.query.get('week') ?? undefined);
  const week = picked && weeks.some((w) => w.week === picked) ? picked : def;
  const [paper, setPaper] = useState<'A4' | 'A3'>('A4');
  const projector = route.query.get('projector') === '1';

  if (!team || !week) {
    return (
      <div className="stack">
        <PageHeader title="Winter Ekiden" subtitle="The team tasuki travels the Hakone route, one gym card at a time." />
        <Panel>
          <Empty title="White Season has not started">
            <p>
              The board starts on {formatLongDate(config.winter.season.start)}. Set the season and km per session in <Link to="/settings?tab=white">Settings → White Season</Link>.
            </p>
          </Empty>
        </Panel>
      </div>
    );
  }
  const bw = boardWeek(team, week, config, name)!;

  if (projector) {
    return (
      <div className="ek-projector" onKeyDown={(e) => e.key === 'Escape' && navigate(`/ekiden?week=${week}`)} tabIndex={-1}>
        <EkidenBoard bw={bw} config={config} big />
        <button className="btn ek-exit no-print" onClick={() => navigate(`/ekiden?week=${week}`)}>
          Exit
        </button>
      </div>
    );
  }

  const last = bw.index > 0 ? team.weeks[bw.index - 1].cards : undefined;
  const post = weeklyPost(postValues(team, bw.index, name, config), last, bw.index, config);
  const copyPost = async () => {
    if (!post) return toast('No template fits: check the weekly post templates in Settings → White Season.', 'err');
    try {
      await navigator.clipboard.writeText(post.text);
      toast('Weekly post copied: paste it into Teams.', 'ok');
    } catch {
      window.prompt('Copy the weekly post:', post.text);
    }
    if (snapshot.meta.lastPostWeek !== week) await commit({ meta: { ...snapshot.meta, lastPostWeek: week } });
  };

  return (
    <div className="stack">
      <style>{`@page ekiden { size: ${paper} landscape; margin: 8mm; }`}</style>
      <div className="no-print stack">
        <PageHeader
          title="Winter Ekiden"
          subtitle="Team board: every credited gym session (term and holiday) moves the tasuki. No individual counts are ever shown."
          actions={
            <span className="row">
              <button className="btn" onClick={() => navigate(`/ekiden?week=${week}&projector=1`)}>
                Projector
              </button>
              <button className="btn btn-primary" onClick={() => window.print()} data-testid="print-ekiden">
                Print ({paper})
              </button>
            </span>
          }
        />
        <Panel>
          <div className="row">
            <label className="small">
              Week{' '}
              <select className="select" style={{ width: 'auto' }} value={week} onChange={(e) => setPicked(e.target.value)}>
                {weeks.map((w) => (
                  <option key={w.week} value={w.week}>
                    {formatLongDate(weekMonday(w.week))}
                    {w.kind === 'holiday' ? ' (holiday)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <Seg<'A4' | 'A3'> value={paper} onChange={setPaper} options={[{ value: 'A4', label: 'A4' }, { value: 'A3', label: 'A3' }]} />
            {team.kmPerSession === 0 && (
              <span className="pill pill-warn">
                Km per session not set: confirm it in <Link to="/settings?tab=white">Settings → White Season</Link>
              </span>
            )}
          </div>
          <div className="ek-coach" data-testid="pin-line">
            <strong>For the coach:</strong> {pinLine(bw.pos)}
          </div>
          <div className="row" style={{ marginTop: 8, alignItems: 'flex-start' }}>
            <button className="btn btn-accent" onClick={copyPost} data-testid="copy-post">
              Copy weekly post
            </button>
            <span className="small muted" style={{ flex: 1 }}>
              {post ? post.text : 'No template fits.'}
            </span>
          </div>
        </Panel>
      </div>
      <div className="ek-print">
        <EkidenBoard bw={bw} config={config} />
      </div>
    </div>
  );
}
