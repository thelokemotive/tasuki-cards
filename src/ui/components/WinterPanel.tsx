// Winter Mode on an athlete page: the flame, this week against the Rule of 2, the next step, and the
// runner's spring race pace as treadmill speeds.
import type { AthleteDerived } from '../../engine/derive';
import type { Config } from '../../engine/config';
import { pacePlan, type WinterWeek } from '../../engine/winter';
import { formatPace, formatTime } from '../../engine/format';
import { formatShortDate, weekMonday } from '../../engine/dates';

const WEEK_ICON: Record<WinterWeek['state'], string> = { kept: '🔥', rest: '🛡', missed: '·', current: '○' };

export function WeekStrip({ weeks }: { weeks: WinterWeek[] }) {
  return (
    <div className="winter-strip" aria-label="Winter weeks">
      {weeks.map((w) => (
        <span
          key={w.week}
          className={`winter-wk winter-${w.state}`}
          title={`Week of ${formatShortDate(weekMonday(w.week))} (${w.phase.name}): ${w.state === 'rest' ? `rest (${w.restBy === 'coach' ? 'coach' : 'rest pass'})` : w.state}, ${w.sessions} session${w.sessions === 1 ? '' : 's'}${w.sharp ? ', sharp' : ''}${w.skiDays ? `, ${w.skiDays} ski day${w.skiDays > 1 ? 's' : ''}` : ''}`}
        >
          {WEEK_ICON[w.state]}
          {w.sharp && w.state === 'kept' ? <sup>⚡</sup> : null}
        </span>
      ))}
    </div>
  );
}

export function PaceLine({ fiveKSec, config, label }: { fiveKSec?: number; config: Config; label: string }) {
  const p = pacePlan(fiveKSec, config);
  if (!p) return <p className="small muted">Run a timed result (a parkrun or the Circuit) to get a race pace for the treadmill.</p>;
  return (
    <div className="winter-pace">
      <div>
        <span className="tiny muted">{label}</span>
        <strong>{formatTime(p.fiveKSec)}</strong>
        <span className="small">{formatPace(p.paceSecPerKm)}</span>
      </div>
      <div>
        <span className="tiny muted">Surges on the treadmill</span>
        <strong>{p.raceKmh.toFixed(1)} km/h</strong>
        <span className="small">at {p.inclinePct}% incline</span>
      </div>
      <div>
        <span className="tiny muted">Easy running</span>
        <strong>{p.easyKmh.toFixed(1)} km/h</strong>
        <span className="small">or slower: chatting pace</span>
      </div>
    </div>
  );
}

export function WinterPanel({ d, config, coach }: { d: AthleteDerived; config: Config; coach: boolean }) {
  const w = d.winter;
  if (!w) return null;
  const tw = w.thisWeek;
  const shown = coach ? w.flags : w.flags.filter((f) => f.kind === 'return' || f.kind === 'spike');
  return (
    <div className="stack">
      <div className="winter-head">
        <div className="winter-flame">
          <span>🔥</span>
          <strong>{w.flame}</strong>
          <span className="tiny muted">week{w.flame === 1 ? '' : 's'} kept in a row (best {w.bestFlame})</span>
        </div>
        <div className="small">
          {tw ? (
            <>
              This week ({tw.phase.name}): <strong>{tw.sessions}/{w.target}</strong> sessions{tw.runs ? '' : ', no run yet'}
              {tw.sharp ? ' · ⚡ sharp' : ''}
              {tw.extra ? <span className="muted"> · {tw.extra} extra (no extra credit: rest counts too)</span> : null}
            </>
          ) : (
            <span className="muted">Not a winter week.</span>
          )}
          <div className="tiny muted">
            {w.kept}/{w.decided} weeks kept · {w.sharpWeeks} with surges · rest passes left {w.restPassesLeft}
            {w.springReady ? ' · 🌸 Spring ready' : ''}
          </div>
        </div>
      </div>
      <WeekStrip weeks={w.weeks} />
      {w.next && <p className="winter-next">{w.next}</p>}
      {shown.map((f) => (
        <p key={f.kind} className={`winter-flag winter-flag-${f.kind}`}>
          {f.message}
        </p>
      ))}
      <PaceLine fiveKSec={d.prediction?.realisticSec} config={config} label="Spring 5K target" />
    </div>
  );
}
