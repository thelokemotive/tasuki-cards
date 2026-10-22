// Boards (spec 6): screen, projector and print all render these view models. Pure.
// Absolute boards (RACE, SPD, records, END, caps) show the top config.boards.topN (or everyone with
// opts.full) and leave out opted-out and inactive athletes. In-Form, Streak and Surge boards show every
// active athlete, opted out or not. Names always follow the athlete's displayMode. Locked stats never
// appear as numbers.
import type { Athlete, DataSnapshot, Sex, TasukiEvent, YearGroup } from '../types';
import type { Config } from './config';
import type { CourseRecord, InFormEntry, StatValue, SurgeResult, YearBand } from './types';
import { YEAR_BANDS } from './types';
import { dayNumber, formatLongDate, formatShortDate, monthsBetween } from './dates';
import { displayName, yearBand } from './display';
import { formatKm, formatTime } from './format';
import { courseTimeOf } from './pbs';
import type { AthleteDerived, Derived } from './derive';

export type BoardId = 'race' | 'spd' | 'records' | 'end' | 'inform' | 'streak' | 'surge' | 'caps';
export const BOARD_IDS: BoardId[] = ['race', 'spd', 'records', 'end', 'inform', 'streak', 'surge', 'caps'];

export interface BoardRow {
  /** Competition ranking within the group (ties share a rank: 1, 2, 2, 4). */
  rank: number;
  athleteId: string;
  /** Per displayMode (or 'Record holder (private)' on the records board). */
  name: string;
  yearGroup: YearGroup;
  value: string;
  sortValue: number;
  detail?: string;
  provisional?: boolean;
}

export interface BoardGroup {
  title: string;
  rows: BoardRow[];
}

export interface Board {
  id: BoardId;
  title: string;
  subtitle?: string;
  /** Absolute boards exclude opted-out and inactive athletes and show the top N. */
  absolute: boolean;
  groups: BoardGroup[];
  /** True when at least one group was cut to the top N. */
  truncated: boolean;
}

export interface BoardOptions {
  /** Show everyone instead of the top N (absolute boards). */
  full?: boolean;
  /** Surge board: the relay event (default: the newest relay with results). */
  eventId?: string;
  /** SPD board: the circuit course (default: the circuit course with most results). Records: one course only. */
  courseId?: string;
}

/** Name shown on the records board when the holder has opted out of absolute boards. */
export const PRIVATE_RECORD_HOLDER = 'Record holder (private)';

/** Default minimum current streak for the Streak board (spec 6: "everyone on 2+ weeks"). */
export const STREAK_BOARD_MIN_DEFAULT = 2;

const ABSOLUTE: Record<BoardId, boolean> = { race: true, spd: true, records: true, end: true, caps: true, inform: false, streak: false, surge: false };

const BAND_LABEL: Record<YearBand, string> = { 'Y7-8': 'Y7–8', 'Y9-11': 'Y9–11', 'Y12-13': 'Y12–13', Staff: 'Staff' };
const SEXES: Sex[] = ['F', 'M'];

/** 'Girls Y7–8', 'Boys Y9–11', 'Staff women', 'Staff men'. */
export function sexBandTitle(sex: Sex, band: YearBand): string {
  if (band === 'Staff') return `Staff ${sex === 'F' ? 'women' : 'men'}`;
  return `${sex === 'F' ? 'Girls' : 'Boys'} ${BAND_LABEL[band]}`;
}

function streakBoardMin(config: Config): number {
  const v = (config.boards as Config['boards'] & { streakMinWeeks?: number }).streakMinWeeks;
  return v != null && v >= 1 ? v : STREAK_BOARD_MIN_DEFAULT;
}

/** '+4.2%', '−1.0%' */
export function formatPct(pct: number): string {
  const r = Math.round(pct * 10) / 10;
  if (r === 0) return '0.0%';
  return `${r < 0 ? '−' : '+'}${Math.abs(r).toFixed(1)}%`;
}

function titleCase(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function eligible(d: AthleteDerived, absolute: boolean): boolean {
  if (!d.athlete.active) return false;
  return !(absolute && d.athlete.absoluteBoardOptOut);
}

interface Candidate {
  d: AthleteDerived;
  value: string;
  sortValue: number;
  detail?: string;
  provisional?: boolean;
  /** Secondary sort, higher first (e.g. best streak). */
  tie?: number;
}

/**
 * Sort and rank one group. `higherIsBetter` false for times. Ties share a rank and are listed by
 * secondary key, then name, then id, so the order never depends on storage order.
 */
function rankRows(cands: Candidate[], higherIsBetter: boolean): BoardRow[] {
  const dir = higherIsBetter ? -1 : 1;
  const named = cands.map((c) => ({ c, name: displayName(c.d.athlete) }));
  named.sort(
    (a, b) =>
      dir * (a.c.sortValue - b.c.sortValue) ||
      (b.c.tie ?? 0) - (a.c.tie ?? 0) ||
      a.name.localeCompare(b.name, 'en') ||
      (a.c.d.athlete.id < b.c.d.athlete.id ? -1 : a.c.d.athlete.id > b.c.d.athlete.id ? 1 : 0),
  );
  const rows: BoardRow[] = [];
  named.forEach(({ c, name }, i) => {
    const prev = rows[i - 1];
    const rank = prev && named[i - 1].c.sortValue === c.sortValue ? prev.rank : i + 1;
    const row: BoardRow = { rank, athleteId: c.d.athlete.id, name, yearGroup: c.d.athlete.yearGroup, value: c.value, sortValue: c.sortValue };
    if (c.detail) row.detail = c.detail;
    if (c.provisional) row.provisional = true;
    rows.push(row);
  });
  return rows;
}

/** A stat's number, or undefined when locked: the only way boards read a stat. */
function shown(s: StatValue): number | undefined {
  return s.locked ? undefined : s.value;
}

function cut(groups: BoardGroup[], absolute: boolean, config: Config, full: boolean | undefined): { groups: BoardGroup[]; truncated: boolean } {
  if (!absolute || full) return { groups, truncated: false };
  const n = config.boards.topN;
  let truncated = false;
  const out = groups.map((g) => {
    if (g.rows.length <= n) return g;
    truncated = true;
    return { ...g, rows: g.rows.slice(0, n) };
  });
  return { groups: out, truncated };
}

function people(derived: Derived, absolute: boolean): AthleteDerived[] {
  return [...derived.athletes.values()].filter((d) => eligible(d, absolute));
}

/** RACE board: everyone with an unlocked RACE rating, highest first. */
function raceBoard(derived: Derived): BoardGroup[] {
  const cands = people(derived, true).flatMap((d): Candidate[] => {
    const v = shown(d.ratings.race);
    if (v == null) return [];
    const caps = d.ratings.race.caps;
    const detail = [`★ ${caps}`, d.ratings.race.bestRaceLine].filter(Boolean).join(' · ');
    return [{ d, value: String(v), sortValue: v, detail, provisional: d.ratings.race.provisional, tie: caps }];
  });
  return [{ title: 'All runners', rows: rankRows(cands, true) }];
}

/** The circuit course the SPD board shows: opts.courseId, else the circuit course with most counted runs. */
export function defaultCircuitCourseId(derived: Derived, courseId?: string): string | undefined {
  if (courseId) return courseId;
  const counts = new Map<string, number>();
  for (const d of derived.athletes.values()) {
    for (const p of d.perfs) {
      const ct = courseTimeOf(p, derived.lookup);
      if (ct && ct.course.kind === 'circuit') counts.set(ct.course.id, (counts.get(ct.course.id) ?? 0) + 1);
    }
  }
  const circuits = [...derived.lookup.courses.values()].filter((c) => c.kind === 'circuit');
  circuits.sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return circuits[0]?.id;
}

/**
 * Best raw time on a course among results that still count today (on or before asOf and no older than
 * config.freshness.expireMonths), with the performance behind it.
 */
function bestCurrentTime(d: AthleteDerived, courseId: string, derived: Derived): { timeSec: number; date: string } | undefined {
  let best: { timeSec: number; date: string } | undefined;
  for (const p of d.perfs) {
    if (p.date > derived.asOf || monthsBetween(p.date, derived.asOf) > derived.config.freshness.expireMonths) continue;
    const ct = courseTimeOf(p, derived.lookup);
    if (!ct || ct.course.id !== courseId) continue;
    if (!best || ct.timeSec < best.timeSec) best = { timeSec: ct.timeSec, date: p.date };
  }
  return best;
}

/** SPD board: raw best Circuit time, grouped by sex and current year band. */
function spdBoard(derived: Derived, courseId: string | undefined): BoardGroup[] {
  if (!courseId) return [];
  const byGroup = new Map<string, Candidate[]>();
  for (const d of people(derived, true)) {
    const best = bestCurrentTime(d, courseId, derived);
    if (!best) continue;
    const spd = shown(d.ratings.stats.SPD);
    const detail = [formatShortDate(best.date), spd != null ? `SPD ${spd}` : undefined].filter(Boolean).join(' · ');
    const key = `${d.athlete.sex}|${yearBand(d.athlete.yearGroup)}`;
    const list = byGroup.get(key) ?? [];
    list.push({ d, value: formatTime(best.timeSec), sortValue: best.timeSec, detail });
    byGroup.set(key, list);
  }
  const groups: BoardGroup[] = [];
  for (const band of YEAR_BANDS) {
    for (const sex of SEXES) {
      const cands = byGroup.get(`${sex}|${band}`);
      if (cands?.length) groups.push({ title: sexBandTitle(sex, band), rows: rankRows(cands, false) });
    }
  }
  return groups;
}

/** Records board: one group per course, one row per sex × year band record (raw, all-time). */
function recordsBoard(derived: Derived, courseId: string | undefined): BoardGroup[] {
  const byCourse = new Map<string, CourseRecord[]>();
  for (const r of derived.courseRecords) {
    if (courseId && r.courseId !== courseId) continue;
    byCourse.set(r.courseId, [...(byCourse.get(r.courseId) ?? []), r]);
  }
  const courses = [...byCourse.keys()]
    .map((id) => ({ id, name: derived.lookup.courses.get(id)?.name ?? 'Course' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en') || (a.id < b.id ? -1 : 1));
  return courses.map(({ id, name }) => {
    const recs = (byCourse.get(id) ?? []).slice().sort((a, b) => YEAR_BANDS.indexOf(a.band) - YEAR_BANDS.indexOf(b.band) || SEXES.indexOf(a.sex) - SEXES.indexOf(b.sex));
    const rows: BoardRow[] = recs.flatMap((r): BoardRow[] => {
      const holder = derived.athletes.get(r.athleteId)?.athlete;
      if (!holder) return [];
      const name = holder.absoluteBoardOptOut ? PRIVATE_RECORD_HOLDER : displayName(holder);
      return [
        {
          rank: 1,
          athleteId: r.athleteId,
          name,
          yearGroup: r.yearGroupAtTime,
          value: formatTime(r.timeSec),
          sortValue: r.timeSec,
          detail: `${sexBandTitle(r.sex, r.band)} · ${formatLongDate(r.date)}`,
        },
      ];
    });
    return { title: name, rows };
  });
}

function bestBleepLaps(d: AthleteDerived, derived: Derived): number | undefined {
  let best: number | undefined;
  for (const p of d.perfs) {
    if (p.kind !== 'bleep' || p.deleted || !p.verified || p.date > derived.asOf) continue;
    if (monthsBetween(p.date, derived.asOf) > derived.config.freshness.expireMonths) continue;
    const laps = p.bleepLaps;
    if (laps != null && Number.isFinite(laps) && laps > 0 && (best == null || laps > best)) best = laps;
  }
  return best;
}

/** END board: END rating (highest first), with the best current bleep laps. */
function endBoard(derived: Derived): BoardGroup[] {
  const cands = people(derived, true).flatMap((d): Candidate[] => {
    const end = d.ratings.stats.END;
    const v = shown(end);
    if (v == null) return [];
    const laps = bestBleepLaps(d, derived);
    const detail = [laps != null ? `${laps} laps` : undefined, end.basis?.label].filter(Boolean).join(' · ');
    return [{ d, value: String(v), sortValue: v, detail, provisional: end.provisional, tie: laps ?? 0 }];
  });
  return [{ title: 'All runners', rows: rankRows(cands, true) }];
}

/** Caps board: verified race and relay-leg caps, most first. */
function capsBoard(derived: Derived): BoardGroup[] {
  const cands = people(derived, true).flatMap((d): Candidate[] => {
    const caps = d.ratings.race.caps;
    if (caps < 1) return [];
    const race = shown(d.ratings.race);
    return [{ d, value: `★ ${caps}`, sortValue: caps, detail: race != null ? `RACE ${race}` : undefined }];
  });
  return [{ title: 'All runners', rows: rankRows(cands, true) }];
}

/**
 * Relative improvement of an In-Form entry in percent, so PBs on different courses and tests compare
 * fairly: raw time PB = seconds faster / previous best; raw count PB = extra / previous best;
 * score PB = points gained / previous score. Example: 5:33 → 5:23 is 10 / 333 = 3.0%.
 */
export function inFormPct(d: AthleteDerived, e: InFormEntry): number {
  if (e.improvement == null || !(e.improvement > 0)) return 0;
  if (e.type === 'raw') {
    const pb = d.pbHistory.find((p) => p.perfId === e.perfId && p.label === e.label && p.previousBest != null);
    return pb?.previousBest ? (e.improvement / pb.previousBest) * 100 : 0;
  }
  const score = d.ratings.perfScores.find((s) => s.perfId === e.perfId)?.score;
  const before = score != null ? score - e.improvement : 0;
  return before > 0 ? (e.improvement / before) * 100 : 0;
}

/**
 * In-Form board: every active athlete with a PB this week, largest relative improvement first. A raw PB
 * is shown in preference to a score PB ('PB −12 s', '+3 laps', else 'SPD 71 → 74').
 */
function inFormBoard(derived: Derived): BoardGroup[] {
  const cands = people(derived, false).flatMap((d): Candidate[] => {
    if (d.inForm.length === 0) return [];
    const raw = d.inForm.filter((e) => e.type === 'raw');
    const pool = raw.length ? raw : d.inForm;
    const scored = pool.map((e) => ({ e, pct: inFormPct(d, e) })).sort((a, b) => b.pct - a.pct || (a.e.date < b.e.date ? 1 : a.e.date > b.e.date ? -1 : 0));
    const { e, pct } = scored[0];
    const more = d.inForm.length - 1;
    const detail = [e.label, pct > 0 ? `${pct.toFixed(1)}% better` : undefined, formatShortDate(e.date), more > 0 ? `+${more} more` : undefined].filter(Boolean).join(' · ');
    return [{ d, value: e.text, sortValue: Math.round(pct * 100) / 100, detail, tie: dayNumber(e.date) }];
  });
  return [{ title: 'This week', rows: rankRows(cands, true) }];
}

/** Streak board: every active athlete on streakMin+ weeks, longest first (ties: best streak). */
function streakBoard(derived: Derived): BoardGroup[] {
  const min = streakBoardMin(derived.config);
  const cands = people(derived, false).flatMap((d): Candidate[] => {
    const s = d.streak;
    if (s.currentStreak < min) return [];
    const bits = [`best ${s.bestStreak}`];
    if (s.status === 'frozen') bits.push('frozen');
    if (s.holidayBonusFlames > 0) bits.push(`${s.holidayBonusFlames} holiday flame${s.holidayBonusFlames === 1 ? '' : 's'}`);
    return [{ d, value: `${s.currentStreak} weeks`, sortValue: s.currentStreak, detail: bits.join(' · '), tie: s.bestStreak }];
  });
  return [{ title: `${min}+ weeks`, rows: rankRows(cands, true) }];
}

/** Relay events with Surge results (any counted leg), newest first. */
function surgeEvents(derived: Derived, events: Iterable<TasukiEvent>): TasukiEvent[] {
  const withLegs = new Set(derived.surges.filter((s) => derived.athletes.has(s.athleteId)).map((s) => s.eventId));
  return [...events]
    .filter((e) => withLegs.has(e.id))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.name.localeCompare(b.name, 'en') || (a.id < b.id ? -1 : 1)));
}

/** Relay events with Surge results, newest first (for the Surge board's event picker). */
export function boardEvents(derived: Derived, snapshot: DataSnapshot): TasukiEvent[] {
  return surgeEvents(derived, snapshot.events);
}

function legDetail(s: SurgeResult): string {
  return [s.medal ? titleCase(s.medal) : undefined, s.legNumber != null ? `Leg ${s.legNumber}` : undefined, s.teamName, formatTime(s.legTimeSec)].filter(Boolean).join(' · ');
}

/**
 * Surge board for one relay: legs with a baseline sorted by Surge % (medals in the detail); legs with no
 * baseline listed after, with the leg time only (no surge).
 */
function surgeBoard(derived: Derived, eventId: string | undefined): { groups: BoardGroup[]; event?: TasukiEvent } {
  const event = eventId ? derived.lookup.events.get(eventId) : surgeEvents(derived, derived.lookup.events.values())[0];
  if (!event) return { groups: [] };
  const legs = derived.surges.filter((s) => s.eventId === event.id);
  const withPct: Candidate[] = [];
  const noBase: Candidate[] = [];
  for (const s of legs) {
    const d = derived.athletes.get(s.athleteId);
    if (!d || !eligible(d, false)) continue;
    if (s.pct != null && !s.noBaseline) withPct.push({ d, value: formatPct(s.pct), sortValue: s.pct, detail: legDetail(s) });
    else noBase.push({ d, value: formatTime(s.legTimeSec), sortValue: s.legNumber ?? 0, detail: [s.legNumber != null ? `Leg ${s.legNumber}` : undefined, s.teamName, 'no baseline yet'].filter(Boolean).join(' · ') });
  }
  const groups: BoardGroup[] = [];
  if (withPct.length) groups.push({ title: 'Tasuki Surge', rows: rankRows(withPct, true) });
  // Different legs are different distances, so these are listed by leg number, not ranked by time.
  if (noBase.length) groups.push({ title: 'Leg times (no baseline)', rows: rankRows(noBase, false) });
  return { groups, event };
}

/** Build one board from derived data. */
export function buildBoard(id: BoardId, derived: Derived, opts: BoardOptions = {}): Board {
  const absolute = ABSOLUTE[id];
  const top = `Top ${derived.config.boards.topN}`;
  let title: string;
  let subtitle: string | undefined;
  let groups: BoardGroup[];
  switch (id) {
    case 'race':
      title = 'RACE rating';
      subtitle = 'Age-graded race rating from the best three recent races';
      groups = raceBoard(derived);
      break;
    case 'spd': {
      const courseId = defaultCircuitCourseId(derived, opts.courseId);
      const course = courseId ? derived.lookup.courses.get(courseId) : undefined;
      title = 'SPD · Circuit times';
      subtitle = course ? `${course.name} ${formatKm(course.distanceKm)}: best time in the last ${derived.config.freshness.expireMonths} months` : 'No circuit course yet';
      groups = spdBoard(derived, courseId);
      break;
    }
    case 'records':
      title = 'Course records';
      subtitle = 'Fastest time on each course by sex and year band';
      groups = recordsBoard(derived, opts.courseId);
      break;
    case 'end':
      title = 'END · Endurance';
      subtitle = 'END rating and best bleep test laps';
      groups = endBoard(derived);
      break;
    case 'inform':
      title = 'In-Form this week';
      subtitle = `Everyone with a PB in the last ${derived.config.inForm.days} days`;
      groups = inFormBoard(derived);
      break;
    case 'streak':
      title = 'Streaks';
      subtitle = `Everyone on ${streakBoardMin(derived.config)}+ weeks`;
      groups = streakBoard(derived);
      break;
    case 'surge': {
      const r = surgeBoard(derived, opts.eventId);
      title = 'Tasuki Surge';
      subtitle = r.event ? `${r.event.name} · ${formatLongDate(r.event.date)}` : 'No relay results yet';
      groups = r.groups;
      break;
    }
    case 'caps':
      title = 'Race caps ★';
      subtitle = 'Verified races and relay legs';
      groups = capsBoard(derived);
      break;
  }
  const c = cut(groups, absolute, derived.config, opts.full);
  if (c.truncated) subtitle = subtitle ? `${subtitle} · ${top}` : top;
  return { id, title, subtitle, absolute, groups: c.groups, truncated: c.truncated };
}

/** Athletes left off absolute boards (opted out or inactive): for the coach view's footnote. */
export function hiddenFromAbsoluteBoards(derived: Derived): Athlete[] {
  return [...derived.athletes.values()].filter((d) => !eligible(d, true)).map((d) => d.athlete);
}
