// Athlete page and Career Vault (spec 7): card, stat history, every result with source and
// verification, PBs, badges, streak calendar, and every result ever (expired and deleted included).
import './athlete.css';
import { useMemo, useState } from 'react';
import type { Performance } from '../../types';
import { Empty, PageHeader, Panel, Prov, Seg } from '../components/common';
import { useToast } from '../components/Toast';
import { useData } from '../data/DataContext';
import { useRoute, Link } from '../router';
import { TradingCard } from '../cards/TradingCard';
import { buildCardData, STAT_NAMES } from '../cards/cardData';
import { AthleteEditor } from '../components/AthleteEditor';
import { KIND_LABEL, PerformanceEditor } from '../components/PerformanceEditor';
import { AvatarEditor } from '../avatar/AvatarEditor';
import { AchievementModal, FreezeModal } from '../components/AthleteExtras';
import { fullName, displayName } from '../../engine/display';
import { formatKm, formatTime } from '../../engine/format';
import { formatLongDate, formatShortDate } from '../../engine/dates';
import { verifyPerformance } from '../../engine/corrections';
import { resolveContext } from '../../engine/perf';
import type { AthleteDerived } from '../../engine/derive';
import type { PerfScore, RatingKey } from '../../engine/types';
import { ExplainModal, StudentSheet } from '../components/StatExplain';
import { DevelopmentFocus, StatRadar, SummitLadder } from '../components/Mountain';
import { NextFiveK } from '../components/NextFiveK';
import { Placings } from '../components/Placings';
import { paceOf } from '../../engine/explain';
import { formatPace } from '../../engine/format';

const SPARK_KEYS: RatingKey[] = ['RACE', 'SPD', 'END', 'CLB', 'DSC', 'NAV', 'ARM'];

function Sparkline({ points }: { points: { date: string; score: number }[] }) {
  if (points.length === 0) return <span className="muted tiny">no results</span>;
  const w = 140;
  const h = 34;
  const xs = points.map((p) => new Date(p.date).getTime());
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y = (s: number) => h - 3 - ((s - 40) / 59) * (h - 6);
  const x = (t: number) => (x1 === x0 ? w / 2 : 4 + ((t - x0) / (x1 - x0)) * (w - 8));
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(xs[i]).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} className="spark" role="img" aria-label={`${points.length} results, latest ${points.at(-1)!.score}`}>
      <line x1="0" x2={w} y1={y(70)} y2={y(70)} stroke="var(--line)" strokeDasharray="2 3" />
      {points.length > 1 && <path d={d} fill="none" stroke="var(--ai-2)" strokeWidth="1.6" />}
      {points.map((p, i) => (
        <circle key={i} cx={x(xs[i])} cy={y(p.score)} r="2.4" fill="var(--ai)">
          <title>
            {formatShortDate(p.date)}: {p.score}
          </title>
        </circle>
      ))}
    </svg>
  );
}

function StreakCalendar({ d }: { d: AthleteDerived }) {
  const weeks = d.streak.weeks.slice(-52);
  if (!weeks.length) return <p className="muted small">No Circuit or Saturday-run weeks yet.</p>;
  return (
    <div>
      <div className="streak-cal">
        {weeks.map((w) => (
          <span key={w.week} className={`sc sc-${w.state}${w.holidayBonus ? ' sc-bonus' : ''}`} title={`${w.week}: ${w.state}${w.holidayBonus ? ' (holiday bonus flame)' : ''}`} />
        ))}
      </div>
      <div className="row tiny muted" style={{ marginTop: 6 }}>
        <span><span className="sc sc-counted" /> counted</span>
        <span><span className="sc sc-holiday" /> holiday</span>
        <span><span className="sc sc-frozen" /> freeze</span>
        <span><span className="sc sc-missed" /> missed</span>
        <span><span className="sc sc-current" /> this week</span>
        <span><span className="sc sc-holiday sc-bonus" /> holiday bonus</span>
      </div>
    </div>
  );
}

function resultText(p: Performance): string {
  if (p.kind === 'bleep') return p.bleepLaps != null ? `${p.bleepLaps} laps` : '—';
  if (p.kind === 'arm') {
    const a = p.arm ?? {};
    return [a.ankleCm != null && `ankle ${a.ankleCm} cm`, a.calfReps != null && `calf ${a.calfReps}`, a.storkSec != null && `stork ${a.storkSec} s`, a.hopStickBothLegs != null && `hop ${a.hopStickBothLegs ? '✓' : '✗'}`].filter(Boolean).join(' · ') || '—';
  }
  const t = p.timeSec != null ? formatTime(p.timeSec) : '—';
  const extra = [p.place && `${p.place}${p.fieldSize ? `/${p.fieldSize}` : ''}`, p.kind === 'nav' && p.navErrors != null && `${p.navErrors} err`, p.kind === 'descent' && p.cleanRun === false && 'not clean', p.legNumber && `leg ${p.legNumber}`].filter(Boolean);
  return extra.length ? `${t} (${extra.join(', ')})` : t;
}

export function AthletePage() {
  const route = useRoute();
  const { derived, snapshot, commit } = useData();
  const toast = useToast();
  const id = route.params[0];
  const d = id ? derived.athletes.get(id) : undefined;
  const [editing, setEditing] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [achOpen, setAchOpen] = useState(false);
  const [perfEdit, setPerfEdit] = useState<Performance | null>(null);
  const [view, setView] = useState<'current' | 'vault' | 'deleted'>('current');
  const [why, setWhy] = useState<RatingKey | 'OVR' | null>(null);
  const scores = useMemo(() => new Map((d?.ratings.perfScores ?? []).map((s) => [s.perfId, s])), [d]);

  if (!d) {
    return (
      <Panel>
        <Empty title="Athlete not found">
          <Link to="/roster">Back to the roster</Link>
        </Empty>
      </Panel>
    );
  }
  const a = d.athlete;
  const r = d.ratings;
  if (route.params[1] === 'share') {
    return (
      <div className="stack">
        <div className="no-print">
          <Link to={`/athlete/${a.id}`}>← Back to {fullName(a)}</Link>
        </div>
        <Panel>
          <StudentSheet d={d} />
        </Panel>
      </div>
    );
  }
  const card = buildCardData(d);
  const by = snapshot.meta.coachName || 'Coach';
  const sparks = SPARK_KEYS.map((k) => ({
    key: k,
    points: r.perfScores
      .filter((s): s is PerfScore & { score: number } => s.score != null && s.feeds.includes(k) && !s.unscoredReason)
      .map((s) => ({ date: s.date, score: s.score }))
      .sort((x, y) => (x.date < y.date ? -1 : 1)),
  }));
  const perfs = [...d.perfs].reverse().filter((p) => (view === 'deleted' ? p.deleted : !p.deleted && (view === 'vault' || !scores.get(p.id)?.expired)));
  const eventName = (p: Performance) => {
    const ctx = resolveContext(p, derived.lookup);
    return ctx.event?.name ?? ctx.course?.name ?? '';
  };
  const unverified = d.perfs.filter((p) => !p.deleted && !p.verified);

  return (
    <div className="stack">
      <PageHeader
        title={fullName(a)}
        subtitle={
          <>
            {a.yearGroup} · {a.sex} · shown as “{displayName(a)}” · {r.ageNow.estimated ? 'estimated age' : 'age'} {r.ageNow.age.toFixed(1)}
            {!a.active && <span className="pill pill-warn" style={{ marginLeft: 8 }}>inactive</span>}
            {a.absoluteBoardOptOut && <span className="pill" style={{ marginLeft: 8 }}>opted out of absolute boards</span>}
          </>
        }
        actions={
          <>
            <Link className="btn" to={`/entry?athlete=${a.id}`}>
              Add a result
            </Link>
            <Link className="btn" to={`/athlete/${a.id}/share`}>
              Student version
            </Link>
            <button className="btn" onClick={() => setAvatarOpen(true)}>
              Edit avatar
            </button>
            <button className="btn" onClick={() => setEditing(true)}>
              Edit details
            </button>
          </>
        }
      />

      <div className="athlete-top">
        <div className="athlete-card">
          <TradingCard data={card} coach />
          <div className="tiny muted" style={{ marginTop: 6, textAlign: 'center' }}>
            Config v{r.configVersion} · as of {formatLongDate(r.asOf)}
          </div>
        </div>
        <Panel title="Ratings" className="athlete-ratings">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Stat</th>
                  <th className="num">Rating</th>
                  <th>Behind it</th>
                  <th>History</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sparks.map(({ key, points }) => {
                  const s = key === 'RACE' ? r.race : r.stats[key];
                  return (
                    <tr key={key} className="clickable" onClick={() => setWhy(key)} title={`How ${key} is worked out`}>
                      <td>
                        <strong>{key}</strong> <span className="muted tiny">{STAT_NAMES[key]}</span>
                      </td>
                      <td className="num">
                        {s.locked ? <span className="lock" title={s.unlockHelp}>🔒</span> : <strong>{s.value}</strong>}
                        {!s.locked && s.provisional && <Prov />}
                        {s.shielded && <span className="pill pill-ai" title={`Growth Shield: best in 12 months was ${s.peak12m}`} style={{ marginLeft: 4 }}>shield</span>}
                      </td>
                      <td className="small" onClick={(e) => e.stopPropagation()}>
                        {s.locked ? (
                          <span className="muted">{s.unlockHelp}</span>
                        ) : (
                          (() => {
                            const ev = s.basis?.perfIds.map((id) => d.perfs.find((x) => x.id === id)?.eventId).find(Boolean);
                            return ev ? <Link to={`/event/${ev}`}>{s.basis?.label}</Link> : s.basis?.label;
                          })()
                        )}
                      </td>
                      <td>
                        <Sparkline points={points} />
                      </td>
                      <td className="right">
                        <button className="btn btn-sm btn-ghost" onClick={(e) => (e.stopPropagation(), setWhy(key))}>
                          Why?
                        </button>
                      </td>
                    </tr>
                  );
                })}
                <tr className="clickable" onClick={() => setWhy('OVR')}>
                  <td>
                    <strong>OVR</strong>
                  </td>
                  <td className="num">
                    <strong>{r.ovr.display}</strong> <span className="muted tiny">{r.ovr.unlocked}/6</span>
                  </td>
                  <td className="small" colSpan={2}>
                    Tier <span className={`tier-${r.tier}`}>{r.tier}</span>
                    {r.tierNote && <span className="muted"> · {r.tierNote}</span>} · ★ {r.race.caps} race caps
                  </td>
                  <td className="right">
                    <button className="btn btn-sm btn-ghost" onClick={(e) => (e.stopPropagation(), setWhy('OVR'))}>
                      Why?
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="tiny muted">Click any stat for the working behind it: which result, the calculation, and why the other results did not count.</p>
          {r.arm.missing.length > 0 && r.arm.missing.length < 3 && <p className="small muted">ARM levels so far: ankle {r.arm.ankle ?? '—'}, calf {r.arm.calf ?? '—'}, balance {r.arm.balance ?? '—'}.</p>}
        </Panel>
      </div>

      <div className="grid-2">
        <Panel title="Next 5K">
          <NextFiveK d={d} config={derived.config} />
        </Panel>
        <Panel title="Compared with the school">
          <Placings d={d} lookup={derived.lookup} />
        </Panel>
      </div>

      <div className="athlete-mountain">
        <Panel title="The shape of a runner">
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <StatRadar d={d} />
          </div>
        </Panel>
        <Panel title="On the mountain">
          <SummitLadder d={d} config={derived.config} />
        </Panel>
        <Panel title="What to work on">
          <DevelopmentFocus d={d} config={derived.config} />
        </Panel>
      </div>

      <div className="grid-2">
        <Panel title={`Streak: ${d.streak.currentStreak} week${d.streak.currentStreak === 1 ? '' : 's'} (best ${d.streak.bestStreak})`} actions={<button className="btn btn-sm" onClick={() => setFreezeOpen(true)}>Apply freeze…</button>}>
          <StreakCalendar d={d} />
          {d.inForm.length > 0 && (
            <p className="small" style={{ marginTop: 10 }}>
              <span className="pill pill-shu">In-Form</span> {d.inForm.map((x) => x.text).join(' · ')}
            </p>
          )}
        </Panel>
        <Panel title={`Badges (${d.badges.length})`} actions={<button className="btn btn-sm" onClick={() => setAchOpen(true)}>Add achievement…</button>}>
          {d.badges.length === 0 ? (
            <p className="muted small">No badges yet. Race caps, parkruns, distances, streaks, ARM levels, Surges and records all earn them.</p>
          ) : (
            <div className="badge-list">
              {d.badges.map((b) => (
                <span key={b.key} className={`badge-chip ${b.tier ? `badge-${b.tier}` : ''}`} title={b.date ? formatLongDate(b.date) : ''}>
                  <span aria-hidden="true">{b.icon}</span> {b.label}
                  {b.count != null && b.kind !== 'arm' && b.kind !== 'streak' ? ` ×${b.count}` : ''}
                </span>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Personal bests">
        {d.pbs.length === 0 ? (
          <p className="muted small">No PBs yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Course / distance / test</th>
                  <th className="num">Best</th>
                  <th>Date</th>
                  <th className="num">Improved by</th>
                </tr>
              </thead>
              <tbody>
                {d.pbs.map((pb) => (
                  <tr key={pb.key}>
                    <td>{pb.label}</td>
                    <td className="num">{pb.measure === 'time' ? formatTime(pb.value) : pb.value}</td>
                    <td>{formatLongDate(pb.date)}</td>
                    <td className="num">{pb.improvement != null ? (pb.measure === 'time' ? `−${formatTime(pb.improvement)}` : `+${pb.improvement}`) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        title="Results"
        actions={
          <>
            {unverified.length > 0 && view !== 'deleted' && (
              <button
                className="btn btn-sm"
                onClick={async () => {
                  const at = new Date().toISOString();
                  await commit({ put: { performances: unverified.map((p) => verifyPerformance(p, by, at)) } });
                  toast(`Verified ${unverified.length} result${unverified.length > 1 ? 's' : ''}`, 'ok');
                }}
              >
                Verify all {unverified.length} unverified
              </button>
            )}
            <Seg
              value={view}
              onChange={setView}
              options={[
                { value: 'current', label: 'Current' },
                { value: 'vault', label: 'Career Vault (all)' },
                { value: 'deleted', label: 'Deleted' },
              ]}
            />
          </>
        }
      >
        {perfs.length === 0 ? (
          <p className="muted small">{view === 'deleted' ? 'No deleted results.' : 'No results yet.'}</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Kind</th>
                  <th>Event / course</th>
                  <th>Result</th>
                  <th className="num">Pace</th>
                  <th className="num" title="Effective distance: (distance + climb ÷ 100) × terrain factor">Effort</th>
                  <th className="num" title="World-standard time for the athlete's age and sex at the effective distance">Standard</th>
                  <th className="num" title="Age grade: standard ÷ time">AG %</th>
                  <th className="num" title="Score before freshness">Score</th>
                  <th className="num" title="Freshness penalty">Fresh.</th>
                  <th className="num" title="Score after freshness: what counts today">Counts</th>
                  <th>Feeds</th>
                  <th>Source</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {perfs.map((p) => {
                  const s = scores.get(p.id);
                  const ctx = resolveContext(p, derived.lookup);
                  return (
                    <tr key={p.id} className={p.deleted ? 'row-muted' : !p.verified ? 'row-warn' : s?.expired ? 'row-muted' : ''}>
                      <td className="nowrap">{formatLongDate(p.date)}</td>
                      <td>{KIND_LABEL[p.kind]}</td>
                      <td className="small">
                        {p.eventId ? <Link to={`/event/${p.eventId}`}>{eventName(p)}</Link> : eventName(p)}
                        {ctx.distanceKm ? <span className="muted"> · {formatKm(ctx.distanceKm)}{ctx.climbM ? ` +${ctx.climbM} m` : ''}</span> : null}
                      </td>
                      <td className="num nowrap">{resultText(p)}</td>
                      <td className="num nowrap small">{(() => {
                        const pace = paceOf(p, ctx);
                        return pace != null ? formatPace(pace) : '—';
                      })()}</td>
                      <td className="num nowrap small">{s?.dEff != null && p.kind !== 'bleep' && p.kind !== 'arm' ? formatKm(s.dEff) : '—'}</td>
                      <td className="num nowrap small">{s?.standardSec != null ? formatTime(s.standardSec) : '—'}</td>
                      <td className="num nowrap small">{s?.ageGrade != null ? `${(s.ageGrade * 100).toFixed(1)}%` : '—'}</td>
                      <td className="num">
                        {s?.score != null ? s.score : '—'}
                        {s?.score != null && s.provisional && <Prov />}
                      </td>
                      <td className="num small">{s?.score != null && s.penalty > 0 ? <span title={`${s.monthsOld} months old`}>−{s.penalty}</span> : s?.score != null ? '0' : '—'}</td>
                      <td className="num">
                        <strong>{s?.fresh ?? '—'}</strong>
                      </td>
                      <td className="small">
                        {s?.unscoredReason ? <span className="muted">{s.unscoredReason}</span> : s?.expired ? <span className="muted">expired (over {derived.config.freshness.expireMonths} months)</span> : s?.feeds.join(', ')}
                      </td>
                      <td className="small">
                        {p.source}
                        {!p.verified && <span className="pill pill-warn" style={{ marginLeft: 4 }}>unverified</span>}
                        {p.history.length > 0 && <span className="pill" style={{ marginLeft: 4 }} title="Corrected">edited ×{p.history.length}</span>}
                      </td>
                      <td className="right nowrap">
                        {!p.verified && !p.deleted && (
                          <button className="btn btn-sm" onClick={() => commit({ put: { performances: [verifyPerformance(p, by, new Date().toISOString())] } })}>
                            Verify
                          </button>
                        )}{' '}
                        <button className="btn btn-sm btn-ghost" onClick={() => setPerfEdit(p)}>
                          {p.deleted ? 'View' : 'Edit'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {editing && <AthleteEditor athlete={a} onClose={() => setEditing(false)} />}
      {avatarOpen && <AvatarEditor athlete={a} unlocks={d.avatarUnlocks} onClose={() => setAvatarOpen(false)} />}
      {perfEdit && <PerformanceEditor perf={perfEdit} onClose={() => setPerfEdit(null)} />}
      {freezeOpen && <FreezeModal athlete={a} onClose={() => setFreezeOpen(false)} />}
      {achOpen && <AchievementModal athlete={a} onClose={() => setAchOpen(false)} />}
      {why && <ExplainModal d={d} stat={why} onClose={() => setWhy(null)} />}
    </div>
  );
}
