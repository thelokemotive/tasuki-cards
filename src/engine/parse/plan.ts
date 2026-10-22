// Paste-and-Match (spec 4.2): parse → match names → review rows with warnings → (coach approves) →
// one change set. Nothing here writes anything: planToChanges only describes what approval would do.
import type { Athlete, CategoryWinner, Course, DataSnapshot, EventKind, ISODate, Participation, Performance, PerfKind, PerfSource, TasukiEvent } from '../../types';
import type { Config } from '../config';
import type { Changes } from '../../store/changes';
import { isoWeek } from '../dates';
import { matchName, normaliseName, withLearnedAlias, type NameMatch } from '../names';
import { effectiveDistance } from '../perf';
import { paceWarning } from '../time';
import { makePerformance } from '../corrections';
import { looksLikeLineFormat, parseLineFormat } from './lineFormat';
import { detectLayout, parseTable } from './table';
import { normaliseSeparators } from './split';
import type { ParseFormat, RawParse, RawRow, RawSection, SectionDefaults } from './types';

export type RowStatus = 'ready' | 'review' | 'skip' | 'outsider';

export interface PlanSection extends RawSection {
  /** Existing event results will be added to (else a new event is created on approval). */
  eventId?: string;
  courseId?: string;
  /** Distance/climb the results will be scored with (header, else course, else existing event). */
  resolvedDistanceKm?: number;
  resolvedClimbM?: number;
  eventKind: EventKind;
}

export interface PlanRow {
  id: string;
  raw: RawRow;
  sectionKey: string;
  kind: PerfKind | 'participation';
  match: NameMatch;
  /** Proposed athlete (confident match, or the top fuzzy suggestion awaiting confirmation). */
  athleteId?: string;
  status: RowStatus;
  warnings: string[];
  duplicateOfPerfId?: string;
  dEff?: number;
}

export interface ImportPlan {
  format: ParseFormat;
  source: PerfSource;
  sections: PlanSection[];
  rows: PlanRow[];
  warnings: string[];
}

export interface PlanContext {
  snapshot: DataSnapshot;
  config: Config;
  today: ISODate;
  source?: 'paste' | 'voice';
  /** The event picked or described in the UI (used for text without # headers). */
  defaults?: SectionDefaults & { eventId?: string };
  format?: 'auto' | ParseFormat;
}

export const MATCH_LABEL: Record<NameMatch['type'], string> = {
  exact_alias: 'exact alias',
  normalised: 'normalised',
  initials: 'initials',
  fuzzy: 'fuzzy suggestion',
  ambiguous: 'two athletes matched',
  unmatched: 'unmatched',
  outsider: 'outsider',
};

const EVENT_KIND: Record<PerfKind, EventKind> = {
  race: 'race',
  relay_leg: 'relay',
  parkrun: 'parkrun',
  long_run: 'session',
  circuit: 'time_trial',
  climb: 'time_trial',
  descent: 'time_trial',
  nav: 'test',
  bleep: 'test',
  arm: 'test',
};

const COURSE_KINDS: PerfKind[] = ['circuit', 'climb', 'descent', 'nav'];
const TIMED: PerfKind[] = ['race', 'relay_leg', 'parkrun', 'long_run', 'circuit', 'climb', 'descent', 'nav'];

const sameName = (a: string, b: string) => normaliseName(a) === normaliseName(b);

function findCourse(courses: Course[], name: string | undefined, kind?: PerfKind): Course | undefined {
  if (!name) return undefined;
  const exact = courses.find((c) => sameName(c.name, name));
  if (exact) return exact;
  if (kind) {
    const n = normaliseName(name);
    return courses.find((c) => c.kind === (kind === 'nav' ? 'nav' : kind) && (n.includes(normaliseName(c.name)) || normaliseName(c.name).includes(n)));
  }
  return undefined;
}

function resolveSection(s: RawSection, ctx: PlanContext): PlanSection {
  const { snapshot, config } = ctx;
  const kind = s.perfKind ?? 'race';
  const implicit = s.line === 0;
  let event: TasukiEvent | undefined;
  if (implicit && ctx.defaults?.eventId) event = snapshot.events.find((e) => e.id === ctx.defaults!.eventId);
  if (!event && s.name) event = snapshot.events.find((e) => e.date === s.date && sameName(e.name, s.name));
  let course = findCourse(snapshot.courses, s.courseName, kind);
  if (!course && COURSE_KINDS.includes(kind)) course = findCourse(snapshot.courses, s.name, kind);
  if (!course && event?.courseId) course = snapshot.courses.find((c) => c.id === event!.courseId);
  if (!course && kind === 'circuit') {
    const circuits = snapshot.courses.filter((c) => c.kind === 'circuit');
    if (circuits.length === 1) course = circuits[0];
  }
  const warnings = [...s.warnings];
  if (s.courseName && !course) warnings.push(`No course called “${s.courseName}” (add it in Settings → Courses)`);
  if (COURSE_KINDS.includes(kind) && !course) warnings.push(`No ${kind} course found for “${s.name}”; results will be scored from the distance given`);
  let dist = s.distanceKm ?? course?.distanceKm ?? event?.distanceKm;
  if (dist == null && kind === 'parkrun') dist = config.input.parkrunDefaultKm;
  if (dist == null && TIMED.includes(kind) && s.type !== 'participation') warnings.push('No distance: add “<n> km” to the header (or pick a course) so the results can be scored');
  return {
    ...s,
    warnings,
    eventId: event?.id,
    courseId: course?.id ?? event?.courseId,
    resolvedDistanceKm: dist,
    resolvedClimbM: s.climbM ?? course?.climbM ?? event?.climbM ?? 0,
    eventKind: event?.kind ?? EVENT_KIND[kind],
  };
}

export function parseText(text: string, ctx: PlanContext): RawParse {
  const opts = { today: ctx.today, config: ctx.config, source: ctx.source, defaults: ctx.defaults };
  const fmt = ctx.format && ctx.format !== 'auto' ? ctx.format : looksLikeLineFormat(text) ? 'line' : 'table';
  if (fmt === 'line') return parseLineFormat(text, opts);
  // Headerless lines of "Name time" are best read as line format with the chosen event.
  const lines = text.split(/\r?\n/).map(normaliseSeparators).filter((l) => l.trim());
  const layout = detectLayout(lines);
  if (layout.headerRow == null && layout.delimiter === 'none' && ctx.format !== 'table') {
    const lf = parseLineFormat(text, opts);
    if (lf.rows.some((r) => r.timeSec != null || r.laps != null || r.arm)) return lf;
  }
  return parseTable(text, { ...opts, layout, source: ctx.source === 'voice' ? 'voice' : undefined });
}

/** Warnings that depend on which athlete a row is assigned to (recomputed when the coach changes it). */
export function evaluateRow(row: PlanRow, athleteId: string | undefined, plan: Pick<ImportPlan, 'rows' | 'sections'>, snapshot: DataSnapshot): { warnings: string[]; duplicateOfPerfId?: string } {
  const warnings: string[] = [];
  if (!athleteId) return { warnings };
  const sec = plan.sections.find((s) => s.key === row.sectionKey)!;
  const date = sec.date!;
  if (row.kind === 'participation') {
    if (snapshot.participation.some((p) => p.athleteId === athleteId && p.isoWeek === isoWeek(date) && p.type === sec.participationType)) warnings.push('already recorded for this week');
  } else {
    const dup = snapshot.performances.find(
      (p) =>
        !p.deleted &&
        p.athleteId === athleteId &&
        p.date === date &&
        p.kind === row.kind &&
        (row.raw.timeSec != null ? p.timeSec != null && Math.abs(p.timeSec - row.raw.timeSec) < 1 : row.raw.laps != null ? p.bleepLaps === row.raw.laps : true),
    );
    if (dup) return { warnings: ['duplicate of an existing result'], duplicateOfPerfId: dup.id };
  }
  const earlier = plan.rows.find((r) => r !== row && r.sectionKey === row.sectionKey && r.athleteId === athleteId && plan.rows.indexOf(r) < plan.rows.indexOf(row) && r.status !== 'skip' && r.status !== 'outsider');
  if (earlier) {
    const sameResult = earlier.raw.timeSec === row.raw.timeSec && earlier.raw.laps === row.raw.laps;
    warnings.push(sameResult ? 'duplicate row' : `same athlete as line ${earlier.raw.line}`);
  }
  return { warnings };
}

export function buildImportPlan(text: string, ctx: PlanContext): ImportPlan {
  const parsed = parseText(text, ctx);
  const sections = parsed.sections.map((s) => resolveSection(s, ctx));
  const byKey = new Map(sections.map((s) => [s.key, s]));
  const roster = ctx.snapshot.athletes;
  const outsiders = parsed.format === 'table';
  const plan: ImportPlan = { format: parsed.format, source: parsed.format === 'forms' ? 'form' : ctx.source ?? 'paste', sections, rows: [], warnings: parsed.warnings };

  parsed.rows.forEach((raw, i) => {
    const sec = byKey.get(raw.sectionKey)!;
    const kind: PlanRow['kind'] = sec.type === 'participation' ? 'participation' : sec.perfKind ?? 'race';
    const match = raw.name ? matchName(raw.name, roster, ctx.config, { outsiders }) : { input: '', type: 'unmatched' as const, candidates: [], warnings: [] };
    const row: PlanRow = { id: `r${raw.line}-${i}`, raw, sectionKey: sec.key, kind, match, status: 'review', warnings: [...raw.errors, ...raw.warnings, ...match.warnings] };
    if (match.athleteId) {
      row.athleteId = match.athleteId;
      row.status = 'ready';
    } else if (match.type === 'fuzzy') {
      row.athleteId = match.candidates[0]?.athleteId;
      row.status = 'review';
    } else if (match.type === 'outsider') row.status = 'outsider';
    else if (match.type === 'ambiguous') {
      row.status = 'review';
      if (!row.warnings.some((w) => /athletes matched/.test(w))) row.warnings.push('two athletes matched');
    } else row.status = 'review';
    if (raw.errors.length) row.status = match.type === 'outsider' ? 'outsider' : 'skip';
    if (kind !== 'participation' && TIMED.includes(kind) && raw.timeSec != null) {
      const dist = raw.distanceKm ?? sec.resolvedDistanceKm;
      if (dist) {
        row.dEff = effectiveDistance(dist, raw.distanceKm != null ? 0 : sec.resolvedClimbM ?? 0, 1);
        const pw = paceWarning(raw.timeSec, row.dEff, ctx.config);
        if (pw && row.status !== 'outsider') {
          row.warnings.push(pw);
          if (row.status === 'ready') row.status = 'review';
        }
      }
    }
    if (raw.unverified || parsed.format === 'forms') row.warnings.push('student-reported: saved as unverified');
    plan.rows.push(row);
  });

  for (const row of plan.rows) {
    if (row.status === 'outsider' || row.status === 'skip') continue;
    const ev = evaluateRow(row, row.athleteId, plan, ctx.snapshot);
    if (ev.warnings.length) {
      row.warnings.push(...ev.warnings);
      row.duplicateOfPerfId = ev.duplicateOfPerfId;
      if (ev.duplicateOfPerfId || ev.warnings.includes('duplicate row') || ev.warnings.includes('already recorded for this week')) row.status = 'skip';
      else if (row.status === 'ready') row.status = 'review';
    }
  }
  return plan;
}

export interface RowDecision {
  status: RowStatus;
  athleteId?: string;
}

export interface CommitSummary {
  performances: number;
  participation: number;
  newEvents: number;
  aliasesLearned: number;
  outsiders: number;
  notCommitted: number;
}

export interface CommitContext {
  now: string;
  by: string;
  newId: (prefix: string) => string;
}

/** The decision for a row: the coach's override, else the plan's proposal. */
export function decisionFor(row: PlanRow, decisions: Record<string, RowDecision>): RowDecision {
  return decisions[row.id] ?? { status: row.status, athleteId: row.athleteId };
}

/**
 * What approval would save. Only rows whose decision is 'ready' with an athlete are committed.
 * A row the coach matched by hand (fuzzy, ambiguous, unmatched or a different athlete) teaches the
 * athlete that spelling as a new alias.
 */
export function planToChanges(plan: ImportPlan, decisions: Record<string, RowDecision>, snapshot: DataSnapshot, ctx: CommitContext): { changes: Changes; summary: CommitSummary } {
  const summary: CommitSummary = { performances: 0, participation: 0, newEvents: 0, aliasesLearned: 0, outsiders: 0, notCommitted: 0 };
  const perfs: Performance[] = [];
  const parts: Participation[] = [];
  const events = new Map<string, TasukiEvent>();
  const athletes = new Map<string, Athlete>(snapshot.athletes.map((a) => [a.id, a]));
  const touched = new Set<string>();

  for (const sec of plan.sections) {
    const rows = plan.rows.filter((r) => r.sectionKey === sec.key);
    const ds = rows.map((r) => ({ r, d: decisionFor(r, decisions) }));
    const committed = ds.filter((x) => x.d.status === 'ready' && x.d.athleteId);
    summary.outsiders += ds.filter((x) => x.d.status === 'outsider').length;
    summary.notCommitted += ds.filter((x) => !(x.d.status === 'ready' && x.d.athleteId) && x.d.status !== 'outsider').length;
    if (!committed.length) continue;

    if (sec.type === 'participation') {
      for (const { d } of committed) {
        parts.push({ id: ctx.newId('part'), athleteId: d.athleteId!, isoWeek: isoWeek(sec.date!), type: sec.participationType ?? 'saturday_run', date: sec.date! });
      }
      summary.participation += committed.length;
    } else {
      // event: existing or new; outsiders count towards field size; category winners kept for reference
      const existing = sec.eventId ? snapshot.events.find((e) => e.id === sec.eventId) : undefined;
      const timed = rows.filter((r) => r.raw.timeSec != null);
      let fieldSize = sec.fieldSize ?? existing?.fieldSize;
      if (plan.format === 'table' && (sec.perfKind === 'race' || sec.perfKind === 'parkrun')) {
        const maxPlace = Math.max(0, ...rows.map((r) => r.raw.place ?? 0));
        fieldSize = sec.fieldSize ?? Math.max(rows.length, maxPlace, existing?.fieldSize ?? 0);
      }
      let categoryWinners: CategoryWinner[] | undefined = existing?.categoryWinners;
      if (plan.format === 'table' && timed.length) {
        const best = new Map<string, number>();
        for (const r of timed) {
          const cat = r.raw.category || 'Overall';
          best.set(cat, Math.min(best.get(cat) ?? Infinity, r.raw.timeSec!));
        }
        categoryWinners = [...best].map(([category, timeSec]) => ({ category, timeSec }));
      }
      const event: TasukiEvent = existing
        ? { ...existing, ...(fieldSize != null ? { fieldSize } : {}), ...(categoryWinners ? { categoryWinners } : {}) }
        : {
            id: ctx.newId('event'),
            name: sec.name || `${sec.perfKind} ${sec.date}`,
            date: sec.date!,
            kind: sec.eventKind,
            official: sec.official,
            ...(sec.courseId ? { courseId: sec.courseId } : {}),
            ...(sec.resolvedDistanceKm != null && !sec.courseId ? { distanceKm: sec.resolvedDistanceKm } : {}),
            ...(sec.courseId && sec.distanceKm != null ? { distanceKm: sec.distanceKm } : {}),
            ...(sec.resolvedClimbM && !sec.courseId ? { climbM: sec.resolvedClimbM } : {}),
            ...(fieldSize != null ? { fieldSize } : {}),
            ...(categoryWinners ? { categoryWinners } : {}),
          };
      if (!existing) summary.newEvents++;
      events.set(event.id, event);
      for (const { r, d } of committed) {
        const raw = r.raw;
        const perf = makePerformance(
          {
            athleteId: d.athleteId!,
            eventId: event.id,
            courseId: sec.courseId,
            date: sec.date!,
            kind: r.kind as PerfKind,
            distanceKm: raw.distanceKm,
            timeSec: raw.timeSec,
            place: raw.place,
            fieldSize: raw.fieldSize ?? (sec.perfKind === 'race' || sec.perfKind === 'parkrun' ? fieldSize : undefined),
            category: raw.category,
            legNumber: raw.legNumber,
            teamName: raw.teamName,
            racedEarlierSameDay: raw.racedEarlierSameDay,
            bleepLaps: raw.laps,
            arm: raw.arm,
            cleanRun: r.kind === 'descent' ? raw.cleanRun ?? true : raw.cleanRun,
            navErrors: raw.navErrors ?? (r.kind === 'nav' ? 0 : undefined),
            navVariant: raw.navVariant,
            routeKmEff: raw.routeKmEff ?? (r.kind === 'nav' ? sec.routeKmEff : undefined),
            source: plan.source,
            verified: plan.format === 'forms' || raw.unverified ? false : true,
            rawInput: raw.raw.trim(),
          },
          ctx.newId('perf'),
          ctx.now,
        );
        perfs.push(perf);
      }
      summary.performances += committed.length;
    }

    // alias learning: the coach confirmed a match the matcher was not sure about
    for (const { r, d } of committed) {
      const confident = r.match.athleteId != null && r.match.athleteId === d.athleteId;
      if (confident || !r.raw.name) continue;
      const a = athletes.get(d.athleteId!);
      if (!a) continue;
      const learned = withLearnedAlias(a, r.raw.name, [...athletes.values()]);
      if (learned) {
        athletes.set(a.id, learned);
        touched.add(a.id);
        summary.aliasesLearned++;
      }
    }
  }

  const changes: Changes = { put: {} };
  if (perfs.length) changes.put!.performances = perfs;
  if (parts.length) changes.put!.participation = parts;
  if (events.size) changes.put!.events = [...events.values()];
  if (touched.size) changes.put!.athletes = [...touched].map((id) => athletes.get(id)!);
  return { changes, summary };
}
