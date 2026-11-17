// Winter Mode: keep fitness (and the streak) alive over the school holidays and the snow season with a
// small, fixed weekly dose, without rewarding junk miles or cramming.
//
// The rule ("Rule of 2"): a winter week is kept with config.winter.sessionsPerWeek sessions on separate
// days, at least one of them a run (outdoors, treadmill, or any counted result). One armour (calf/ankle) or gym session can
// stand in for the others. Ski days are recorded but never count: pupils ski anyway, and the point is
// running impact for calves and Achilles, which ski boots take away.
//
// Design choices, each for a reason:
// - Weekly, not daily: daily streaks reward junk miles and running through soreness.
// - Capped: sessions beyond the target earn nothing extra, and minutes or km earn nothing at all, so
//   there is no reason to cram or run long. The "sharp" star (race-pace surges) is the only bonus.
// - Asymmetric: a kept holiday week adds to the main streak; a missed holiday week still never breaks it.
// - Nothing here touches a rating. Top-ups are self-reported and treadmills are uncalibrated, so they never
//   feed SPD/END, PBs or the 5 km prediction. Card stats do not decay over a winter anyway (decay starts
//   after config.freshness.decayGraceMonths), so there is no "decay shield" to sell.
// - Load flags are nudges, not locks. The acute:chronic ratio research is disputed (Impellizzeri et al.
//   2020), so the spike rule is a generous plain-English warning, not an injury-risk number.
import type { Athlete, Calendar, ISODate, ISOWeek, Participation, Performance, SoreSpot, TopUp, WinterPhase } from '../types';
import type { Config } from './config';
import { addDays, daysBetween, isoWeek, weekMonday, weekSunday, weeksInRange } from './dates';
import { counts } from './perf';

export type WinterWeekState = 'kept' | 'rest' | 'missed' | 'current';

export interface WinterWeek {
  week: ISOWeek;
  phase: WinterPhase;
  /** Days with a run that counts (top-up and treadmill runs of at least minRunMinutes, gym runs, counted results). */
  runs: number;
  /** Sessions that count towards the target, one per day (run days + at most target − 1 armour/gym days). */
  sessions: number;
  /** Sessions logged beyond the target: recorded, worth nothing extra. */
  extra: number;
  /** Running minutes this week (results without a time count as 20). */
  runMinutes: number;
  /** A session with race-pace surges or strides, or a race, parkrun or Circuit. */
  sharp: boolean;
  skiDays: number;
  state: WinterWeekState;
  /** Why a 'rest' week rested: a pass from the allowance, or the coach (illness, injury). */
  restBy?: 'pass' | 'coach';
}

export type WinterFlagKind = 'return' | 'spike' | 'volume' | 'soreness' | 'pain' | 'growth';

export interface WinterFlag {
  kind: WinterFlagKind;
  /** Plain words for the pupil. */
  message: string;
  /** Also a coach to-do (pain, very high volume). */
  coach: boolean;
}

export interface WinterSummary {
  athleteId: string;
  /** Sessions needed per week for this athlete (staff have their own target). */
  target: number;
  /** Winter weeks up to the as-of week, oldest first. */
  weeks: WinterWeek[];
  /** Consecutive kept weeks, newest first, stopping at a missed week (rest weeks neither add nor break). */
  flame: number;
  bestFlame: number;
  kept: number;
  /** Weeks decided so far (not counting the current week unless it is already kept). */
  decided: number;
  sharpWeeks: number;
  restPassesLeft: number;
  springReady: boolean;
  /** The phase the as-of date is in, if any. */
  phase?: WinterPhase;
  /** The as-of week, when it is a winter week. */
  thisWeek?: WinterWeek;
  flags: WinterFlag[];
  /** What to do next, in one line. */
  next: string;
}

interface Session {
  date: ISODate;
  kind: 'run' | 'other' | 'ski';
  minutes: number;
  sharp: boolean;
  soreness?: number;
  soreWhere?: SoreSpot;
}

/** Winter phase covering any day of `week` (the earliest such phase). */
export function phaseOfWeek(week: ISOWeek, phases: WinterPhase[]): WinterPhase | undefined {
  const mon = weekMonday(week);
  const sun = weekSunday(week);
  return [...phases].sort((a, b) => (a.start < b.start ? -1 : 1)).find((p) => p.start <= sun && mon <= p.end);
}

export function phaseOfDate(date: ISODate, phases: WinterPhase[]): WinterPhase | undefined {
  return phases.find((p) => p.start <= date && date <= p.end);
}

/** Every ISO week touched by a winter phase, oldest first. */
export function winterWeeks(phases: WinterPhase[]): ISOWeek[] {
  const set = new Set<ISOWeek>();
  for (const p of phases) if (p.start <= p.end) for (const w of weeksInRange(isoWeek(p.start), isoWeek(p.end))) set.add(w);
  return [...set].sort();
}

function topUpSession(q: Participation & { topUp: TopUp }, config: Config): Session | undefined {
  const t = q.topUp;
  const w = config.winter;
  const minutes = Math.max(0, t.minutes || 0);
  if (t.activity === 'ski') return { date: q.date, kind: 'ski', minutes, sharp: false, soreness: t.soreness, soreWhere: t.soreWhere };
  const isRun = t.activity === 'run' || t.activity === 'treadmill' || (t.activity === 'gym' && ((t.km ?? 0) > 0 || !!t.sharp));
  if (isRun) return minutes >= w.minRunMinutes ? { date: q.date, kind: 'run', minutes, sharp: !!t.sharp, soreness: t.soreness, soreWhere: t.soreWhere } : undefined;
  const min = t.activity === 'armour' ? w.armourMinMinutes : w.minRunMinutes;
  return minutes >= min ? { date: q.date, kind: 'other', minutes, sharp: !!t.sharp, soreness: t.soreness, soreWhere: t.soreWhere } : undefined;
}

/** Every session for one athlete: top-ups, Saturday runs and counted results (a result is a run). */
function sessionsOf(perfs: Performance[], participation: Participation[], config: Config, asOf: ISODate): Session[] {
  const out: Session[] = [];
  for (const p of perfs) {
    if (!counts(p) || p.date > asOf) continue;
    if (p.kind === 'arm') {
      out.push({ date: p.date, kind: 'other', minutes: config.winter.armourMinMinutes, sharp: false });
      continue;
    }
    const sharp = p.kind === 'race' || p.kind === 'parkrun' || p.kind === 'circuit' || p.kind === 'relay_leg' || p.kind === 'bleep';
    out.push({ date: p.date, kind: 'run', minutes: p.timeSec ? p.timeSec / 60 : 20, sharp });
  }
  for (const q of participation) {
    if (q.date > asOf) continue;
    if (q.type === 'saturday_run') out.push({ date: q.date, kind: 'run', minutes: 30, sharp: false });
    if (q.type === 'top_up' && q.topUp) {
      const s = topUpSession(q as Participation & { topUp: TopUp }, config);
      if (s) out.push(s);
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function runMinutesBetween(sessions: Session[], from: ISODate, to: ISODate): number {
  return sessions.filter((s) => s.kind === 'run' && from <= s.date && s.date <= to).reduce((a, s) => a + s.minutes, 0);
}

export function computeWinter(input: {
  athlete: Athlete;
  perfs: Performance[];
  participation: Participation[];
  calendar: Calendar;
  config: Config;
  asOf: ISODate;
}): WinterSummary | undefined {
  const { athlete, calendar, config, asOf } = input;
  const phases = calendar.winter ?? [];
  if (!phases.length) return undefined;
  const w = config.winter;
  const target = Math.max(1, athlete.yearGroup === 'Staff' ? w.staffSessionsPerWeek : w.sessionsPerWeek);
  const mine = input.participation.filter((q) => q.athleteId === athlete.id);
  const sessions = sessionsOf(input.perfs.filter((p) => p.athleteId === athlete.id), mine, config, asOf);
  const coachRest = new Set(mine.filter((q) => q.type === 'freeze').map((q) => q.isoWeek));
  const currentWeek = isoWeek(asOf);

  let passes = w.restPasses;
  const weeks: WinterWeek[] = [];
  for (const week of winterWeeks(phases)) {
    if (week > currentWeek) break;
    const phase = phaseOfWeek(week, phases)!;
    const mon = weekMonday(week);
    const sun = weekSunday(week);
    const inWeek = sessions.filter((s) => mon <= s.date && s.date <= sun);
    // Sessions count on separate days: two runs on one Sunday are one session (no last-minute cramming).
    const runDays = new Set(inWeek.filter((s) => s.kind === 'run').map((s) => s.date));
    const otherDays = new Set(inWeek.filter((s) => s.kind === 'other' && !runDays.has(s.date)).map((s) => s.date));
    const runs = runDays.size;
    const logged = inWeek.filter((s) => s.kind !== 'ski').length;
    const counted = Math.min(target, runs + Math.min(otherDays.size, target - 1));
    const keptNow = runs >= 1 && counted >= target;
    let state: WinterWeekState;
    let restBy: WinterWeek['restBy'];
    if (keptNow) state = 'kept';
    else if (coachRest.has(week)) (state = 'rest'), (restBy = 'coach');
    else if (week === currentWeek) state = 'current';
    else if (passes > 0) (state = 'rest'), (restBy = 'pass'), passes--;
    else state = 'missed';
    weeks.push({
      week,
      phase,
      runs,
      sessions: counted,
      extra: Math.max(0, logged - counted),
      runMinutes: Math.round(runMinutesBetween(inWeek, mon, sun)),
      sharp: inWeek.some((s) => s.sharp && s.kind !== 'ski'),
      skiDays: new Set(inWeek.filter((s) => s.kind === 'ski').map((s) => s.date)).size,
      state,
      restBy,
    });
  }

  let flame = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    const s = weeks[i].state;
    if (s === 'missed') break;
    if (s === 'kept') flame++;
  }
  let run = 0;
  let bestFlame = 0;
  for (const wk of weeks) {
    if (wk.state === 'kept') bestFlame = Math.max(bestFlame, ++run);
    else if (wk.state === 'missed') run = 0;
  }
  const kept = weeks.filter((x) => x.state === 'kept').length;
  const decided = weeks.filter((x) => x.state !== 'current').length;
  const thisWeek = weeks.find((x) => x.week === currentWeek);
  const phase = phaseOfDate(asOf, phases) ?? thisWeek?.phase;
  const flags = winterFlags(sessions, athlete, config, asOf);

  return {
    athleteId: athlete.id,
    target,
    weeks,
    flame,
    bestFlame,
    kept,
    decided,
    sharpWeeks: weeks.filter((x) => x.state === 'kept' && x.sharp).length,
    restPassesLeft: passes,
    springReady: decided >= 2 && kept / Math.max(1, decided) >= w.springReadyShare,
    phase,
    thisWeek,
    flags,
    next: nextStep(thisWeek, target, flags, config),
  };
}

/** Load and soreness nudges from the last few weeks of sessions. */
export function winterFlags(sessions: Session[], athlete: Athlete, config: Config, asOf: ISODate): WinterFlag[] {
  const w = config.winter;
  const flags: WinterFlag[] = [];
  const runs = sessions.filter((s) => s.kind === 'run' && s.date <= asOf);
  const last = runs.at(-1);
  const gapNow = last ? daysBetween(last.date, asOf) : Infinity;
  // A break is no run for returnAfterDays, or barely any (less than one short run's worth) in the
  // returnAfterDays before this week: one 10-minute jog in a fortnight does not wake up the tendons.
  const fortnightBefore = runMinutesBetween(runs, addDays(asOf, -6 - w.returnAfterDays), addDays(asOf, -7));
  if (gapNow >= w.returnAfterDays || fortnightBefore < w.firstBackMinutes) {
    flags.push({
      kind: 'return',
      message: `First week back after a break: keep each run to ${w.firstBackMinutes} minutes, easy, and save the surges for next week.`,
      coach: false,
    });
  }

  const week7 = runMinutesBetween(runs, addDays(asOf, -6), asOf);
  const prior28 = runMinutesBetween(runs, addDays(asOf, -34), addDays(asOf, -7));
  const avg = prior28 / 4;
  if (week7 > w.spikeMinMinutes && avg > 0 && week7 > w.spikeRatio * avg) {
    flags.push({
      kind: 'spike',
      message: `A big jump: ${Math.round(week7)} running minutes this week against about ${Math.round(avg)} a week before. Keep the next run short and easy.`,
      coach: false,
    });
  }
  if (athlete.yearGroup !== 'Staff' && week7 > w.weeklyMinutesFlag) {
    flags.push({ kind: 'volume', message: `${Math.round(week7)} running minutes in seven days: more than winter needs. Two good sessions is the target.`, coach: true });
  }

  const recent = [...sessions].reverse().find((s) => s.soreness != null && daysBetween(s.date, asOf) <= 3);
  const where = recent?.soreWhere ? ` (${recent.soreWhere})` : '';
  const growing = recent && (recent.soreWhere === 'heel' || recent.soreWhere === 'knee') && w.growthYears.includes(athlete.yearGroup);
  if (recent && growing && recent.soreness! >= w.sorenessSwap) {
    flags.push({
      kind: 'growth',
      message: `Sore ${recent.soreWhere} ${recent.soreness}/10. In growing runners heel and knee pain needs a check: no running or hopping until the coach has seen it.`,
      coach: true,
    });
  } else if (recent && recent.soreness! >= w.painFlag) {
    flags.push({ kind: 'pain', message: `Soreness ${recent.soreness}/10${where} after your last session. No running until it settles; tell the coach.`, coach: true });
  } else if (recent && recent.soreness! >= w.sorenessSwap) {
    flags.push({ kind: 'soreness', message: `Soreness ${recent.soreness}/10${where}: make the next session armour (calf raises, pogo hops, ankle work), not a run. It still counts.`, coach: false });
  }
  return flags;
}

function nextStep(week: WinterWeek | undefined, target: number, flags: WinterFlag[], config: Config): string {
  if (flags.some((f) => f.kind === 'pain' || f.kind === 'growth')) return 'Rest and tell the coach. A coach rest week keeps your flame.';
  if (!week) return 'Winter Mode is not on this week.';
  const swap = flags.some((f) => f.kind === 'soreness');
  const easy = flags.some((f) => f.kind === 'return' || f.kind === 'spike');
  if (week.state === 'kept') {
    return week.sharp ? 'Week kept, with a sharp session. Anything more this week is optional: rest is training too.' : 'Week kept. Optional: next time, finish a run with 4–6 surges at race pace for the ⚡.';
  }
  const left = target - week.sessions;
  const what = swap
    ? 'an armour session (10 minutes of calf raises, pogo hops and ankle work)'
    : week.runs === 0
      ? easy
        ? `an easy run of up to ${config.winter.firstBackMinutes} minutes (outdoors or treadmill)`
        : 'a run of 20–30 minutes (outdoors or treadmill)'
      : week.phase.kind === 'snow'
        ? 'a "ski-boot antidote": 10 minutes of pogo hops and single-leg calf raises, or another run'
        : easy
          ? 'another easy run'
          : 'a run that finishes with 4–6 × 30 s surges at race pace';
  return `${left} more to keep this week: ${what}.`;
}

/** Spring race pace on a treadmill, from a 5 km time (the runner's realistic next-5K target). */
export interface PacePlan {
  fiveKSec: number;
  paceSecPerKm: number;
  /** Treadmill speed for race-pace surges (km/h, to 0.1), at config.winter.treadmillInclinePct incline. */
  raceKmh: number;
  /** Easy running: race pace + 25% time per km. */
  easyKmh: number;
  inclinePct: number;
}

export function pacePlan(fiveKSec: number | undefined, config: Config): PacePlan | undefined {
  if (!fiveKSec || !(fiveKSec > 0)) return undefined;
  const pace = fiveKSec / 5;
  const kmh = (secPerKm: number) => Math.round((3600 / secPerKm) * 10) / 10;
  return { fiveKSec, paceSecPerKm: pace, raceKmh: kmh(pace), easyKmh: kmh(pace * 1.25), inclinePct: config.winter.treadmillInclinePct };
}

export interface HouseWinter {
  house: string;
  members: number;
  kept: number;
  decided: number;
  /** kept ÷ decided (0–1). */
  share: number;
}

/** House Frost Cup: the share of decided winter weeks kept, across each house's pupils (not staff). */
export function winterHouseCup(summaries: WinterSummary[], athletes: Athlete[]): HouseWinter[] {
  const byId = new Map(athletes.map((a) => [a.id, a]));
  const out = new Map<string, HouseWinter>();
  for (const s of summaries) {
    const a = byId.get(s.athleteId);
    if (!a?.house || a.yearGroup === 'Staff' || !a.active) continue;
    const h = out.get(a.house) ?? { house: a.house, members: 0, kept: 0, decided: 0, share: 0 };
    h.members++;
    h.kept += s.kept;
    h.decided += s.decided;
    out.set(a.house, h);
  }
  for (const h of out.values()) h.share = h.decided ? h.kept / h.decided : 0;
  return [...out.values()].sort((a, b) => b.share - a.share || a.house.localeCompare(b.house));
}
