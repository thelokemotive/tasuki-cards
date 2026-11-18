// "This week" for one runner: the streak and what keeps it going, the treadmill log, and which stats will
// lift the OVR next. Effort and turning up only, never a comparison with anyone else.
import './treadmill.css';
import type { AthleteDerived } from '../../engine/derive';
import type { Config } from '../../engine/config';
import type { Calendar, ISODate } from '../../types';
import { addDays } from '../../engine/dates';
import { formatKm } from '../../engine/format';
import { treadmillSummary } from '../../engine/treadmill/session';

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function MyWeek({ d, config, calendar, asOf, onLog }: { d: AthleteDerived; config: Config; calendar: Calendar; asOf: ISODate; onLog?: () => void }) {
  const s = d.streak;
  const now = s.weeks[s.weeks.length - 1];
  const thisWeek = now && now.state !== 'missed' ? now.state : 'current';
  const next = s.currentStreak + (thisWeek === 'counted' ? 0 : 1);
  const milestone = [...config.streak.milestones].sort((a, b) => a - b).find((m) => m > s.currentStreak);
  const ways = config.streak.treadmillCounts ? 'a Circuit run, a Saturday run or a treadmill run' : 'a Circuit run or a Saturday run';
  let streakLine: string;
  if (thisWeek === 'counted') streakLine = `This week is done. ${s.currentStreak > 1 ? 'Nice and steady.' : 'A new streak has started.'}`;
  else if (thisWeek === 'holiday') streakLine = 'Holiday week: your streak is safe. A parkrun or long run earns a bonus flame.';
  else if (thisWeek === 'frozen') streakLine = 'This week is frozen: your streak is safe.';
  else if (s.currentStreak > 0) streakLine = `One session by Sunday (${ways}) makes it ${plural(next, 'week')}.`;
  else streakLine = `${s.bestStreak > 0 ? 'Start a new streak' : 'Start your first streak'} this week: ${ways} is all it takes.`;

  const ht = calendar.halfTerms.find((h) => h.start <= asOf && asOf <= h.end);
  const since = ht?.start ?? addDays(asOf, -42);
  const tm = treadmillSummary(d.perfs, d.athlete.id, asOf, config, since);
  const prevMilestone = [...config.treadmill.kmMilestones].sort((a, b) => a - b).filter((m) => m <= tm.totalKm).pop() ?? 0;
  const progress = tm.nextMilestone ? (tm.totalKm - prevMilestone) / (tm.nextMilestone.km - prevMilestone) : 1;

  const ovr = d.ratings.ovr;
  const waiting = ovr.counted ? (['SPD', 'END', 'CLB', 'DSC', 'NAV', 'ARM'] as const).filter((k) => !d.ratings.stats[k].locked && !ovr.counted!.includes(k)) : [];
  const locked = (['SPD', 'END', 'CLB', 'DSC', 'NAV', 'ARM'] as const).filter((k) => d.ratings.stats[k].locked);

  return (
    <div className="my-week">
      <div className="mw-box">
        <div className="tiny muted">Weekly streak</div>
        <div className="mw-big">🔥 {plural(s.currentStreak, 'week')}</div>
        <div className="mw-weeks" aria-label="The last eight weeks">
          {s.weeks.slice(-8).map((w) => (
            <span key={w.week} title={`${w.week}: ${w.state}`} className={w.state === 'counted' ? 'on' : w.state === 'frozen' || w.state === 'holiday' ? 'frozen' : w.state === 'current' ? 'now' : ''} />
          ))}
        </div>
        <p className="small" style={{ margin: '6px 0 0' }}>{streakLine}</p>
        {milestone && <p className="tiny muted" style={{ margin: '4px 0 0' }}>{plural(milestone - s.currentStreak, 'more week')} to the {milestone}-week badge. Missed a week for exams or illness? Ask your coach about a streak freeze.</p>}
      </div>
      <div className="mw-box">
        <div className="tiny muted">Treadmill</div>
        <div className="mw-big">{formatKm(tm.kmSince)}</div>
        <p className="small" style={{ margin: '2px 0 0' }}>
          {plural(tm.sessionsSince, 'session')} {ht ? `this half-term (${ht.name})` : 'in the last six weeks'}
          {tm.fastestKmh ? ` · best average ${tm.fastestKmh} km/h` : ''}
        </p>
        {tm.nextMilestone ? (
          <>
            <div className="mw-bar" aria-label={`${formatKm(tm.totalKm)} of ${tm.nextMilestone.km} km`}>
              <span style={{ width: `${Math.max(3, Math.min(100, progress * 100))}%` }} />
            </div>
            <p className="tiny muted" style={{ margin: '4px 0 0' }}>
              {tm.nextMilestone.toGo} km to the {tm.nextMilestone.km} km club ({formatKm(tm.totalKm)} in all)
            </p>
          </>
        ) : (
          <p className="tiny muted">Every km club badge earned. Legend.</p>
        )}
        {onLog && (
          <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={onLog}>
            📷 Log a treadmill run
          </button>
        )}
      </div>
      {(waiting.length > 0 || locked.length > 0) && (
        <div className="mw-box">
          <div className="tiny muted">Next for your OVR</div>
          {waiting.map((k) => (
            <p key={k} className="small" style={{ margin: '4px 0 0' }}>
              <strong>{k} {d.ratings.stats[k].value}</strong> is new, so it counts only when it lifts your OVR (about {ovr.value} or more), and for good after {config.ovr.newStatResults} results. Trying it never cost you a point.
            </p>
          ))}
          {locked.length > 0 && (
            <p className="small" style={{ margin: '4px 0 0' }}>
              <strong>{locked.join(', ')}</strong> {locked.length === 1 ? 'is' : 'are'} still to unlock. A first try can only add to your OVR.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
