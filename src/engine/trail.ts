// The pupil's Trail (獣道 Kemonomichi): this week at a glance, two or three missions, and the squad's shared
// quest. Pure views of what the engine already works out (streak, Winter Mode, development focus, summit
// ladder). Nothing here changes a rating or a streak rule: a treadmill run waiting for the coach shows as
// "kindling" on the pupil's own phone, and counts only once a coach approves it, as before.
import type { Calendar, ISODate, ISOWeek } from '../types';
import type { Config } from './config';
import type { AthleteDerived, Derived } from './derive';
import type { RatingKey, StatKey, StreakResult, StreakWeekState } from './types';
import { streakBefore } from './reminders';
import { addWeeks, daysBetween, isoWeek, weekSunday } from './dates';
import { developmentFocus, summitLadder } from './coach';
import { STAT_LONG, STAT_SPIRIT, type SpiritId } from './spirits';

/** This week on the trail. 'pending': a run is waiting for the coach (the pupil's own phone only). */
export type WeekStatus = 'kept' | 'pending' | 'open' | 'holiday' | 'frozen';

export interface TrailWeek {
  week: ISOWeek;
  status: WeekStatus;
  /** Kept weeks in a row, as the streak counts them. */
  streak: number;
  best: number;
  /** The streak once this week is kept. */
  next: number;
  /** Days left this week, today included (Monday 7, Sunday 1). */
  daysLeft: number;
  /** The next streak milestone and how many kept weeks to go; `held` when its badge was earned on an earlier trail. */
  milestone?: { at: number; toGo: number; held: boolean };
  /** Lost a streak before, none running now: the comeback (the Amami rabbit). */
  comeback: boolean;
  /** What keeps a week, in words. */
  ways: string;
  /** Winter Mode this week: sessions towards the Rule of 2. */
  winter?: { sessions: number; target: number; runs: number; kept: boolean };
  /** The last weeks, oldest first, for the trail strip (state per week). */
  recent: { week: ISOWeek; state: StreakResult['weeks'][number]['state'] }[];
}

export function waysToKeep(config: Config): string {
  return config.streak.treadmillCounts ? 'a Circuit run, a Saturday run or a treadmill run' : 'a Circuit run or a Saturday run';
}

/**
 * This week for one runner, on `today`. The ratings a pupil sees were worked out on a coach's device and can
 * be a few days old, so the weeks after that copy are read from the calendar: a holiday week holds the trail,
 * any other week is not known to be kept, and this week is open. `pendingThisWeek`: treadmill logs for this
 * week still waiting for the coach (from the pupil's own inbox; 0 where that is not known).
 */
export function trailWeek(d: AthleteDerived, config: Config, today: ISODate, pendingThisWeek = 0, holidays: ReadonlySet<ISOWeek> = new Set(), show = 12): TrailWeek {
  const s = d.streak;
  const week = isoWeek(today);
  const byWeek = new Map(s.weeks.map((w) => [w.week, w.state]));
  const known = byWeek.get(week);
  const nowState: StreakWeekState = known ?? (holidays.has(week) ? 'holiday' : 'current');
  let status: WeekStatus;
  if (nowState === 'counted') status = 'kept';
  else if (nowState === 'holiday') status = 'holiday';
  else if (nowState === 'frozen') status = 'frozen';
  else status = pendingThisWeek > 0 ? 'pending' : 'open';
  const streak = streakBefore(s, week, holidays) + (status === 'kept' ? 1 : 0);
  const best = Math.max(s.bestStreak, streak);
  const milestoneAt = [...config.streak.milestones].sort((a, b) => a - b).find((m) => m > streak);
  const winterNow = d.winter?.thisWeek?.week === week ? d.winter.thisWeek : undefined;
  const first = s.weeks[0]?.week;
  const recent: TrailWeek['recent'] = [];
  for (let i = show - 1; i >= 0; i--) {
    const w = addWeeks(week, -i);
    if (!first || w < first) continue;
    const st = byWeek.get(w);
    recent.push({ week: w, state: w === week ? nowState : st == null || st === 'current' ? (holidays.has(w) ? 'holiday' : 'missed') : st });
  }
  return {
    week,
    status,
    streak,
    best,
    next: streak + (status === 'kept' ? 0 : 1),
    daysLeft: Math.max(1, daysBetween(today, weekSunday(week)) + 1),
    milestone: milestoneAt ? { at: milestoneAt, toGo: milestoneAt - streak, held: best >= milestoneAt } : undefined,
    comeback: streak === 0 && best > 0,
    ways: waysToKeep(config),
    winter: winterNow ? { sessions: winterNow.sessions, target: d.winter!.target, runs: winterNow.runs, kept: winterNow.state === 'kept' } : undefined,
    recent,
  };
}

export interface Mission {
  id: string;
  kind: 'trail' | 'winter' | 'grow' | 'awaken' | 'freshen' | 'camp';
  title: string;
  detail: string;
  spirit: SpiritId;
  /** Tracked from the data: done this week. Undefined for suggestions the app cannot see (a session idea). */
  done?: boolean;
  /** 0–1 for tracked missions with steps (the Rule of 2). */
  progress?: number;
  stat?: RatingKey;
}

/**
 * This week's missions, most important first, at most three: keep the trail (always), the Rule of 2 in a
 * winter week, then one way to grow: the weakest stat (against the runner's own average), else a stat to
 * awaken (unlock), else one to freshen, else the next camp on the summit ladder. The coach's own session
 * ideas, never anything new to administer.
 */
export function weeklyMissions(d: AthleteDerived, config: Config, tw: TrailWeek): Mission[] {
  const out: Mission[] = [];
  const keepTitle = tw.streak > 0 ? `Keep your ${tw.streak}-week trail` : tw.comeback ? 'Start a fresh trail' : 'Start your trail';
  if (tw.status === 'holiday') {
    out.push({ id: 'trail', kind: 'trail', title: 'Holiday week: your trail is safe', detail: 'Rest is part of training. A parkrun or long run earns a bonus flame.', spirit: 'dugong', done: true });
  } else if (tw.status === 'frozen') {
    out.push({ id: 'trail', kind: 'trail', title: 'This week is frozen: your trail is safe', detail: 'Your coach has held this week for you. Back on the trail next week.', spirit: 'dugong', done: true });
  } else {
    out.push({
      id: 'trail',
      kind: 'trail',
      title: keepTitle,
      detail:
        tw.status === 'kept'
          ? `Done for this week. ${tw.streak > 1 ? `${tw.streak} weeks in a row.` : 'A new trail has begun.'}`
          : tw.status === 'pending'
            ? 'Your run is with your coach. It lights up once it is approved.'
            : `One session by Sunday: ${tw.ways}.`,
      spirit: tw.comeback && tw.status !== 'kept' ? 'rabbit' : 'serow',
      done: tw.status === 'kept',
    });
  }
  if (tw.winter) {
    const w = tw.winter;
    out.push({
      id: 'winter',
      kind: 'winter',
      title: `Winter: ${Math.min(w.sessions, w.target)} of ${w.target} sessions`,
      detail: w.kept ? 'Winter week kept. Extra sessions earn nothing more: rest well.' : `${w.target} sessions on different days, at least one a run of ${config.winter.minRunMinutes}+ minutes. One can be armour.`,
      spirit: 'monkey',
      done: w.kept,
      progress: Math.min(1, w.sessions / w.target),
    });
  }
  const focus = developmentFocus(d, config);
  const grow = focus.find((f) => f.kind === 'focus') ?? focus.find((f) => f.kind === 'unlock') ?? focus.find((f) => f.kind === 'refresh');
  if (grow) {
    const k = grow.stat;
    const name = STAT_LONG[k];
    const idea = grow.ideas[0] ?? '';
    if (grow.kind === 'focus') out.push({ id: `grow-${k}`, kind: 'grow', title: `Grow your ${name}`, detail: `Your quickest way up. Try: ${idea}.`, spirit: STAT_SPIRIT[k], stat: k });
    else if (grow.kind === 'unlock') out.push({ id: `awaken-${k}`, kind: 'awaken', title: `Awaken ${name}`, detail: unlockText(d, k), spirit: STAT_SPIRIT[k], stat: k });
    else out.push({ id: `freshen-${k}`, kind: 'freshen', title: `Freshen your ${name}`, detail: `Your ${k} rests on an old result. A new one keeps it strong. ${idea}.`, spirit: STAT_SPIRIT[k], stat: k });
  } else {
    const ladder = summitLadder(d, config);
    if (ladder.next) out.push({ id: 'camp', kind: 'camp', title: 'Next camp', detail: ladder.headline, spirit: 'serow' });
  }
  return out.slice(0, 3);
}

function unlockText(d: AthleteDerived, k: StatKey): string {
  const s = d.ratings.stats[k];
  const how = (s.unlockHelp ?? s.unlockHint ?? '').trim();
  return how ? `${how.replace(/\.$/, '')}. A first try can only add to your OVR.` : 'A first result unlocks it, and can only add to your OVR.';
}

/** Runners in the squad's shared quest: active squad pupils (staff and whole-school runners left out). */
export function questRunners(derived: Derived): AthleteDerived[] {
  return [...derived.athletes.values()].filter((d) => d.athlete.active && d.athlete.squad !== false && d.athlete.yearGroup !== 'Staff' && !d.athlete.hiddenOnline);
}

export interface SquadQuest {
  week: ISOWeek;
  runners: number;
  /** Runners whose week is kept so far. */
  kept: number;
  /** Beat the squad's best week of the last four (at least half the squad). */
  target: number;
  lastWeek: number;
  bestRecent: number;
  reached: boolean;
}

function keptIn(d: AthleteDerived, week: ISOWeek): boolean {
  return d.streak.weeks.some((w) => w.week === week && w.state === 'counted');
}

/**
 * The squad's shared quest for the week: how many runners have kept this week, against a target of one
 * more than the best of the last four weeks (never less than half the squad, never more than all of it).
 * Counts only: nobody is named, so nobody is singled out for missing a week.
 */
export function squadQuest(derived: Derived, asOf: ISODate): SquadQuest {
  const week = isoWeek(asOf);
  const runners = questRunners(derived);
  const count = (w: ISOWeek) => runners.filter((d) => keptIn(d, w)).length;
  const recent = [1, 2, 3, 4].map((n) => count(addWeeks(week, -n)));
  const bestRecent = Math.max(0, ...recent);
  const n = runners.length;
  const target = n === 0 ? 0 : Math.min(n, Math.max(Math.ceil(n / 2), bestRecent + 1));
  const kept = count(week);
  return { week, runners: n, kept, target, lastWeek: recent[0], bestRecent, reached: n > 0 && kept >= target };
}

/** Week of the year for a season label: the trail's Japanese season for a date (spring Mar–May, …). */
export function seasonOf(date: ISODate): 'spring' | 'summer' | 'autumn' | 'winter' {
  const m = Number(date.slice(5, 7));
  return m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter';
}

/** Calendar holiday weeks as a set (for the reminder sender, which has no derived 'holiday' for a future week). */
export function holidaySet(calendar: Calendar): Set<ISOWeek> {
  return new Set(calendar.holidayWeeks);
}

export interface Find {
  key: string;
  label: string;
  icon: string;
  found: boolean;
  /** How to find it (for the ones still out there). */
  how?: string;
  date?: ISODate;
}

/**
 * The runner's badge collection, found and still to find: every badge they hold, then the next step on each
 * ladder they have not reached (one per ladder, so the list stays short and reachable).
 */
export function trailFinds(d: AthleteDerived, config: Config): Find[] {
  const found: Find[] = d.badges.map((b) => ({ key: b.key, label: b.label, icon: b.icon, found: true, date: b.date }));
  const have = new Set(d.badges.map((b) => b.key));
  const todo: Find[] = [];
  const streakNext = [...config.streak.milestones].sort((a, b) => a - b).find((m) => !have.has(`streak-${m}`));
  if (streakNext) todo.push({ key: `streak-${streakNext}`, label: `${streakNext}-week trail`, icon: '🔥', found: false, how: `Keep ${streakNext} weeks in a row (holiday weeks hold it).` });
  const dist = config.badges.distances.slice().sort((a, b) => a.km - b.km).find((x) => !have.has(`distance-${x.key}`));
  if (dist && dist.km <= 21.1) todo.push({ key: `distance-${dist.key}`, label: dist.label, icon: '🏁', found: false, how: `A verified run of ${dist.km < 10 ? dist.km : Math.round(dist.km)} km or more.` });
  if (!have.has('caps')) todo.push({ key: 'caps', label: 'First race cap', icon: '★', found: false, how: 'Run an official race for the school.' });
  if (!have.has('mountain')) todo.push({ key: 'mountain', label: `Mountain (${config.badges.mountainClimbM.toLocaleString('en-GB')} m+ climb)`, icon: '⛰️', found: false, how: `One run with ${config.badges.mountainClimbM.toLocaleString('en-GB')} m of climbing or more.` });
  if (config.streak.treadmillCounts) {
    const held = d.badges.find((b) => b.kind === 'treadmill')?.count ?? 0;
    const km = [...config.treadmill.kmMilestones].sort((a, b) => a - b).find((m) => m > held);
    if (km) todo.push({ key: `treadmill-${km}`, label: `Treadmill ${km} km club`, icon: '👟', found: false, how: `${km} km of approved treadmill runs in all.` });
  }
  for (const [dom, name] of [['ankle', 'Ankle'], ['calf', 'Calf'], ['control', config.arm.plate3 === 'balance' ? 'Balance' : 'Control']] as const) {
    const b = d.badges.find((x) => x.key === `arm-${dom}`);
    const level = b?.count ?? 0;
    if (level < 5) todo.push({ key: `arm-${dom}-${level + 1}`, label: `${name} L${level + 1}`, icon: '🛡️', found: false, how: level ? `Reach level ${level + 1} on the ${name.toLowerCase()} plate at an ARM test.` : `Pass level 1 on the ${name.toLowerCase()} plate at an ARM test.` });
  }
  if (!d.badges.some((b) => b.kind === 'surge')) todo.push({ key: 'surge', label: 'Tasuki Surge', icon: '⚡', found: false, how: 'Run a relay leg well beyond what your times predict.' });
  return [...found, ...todo];
}
