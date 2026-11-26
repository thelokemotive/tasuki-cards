// White Season (Dec–Apr): the gym programme that keeps the weekly streak alive while the squad skis.
// Pure functions only. Gym sessions NEVER change a rating directly: they drive the streak, freezes, the
// freshness pause (Winter Shield), badges and the team board (the Winter Ekiden). See DECISIONS.md,
// "White Season (Dec 2026)".
//
// Rules (spec §3), per runner, per week (Monday–Sunday, Asia/Tokyo):
// - Credit: at most 1 credited session per date, at most weeklyCap per week. Extra entries are kept and
//   shown to the coach, but earn nothing.
// - qualifying: credited sessions on at least minDaysPerWeek different dates. Streak +1.
// - neutral: a holiday week, or a term week covered by a freeze (a self RF within the half-term allowance,
//   or a coach or medical freeze). The streak is unchanged.
// - frosted: a non-qualifying, non-neutral term week, while the run of such weeks (neutral weeks skipped) is
//   at most missGraceWeeks long. The streak is held.
// - broken: the next one. The streak resets to 0 ("never miss twice").
// - Comeback Thaw: a qualifying week straight after a frosted or broken week (neutral weeks skipped).
import type { Athlete, ISODate, ISOWeek, Participation, Performance } from '../types';
import type { Config, RouteStation, WhiteHalfTerm, WhiteSeason } from './config';
import type { StreakWeekState } from './types';
import { addDays, dayNumber, isoWeek, weekMonday, weeksInRange } from './dates';
import { isGymSession } from './perf';

export type WhiteWeekKind = 'term' | 'holiday';
export type WhiteWeekStatus = 'qualifying' | 'neutral' | 'frosted' | 'broken' | 'current';
export type FreezeKind = 'coach' | 'self_rf' | 'medical';

/** One logged gym entry, with whether it earned credit. */
export interface GymEntry {
  perfId: string;
  date: ISODate;
  card: string;
  tier?: 1 | 2 | 3;
  hurt: boolean;
  holiday: boolean;
  credited: boolean;
  /** Why an entry earned nothing: a second entry on the same date, or over the weekly cap. */
  notCredited?: 'same_date' | 'over_cap';
}

export interface WhiteWeek {
  week: ISOWeek;
  monday: ISODate;
  kind: WhiteWeekKind;
  entries: GymEntry[];
  /** Credited sessions (≤ weeklyCap, ≤ 1 per date). */
  credited: number;
  logged: number;
  status: WhiteWeekStatus;
  neutralBy?: 'holiday' | FreezeKind;
  /** What happened to a self RF this week. */
  rf?: 'used' | 'over_allowance' | 'ignored_qualified';
  thaw: boolean;
  /** Days in this week do not age the runner's results (Winter Shield). */
  paused: boolean;
}

export interface WhiteSummary {
  athleteId: string;
  /** Season weeks up to the as-of week, oldest first. */
  weeks: WhiteWeek[];
  thaws: number;
  /** Winter Shield: on (results paused), frosted (latest counted week frosted), off. */
  shield: 'on' | 'frosted' | 'off';
  /** Days paused this season, up to asOf. */
  pausedDays: number;
  /** The latest completed counted (term) week was frosted: the card shows the frost border (coach view only). */
  frosted: boolean;
  /** Card codes logged at least once this season (any entry). */
  cardsLogged: string[];
  /** Credited sessions per holiday (keyed by the holiday's first Monday). */
  holidayCredits: Record<ISODate, number>;
  creditedTotal: number;
  /** Self RFs used per half-term id. */
  rfUsed: Record<string, number>;
}

/** In the White Season programme: explicit setting, else every active Y7–Y13 pupil (Staff: off). */
export function inWinterProgramme(a: Athlete): boolean {
  return a.winterProgramme ?? (a.active && a.yearGroup !== 'Staff');
}

/** Every week of the season, oldest first. */
export function seasonWeeks(season: WhiteSeason): ISOWeek[] {
  if (!season.start || !season.end || season.start > season.end) return [];
  return weeksInRange(isoWeek(season.start), isoWeek(season.end));
}

/** 'term' for a counted week, 'holiday' for a holiday week (and for a season week in neither list), undefined outside the season. */
export function whiteWeekKind(week: ISOWeek, season: WhiteSeason): WhiteWeekKind | undefined {
  if (!seasonWeeks(season).includes(week)) return undefined;
  const mon = weekMonday(week);
  return season.termWeeks.map(snapMonday).includes(mon) ? 'term' : 'holiday';
}

export function inWhiteSeason(date: ISODate, season: WhiteSeason): boolean {
  return !!season.start && !!season.end && season.start <= date && date <= season.end;
}

/** The Monday of the week containing `date`. */
export function snapMonday(date: ISODate): ISODate {
  return weekMonday(isoWeek(date));
}

export function halfTermOfDate(date: ISODate, halfTerms: WhiteHalfTerm[]): WhiteHalfTerm | undefined {
  return halfTerms.find((h) => h.start <= date && date <= h.end);
}

/** Holidays: runs of consecutive holiday weeks, keyed by their first Monday. */
export function seasonHolidays(season: WhiteSeason): { key: ISODate; weeks: ISOWeek[] }[] {
  const out: { key: ISODate; weeks: ISOWeek[] }[] = [];
  let prev: WhiteWeekKind | undefined;
  for (const w of seasonWeeks(season)) {
    const kind = whiteWeekKind(w, season);
    if (kind === 'holiday') {
      if (prev === 'holiday') out[out.length - 1].weeks.push(w);
      else out.push({ key: weekMonday(w), weeks: [w] });
    }
    prev = kind;
  }
  return out;
}

/** The freeze kind a stored freeze stands for (freezes from before White Season read as 'coach'). */
export function freezeKindOf(q: Participation): FreezeKind {
  return q.freezeKind ?? 'coach';
}

/**
 * Credit for one week's entries: sorted by date (then by id, so the first entered wins), the first entry on
 * each date is credited until weeklyCap is reached.
 */
export function creditWeek(perfs: Performance[], weeklyCap: number): GymEntry[] {
  const sorted = [...perfs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt ?? a.id) < (b.createdAt ?? b.id) ? -1 : 1));
  const dates = new Set<ISODate>();
  let credited = 0;
  return sorted.map((p) => {
    const g = p.gym!;
    const base = { perfId: p.id, date: p.date, card: g.card, tier: g.tier, hurt: g.hurt, holiday: g.holiday };
    if (dates.has(p.date)) return { ...base, credited: false, notCredited: 'same_date' as const };
    dates.add(p.date);
    if (credited >= weeklyCap) return { ...base, credited: false, notCredited: 'over_cap' as const };
    credited++;
    return { ...base, credited: true };
  });
}

/** The White Season for one runner as of `asOf`. Undefined when White Season is off or has not started. */
export function computeWhite(input: { athlete: Athlete; perfs: Performance[]; participation: Participation[]; config: Config; asOf: ISODate }): WhiteSummary | undefined {
  const { athlete, config, asOf } = input;
  const w = config.winter;
  if (!w.whiteEnabled) return undefined;
  const season = w.season;
  const all = seasonWeeks(season);
  if (!all.length || asOf < season.start) return undefined;
  const current = isoWeek(asOf);
  const gym = input.perfs.filter((p) => p.athleteId === athlete.id && isGymSession(p) && p.date <= asOf && inWhiteSeason(p.date, season));
  const freezes = input.participation.filter((q) => q.athleteId === athlete.id && q.type === 'freeze');

  const rfUsed: Record<string, number> = {};
  const weeks: WhiteWeek[] = [];
  let misses = 0; // consecutive non-qualifying, non-neutral term weeks (neutral weeks skipped)
  let lastNonNeutral: WhiteWeekStatus | undefined;
  let paused = true; // Winter Shield state carried into a neutral week
  for (const week of all) {
    if (week > current) break;
    const monday = weekMonday(week);
    const kind = whiteWeekKind(week, season)!;
    const entries = creditWeek(
      gym.filter((p) => isoWeek(p.date) === week),
      w.weeklyCap,
    );
    const credited = entries.filter((e) => e.credited).length;
    const qualifies = credited >= w.minDaysPerWeek;
    const kinds = new Set(freezes.filter((q) => q.isoWeek === week).map(freezeKindOf));
    let status: WhiteWeekStatus;
    let neutralBy: WhiteWeek['neutralBy'];
    let rf: WhiteWeek['rf'];
    if (kind === 'holiday') (status = 'neutral'), (neutralBy = 'holiday');
    else if (qualifies) {
      status = 'qualifying';
      if (kinds.has('self_rf')) rf = 'ignored_qualified';
    } else if (kinds.has('medical')) (status = 'neutral'), (neutralBy = 'medical');
    else if (kinds.has('coach')) (status = 'neutral'), (neutralBy = 'coach');
    else if (kinds.has('self_rf') && takeRf(monday)) (status = 'neutral'), (neutralBy = 'self_rf'), (rf = 'used');
    else {
      if (kinds.has('self_rf')) rf = 'over_allowance';
      if (week === current) status = 'current';
      else status = ++misses <= w.missGraceWeeks ? 'frosted' : 'broken';
    }
    if (status === 'qualifying') misses = 0;
    const thaw = status === 'qualifying' && (lastNonNeutral === 'frosted' || lastNonNeutral === 'broken');
    if (status === 'qualifying') paused = true;
    else if (status === 'frosted' || status === 'broken') paused = false;
    if (status !== 'neutral' && status !== 'current') lastNonNeutral = status;
    weeks.push({ week, monday, kind, entries, credited, logged: entries.length, status, neutralBy, rf, thaw, paused });
  }

  function takeRf(monday: ISODate): boolean {
    const ht = halfTermOfDate(monday, season.halfTerms);
    if (!ht) return false;
    const used = rfUsed[ht.id] ?? 0;
    if (used >= w.selfRfPerHalfTerm) return false;
    rfUsed[ht.id] = used + 1;
    return true;
  }

  const decided = weeks.filter((x) => x.status !== 'current');
  const latest = weeks.at(-1);
  const latestCounted = [...decided].reverse().find((x) => x.kind === 'term' && x.status !== 'neutral');
  const lastStatus = [...decided].reverse().find((x) => x.status !== 'neutral')?.status;
  const shieldOn = latest ? latest.paused : true;
  const holidayCredits: Record<ISODate, number> = {};
  for (const h of seasonHolidays(season)) holidayCredits[h.key] = weeks.filter((x) => h.weeks.includes(x.week)).reduce((a, x) => a + x.credited, 0);
  return {
    athleteId: athlete.id,
    weeks,
    thaws: weeks.filter((x) => x.thaw).length,
    shield: shieldOn ? 'on' : lastStatus === 'frosted' ? 'frosted' : 'off',
    pausedDays: pausedDaysAfter(weeks, addDays(season.start, -1), asOf),
    frosted: inWhiteSeason(asOf, season) && latestCounted?.status === 'frosted',
    cardsLogged: [...new Set(weeks.flatMap((x) => x.entries.map((e) => e.card)))].sort(),
    holidayCredits,
    creditedTotal: weeks.reduce((a, x) => a + x.credited, 0),
    rfUsed,
  };
}

/**
 * Freshness pause (spec §4): the number of days d with perfDate < d ≤ asOf that fall in a paused week
 * (qualifying, or neutral while the Winter Shield is on). Frosted and broken weeks age normally. Pure.
 */
export function pausedDaysAfter(weeks: Pick<WhiteWeek, 'monday' | 'paused'>[], perfDate: ISODate, asOf: ISODate): number {
  const from = dayNumber(perfDate) + 1;
  const to = dayNumber(asOf);
  let n = 0;
  for (const wk of weeks) {
    if (!wk.paused) continue;
    const a = Math.max(from, dayNumber(wk.monday));
    const b = Math.min(to, dayNumber(wk.monday) + 6);
    if (b >= a) n += b - a + 1;
  }
  return n;
}

/** White weeks as main-streak states (the same counter as Gold Season, carried into winter). */
export function whiteStreakStates(s: WhiteSummary): Map<ISOWeek, StreakWeekState> {
  const map: Record<WhiteWeekStatus, StreakWeekState> = { qualifying: 'counted', neutral: 'holiday', frosted: 'frozen', broken: 'missed', current: 'current' };
  return new Map(s.weeks.map((w) => [w.week, map[w.status]]));
}

// ---------------------------------------------------------------- the team: Winter Ekiden ----

export interface EkidenPosition {
  km: number;
  finished: boolean;
  /** Km beyond the finish (the victory lap). */
  lapKm: number;
  /** Leg 1–10 (leg n runs from station n−1 to station n). The last leg once finished. */
  leg: number;
  day: 1 | 2;
  from: RouteStation;
  next: RouteStation;
  kmToNext: number;
  finishKm: number;
}

/** Round to 0.1 km, avoiding float noise. */
export const km1 = (x: number) => Math.round((x + 1e-9) * 10) / 10;

export function ekidenPosition(km: number, route: RouteStation[]): EkidenPosition {
  const stations = [...route].sort((a, b) => a.km - b.km);
  const finishKm = stations.at(-1)?.km ?? 0;
  const dayEnd = stations.findIndex((s) => s.dayFinish);
  if (stations.length < 2) return { km, finished: false, lapKm: 0, leg: 1, day: 1, from: stations[0], next: stations[0], kmToNext: 0, finishKm };
  if (km >= finishKm) {
    const n = stations.length - 1;
    return { km, finished: true, lapKm: km1(km - finishKm), leg: n, day: dayEnd >= 0 && n > dayEnd ? 2 : 1, from: stations[n - 1], next: stations[n], kmToNext: 0, finishKm };
  }
  let i = 1;
  while (i < stations.length - 1 && km >= stations[i].km) i++;
  return { km, finished: false, lapKm: 0, leg: i, day: dayEnd >= 0 && i > dayEnd ? 2 : 1, from: stations[i - 1], next: stations[i], kmToNext: km1(stations[i].km - km), finishKm };
}

/** "Move the pin to 63.2 km (2.6 km before Hiratsuka)." — the coach's line for the paper board. */
export function pinLine(pos: EkidenPosition): string {
  if (pos.finished) return `Move the pin to the finish: ${km1(pos.finishKm).toFixed(1)} km (FINISHED${pos.lapKm > 0 ? `, victory lap +${pos.lapKm.toFixed(1)} km` : ''}).`;
  return `Move the pin to ${km1(pos.km).toFixed(1)} km (${pos.kmToNext.toFixed(1)} km before ${pos.next.name}).`;
}

/** Suggested km per session: finish ÷ (roster × counted weeks), rounded to 0.05 km. */
export function suggestKmPerSession(rosterSize: number, config: Config): number | undefined {
  const finish = Math.max(0, ...config.winter.route.map((s) => s.km));
  const weeks = config.winter.season.termWeeks.length;
  if (!(rosterSize > 0) || !(weeks > 0) || !(finish > 0)) return undefined;
  return Math.max(0.05, Math.round(finish / (rosterSize * weeks) / 0.05) * 0.05);
}

export interface TeamWeek {
  week: ISOWeek;
  kind: WhiteWeekKind;
  /** Credited sessions this week, all winter-programme runners. */
  cards: number;
  km: number;
  /** Team total at the end of this week. */
  totalKm: number;
  /** Runners who earned a Comeback Thaw this week. */
  thaws: string[];
}

export interface TeamEkiden {
  weeks: TeamWeek[];
  totalCards: number;
  totalKm: number;
  position: EkidenPosition;
  /** The date the team reached the finish, if it has. */
  finishedOn?: ISODate;
  /** Runners with at least 1 credited session by the time the team reached the finish (Winter Ekiden Finisher). */
  finishers: string[];
  kmPerSession: number;
}

/** The team board. kmPerSession null (not confirmed yet): distance stays 0. */
export function teamEkiden(summaries: WhiteSummary[], config: Config): TeamEkiden {
  const w = config.winter;
  const kps = w.kmPerSession ?? 0;
  const weeksAll = seasonWeeks(w.season);
  const credited = summaries.flatMap((s) => s.weeks.flatMap((wk) => wk.entries.filter((e) => e.credited).map((e) => ({ athleteId: s.athleteId, date: e.date }))));
  credited.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let total = 0;
  const weeks: TeamWeek[] = [];
  const lastWeek = summaries.reduce<ISOWeek | undefined>((a, s) => {
    const l = s.weeks.at(-1)?.week;
    return l && (!a || l > a) ? l : a;
  }, undefined);
  for (const week of weeksAll) {
    if (!lastWeek || week > lastWeek) break;
    const cards = credited.filter((c) => isoWeek(c.date) === week).length;
    const km = cards * kps;
    total += km;
    const thaws = summaries.filter((s) => s.weeks.find((x) => x.week === week)?.thaw).map((s) => s.athleteId);
    weeks.push({ week, kind: whiteWeekKind(week, w.season)!, cards, km: km1(km), totalKm: km1(total), thaws });
  }
  const finishKm = Math.max(0, ...w.route.map((s) => s.km));
  let finishedOn: ISODate | undefined;
  const finishers = new Set<string>();
  if (kps > 0 && finishKm > 0) {
    let run = 0;
    for (const c of credited) {
      finishers.add(c.athleteId);
      run += kps;
      if (run >= finishKm - 1e-9) {
        finishedOn = c.date;
        // Everyone who also logged that same day reached the line with the team.
        for (const d of credited) if (d.date === c.date) finishers.add(d.athleteId);
        break;
      }
    }
  }
  const totalKm = km1(credited.length * kps);
  return {
    weeks,
    totalCards: credited.length,
    totalKm,
    position: ekidenPosition(totalKm, w.route),
    finishedOn,
    finishers: finishedOn ? [...finishers] : [],
    kmPerSession: kps,
  };
}

// ---------------------------------------------------------------- badges ----

export interface WinterBadge {
  key: 'thaw' | 'all-four' | 'holiday-hero' | 'ekiden-finisher';
  label: string;
  icon: string;
  count?: number;
}

/** Cosmetic winter badges (spec §5). The four "All Four" cards are the first four configured cards. */
export function winterBadges(s: WhiteSummary | undefined, config: Config, team?: TeamEkiden): WinterBadge[] {
  if (!s) return [];
  const w = config.winter;
  const out: WinterBadge[] = [];
  if (s.thaws > 0) out.push({ key: 'thaw', label: `Comeback Thaw ×${s.thaws}`, icon: '🌱', count: s.thaws });
  const four = w.cards.filter((c) => !c.tierless).slice(0, 4).map((c) => c.code);
  if (four.length === 4 && four.every((c) => s.cardsLogged.includes(c))) out.push({ key: 'all-four', label: 'All Four', icon: '🃏' });
  if (Object.values(s.holidayCredits).some((n) => n >= w.holidayHeroSessions)) out.push({ key: 'holiday-hero', label: 'Holiday Hero', icon: '🎍' });
  if (team?.finishers.includes(s.athleteId)) out.push({ key: 'ekiden-finisher', label: 'Winter Ekiden Finisher', icon: '🎌' });
  return out;
}

// ---------------------------------------------------------------- coach radar ----

export interface RadarHurt {
  athleteId: string;
  date: ISODate;
  card: string;
  tier?: number;
}

export interface Radar {
  week: ISOWeek;
  /** No credited session in the last radarQuietWeeks counted weeks. */
  quiet: string[];
  /** radarSessionsFlag or more sessions logged in the week. */
  many: { athleteId: string; logged: number }[];
  hurt: RadarHurt[];
  summitNoPass: RadarHurt[];
  /** Self-RF allowance used up in the half-term of the selected week. */
  rfUsedUp: string[];
}

/** The coach radar for one week (coach-only: never projected or printed for display). */
export function whiteRadar(summaries: WhiteSummary[], athletes: Athlete[], config: Config, week: ISOWeek): Radar {
  const w = config.winter;
  const byId = new Map(athletes.map((a) => [a.id, a]));
  const terms = seasonWeeks(w.season).filter((x) => x <= week && whiteWeekKind(x, w.season) === 'term');
  const lastTerms = terms.slice(-w.radarQuietWeeks);
  const ht = halfTermOfDate(weekMonday(week), w.season.halfTerms);
  const radar: Radar = { week, quiet: [], many: [], hurt: [], summitNoPass: [], rfUsedUp: [] };
  for (const s of summaries) {
    const wk = s.weeks.find((x) => x.week === week);
    const recent = lastTerms.map((t) => s.weeks.find((x) => x.week === t));
    // Quiet: every one of the last counted weeks is decided, had no credited session and no coach or medical freeze.
    if (
      lastTerms.length === w.radarQuietWeeks &&
      recent.every((x) => x && x.status !== 'current' && x.credited === 0 && x.neutralBy !== 'coach' && x.neutralBy !== 'medical')
    )
      radar.quiet.push(s.athleteId);
    if (wk && wk.logged >= w.radarSessionsFlag) radar.many.push({ athleteId: s.athleteId, logged: wk.logged });
    const pass = byId.get(s.athleteId)?.summitPass;
    for (const e of wk?.entries ?? []) {
      if (e.hurt) radar.hurt.push({ athleteId: s.athleteId, date: e.date, card: e.card, tier: e.tier });
      if (e.tier === 3 && (!pass || pass.date > e.date)) radar.summitNoPass.push({ athleteId: s.athleteId, date: e.date, card: e.card, tier: e.tier });
    }
    if (ht && (s.rfUsed[ht.id] ?? 0) >= w.selfRfPerHalfTerm) radar.rfUsedUp.push(s.athleteId);
  }
  return radar;
}

/** "E2" / "R" / "A3!" — an entry as written on the sheet. */
export function entryCode(e: Pick<GymEntry, 'card' | 'tier' | 'hurt'>): string {
  return `${e.card}${e.tier ?? ''}${e.hurt ? '!' : ''}`;
}
