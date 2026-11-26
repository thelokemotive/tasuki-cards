// White Season imports (spec §9): the Gym Log sheet line format (9a), Summit passes and medical freezes (9c).
// The holiday Microsoft Form CSV (9b, ./gymForm.ts) produces the same GymImport, so both use one review
// table, one set of warnings and one commit. Nothing here writes: gymImportChanges only describes what
// approval would do.
//
//   # gym | 2027-01-11
//   Aiko Tanaka | Mon A2 | Thu E1!
//   Ben Carter | Tue S1 | Fri X2 | Sat A3
//   Chika Mori | RF
//   # summit | 2027-01-12
//   Aiko Tanaka, Ben Carter
//   # freeze: medical | 2027-01-18
//   Chika Mori
import type { Athlete, DataSnapshot, ISODate, Participation, Performance, PerfSource } from '../../types';
import type { Changes } from '../../store/changes';
import type { Config } from '../config';
import { addDays, isISODate, isoWeek, weekSunday } from '../dates';
import { matchName, withLearnedAlias, type NameMatch } from '../names';
import { isGymSession } from '../perf';
import { computeWhite, inWhiteSeason, snapMonday, whiteWeekKind, type FreezeKind } from '../white';
import { normaliseSeparators } from './split';

const HEADER = /^#\s*(gym|summit|freeze)\s*(?:[:：]\s*([a-z_ ]+?))?\s*(?:\|\s*(.*))?$/i;
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const DAY_RE = /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?$/i;
const CODE_RE = /^([a-z])([0-9])?(!)?$/i;

export type GymAction = 'gym' | 'summit' | 'freeze';

export interface GymImportEntry {
  key: string;
  date: ISODate;
  /** The code as written ("A2!"). */
  code: string;
  card?: string;
  tier?: 1 | 2 | 3;
  hurt: boolean;
  /** Problems that stop this entry importing (unknown code or day). */
  problems: string[];
  /** Notes that do not stop it (no level written, a level on a tierless card). */
  notes: string[];
}

export interface GymImportRow {
  key: string;
  line: number;
  action: GymAction;
  /** The name as written (or as the Form recorded it). */
  name: string;
  /** Holiday Form: the respondent's school email (stored as an alias once the coach confirms the match). */
  email?: string;
  match: NameMatch;
  /** Gym rows: the Monday of the week. Summit and freeze rows: the date in the header. */
  date: ISODate;
  entries: GymImportEntry[];
  /** "RF" on the line: a self recovery freeze for the week. */
  rf: boolean;
  freezeKind?: FreezeKind;
  /** The exact text this row came from. */
  raw: string;
  warnings: string[];
}

export interface GymImport {
  format: 'sheet' | 'form';
  source: PerfSource;
  rows: GymImportRow[];
  warnings: string[];
}

export function looksLikeGymFormat(text: string): boolean {
  return text.split(/\r?\n/).some((l) => HEADER.test(normaliseSeparators(l).trim()));
}

/** Parse one gym line's fields (after the name) into entries and the RF flag. */
function parseGymFields(text: string, monday: ISODate, config: Config, keyBase: string): { entries: GymImportEntry[]; rf: boolean; warnings: string[] } {
  const entries: GymImportEntry[] = [];
  const warnings: string[] = [];
  let rf = false;
  let day: number | undefined;
  const tokens = text
    .replace(/([a-z][0-9]?)\s+!/gi, '$1!')
    .split(/[\s|,;]+/)
    .filter(Boolean);
  for (const tok of tokens) {
    if (/^rf$/i.test(tok)) {
      rf = true;
      continue;
    }
    const dm = DAY_RE.exec(tok);
    if (dm && !(tok.length === 1)) {
      day = DAYS.indexOf(dm[1].toLowerCase() as (typeof DAYS)[number]);
      continue;
    }
    if (tok === '!') {
      if (entries.length) entries[entries.length - 1].hurt = true;
      continue;
    }
    const key = `${keyBase}-${entries.length}`;
    const cm = CODE_RE.exec(tok);
    if (day == null) {
      if (cm || /^[a-z]{3,}$/i.test(tok)) warnings.push(cm ? `“${tok}” has no day before it` : `Unknown day “${tok}”`);
      else warnings.push(`Not understood: “${tok}”`);
      continue;
    }
    const date = addDays(monday, day);
    if (!cm) {
      entries.push({ key, date, code: tok, hurt: tok.includes('!'), problems: [/^[a-z]{3,}/i.test(tok) ? `Unknown day “${tok}”` : `Unknown code “${tok}”`], notes: [] });
      continue;
    }
    entries.push(gymEntry(key, date, cm[1], cm[2], !!cm[3], tok, config));
  }
  return { entries, rf, warnings };
}

/** One entry from a card letter, a tier digit and the "!" flag, checked against the configured cards. */
export function gymEntry(key: string, date: ISODate, letter: string, digit: string | undefined, hurt: boolean, code: string, config: Config): GymImportEntry {
  const card = config.winter.cards.find((c) => c.code.toUpperCase() === letter.toUpperCase());
  const e: GymImportEntry = { key, date, code, hurt, problems: [], notes: [] };
  if (!card) {
    e.problems.push(`Unknown code “${code}”`);
    return e;
  }
  e.card = card.code;
  const tier = digit ? Number(digit) : undefined;
  if (card.tierless) {
    if (tier != null) e.notes.push(`${card.name} takes no level (“${digit}” ignored)`);
  } else if (tier == null) e.notes.push(`${code}: no level written`);
  else if (tier < 1 || tier > 3) e.problems.push(`Unknown level “${digit}” in “${code}”`);
  else e.tier = tier as 1 | 2 | 3;
  return e;
}

/** Parse a pasted block of gym, summit and freeze sections. Names are matched against `roster`. */
export function parseGymLines(text: string, roster: Athlete[], config: Config, today: ISODate): GymImport {
  const out: GymImport = { format: 'sheet', source: 'sheet', rows: [], warnings: [] };
  let sec: { action: GymAction; date: ISODate; freezeKind?: FreezeKind } | undefined;
  const lines = text.split(/\r?\n/);
  lines.forEach((rawLine, i) => {
    const lineNo = i + 1;
    const line = normaliseSeparators(rawLine).trim();
    if (!line) return;
    const h = HEADER.exec(line);
    if (h) {
      const action = h[1].toLowerCase() as GymAction;
      const fields = (h[3] ?? '').split('|').map((f) => f.trim()).filter(Boolean);
      let date = fields.find(isISODate);
      if (!date) {
        out.warnings.push(`Line ${lineNo}: no date in the header; using this week`);
        date = today;
      }
      let freezeKind: FreezeKind | undefined;
      if (action === 'freeze') {
        const k = (h[2] ?? 'medical').trim().toLowerCase().replace(/\s+/g, '_');
        freezeKind = k === 'coach' ? 'coach' : k === 'self_rf' || k === 'rf' ? 'self_rf' : 'medical';
        if (!['coach', 'medical', 'self_rf', 'rf'].includes(k)) out.warnings.push(`Line ${lineNo}: freeze kind “${h[2]}” not understood; using medical`);
      }
      if (action !== 'summit') {
        const mon = snapMonday(date);
        if (mon !== date) out.warnings.push(`Line ${lineNo}: ${date} is not a Monday; using the Monday of that week, ${mon}`);
        date = mon;
      }
      if (!inWhiteSeason(date, config.winter.season) && action !== 'summit') out.warnings.push(`Line ${lineNo}: ${date} is outside White Season`);
      sec = { action, date, freezeKind };
      return;
    }
    if (line.startsWith('#')) {
      out.warnings.push(`Line ${lineNo}: “${line}” is not a gym, summit or freeze header (paste results separately)`);
      sec = undefined;
      return;
    }
    if (!sec) {
      out.warnings.push(`Line ${lineNo}: no “# gym | date” header above “${line}”`);
      return;
    }
    if (sec.action === 'gym') {
      const bar = line.indexOf('|');
      let name: string;
      let rest: string;
      if (bar >= 0) {
        name = line.slice(0, bar).trim();
        rest = line.slice(bar + 1);
      } else {
        // No bars: the name runs until the first day token or RF.
        const words = line.split(/\s+/);
        const at = words.findIndex((w) => (DAY_RE.test(w) && w.length > 1) || /^rf$/i.test(w));
        name = (at < 0 ? words : words.slice(0, at)).join(' ');
        rest = at < 0 ? '' : words.slice(at).join(' ');
      }
      const key = `L${lineNo}`;
      const f = parseGymFields(rest, sec.date, config, key);
      const warnings = [...f.warnings];
      if (!f.entries.length && !f.rf) warnings.push('Nothing logged on this line');
      out.rows.push({ key, line: lineNo, action: 'gym', name, match: matchName(name, roster, config), date: sec.date, entries: f.entries, rf: f.rf, raw: rawLine.trim(), warnings });
    } else {
      line
        .split(/[,、;]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((name, j) => {
          out.rows.push({ key: `L${lineNo}-${j}`, line: lineNo, action: sec!.action, name, match: matchName(name, roster, config), date: sec!.date, entries: [], rf: false, freezeKind: sec!.freezeKind, raw: rawLine.trim(), warnings: [] });
        });
    }
  });
  if (!out.rows.length && !out.warnings.length) out.warnings.push('Nothing to import');
  return out;
}

// ---------------------------------------------------------------- review ----

export interface EntryEval {
  key: string;
  /** import: will be stored (credited or not); skip: not stored (already imported, or a problem). */
  action: 'import' | 'skip';
  credited: boolean;
  warnings: string[];
  /** "!" present: highlighted in amber. */
  amber: boolean;
}

export interface RowEval {
  rowKey: string;
  athleteId?: string;
  entries: EntryEval[];
  /** RF: import (a new self RF), skip (already stored). */
  rf?: { action: 'import' | 'skip'; warnings: string[] };
  /** Summit/freeze rows. */
  other?: { action: 'import' | 'skip'; warnings: string[] };
  warnings: string[];
}

export const GYM_WARN = {
  sameDate: 'same date twice: not credited',
  overCap: 'over the weekly cap: not credited',
  summit: 'Summit without a pass',
  hurt: '“!” something hurt',
  rfOver: 'RF over the half-term allowance: the week is evaluated as if there were no freeze',
  rfQualified: 'RF in a week that already qualifies: ignored (allowance not used)',
  outside: 'date outside White Season',
  already: 'already imported: skipped',
} as const;

const rfId = (athleteId: string, monday: ISODate) => `rf-${athleteId}-${isoWeek(monday)}`;
const freezeId = (athleteId: string, monday: ISODate, kind: FreezeKind) => (kind === 'self_rf' ? rfId(athleteId, monday) : `freeze-${kind}-${athleteId}-${isoWeek(monday)}`);
const gymPerfId = (athleteId: string, date: ISODate, card: string, n: number) => `gym-${athleteId}-${date}-${card}${n ? `-${n}` : ''}`;

/**
 * Warnings and credit for every row, given the athlete chosen for each (undefined = not importing). Rows for
 * the same athlete (several lines, or a sheet and the Form) are evaluated together with what is already stored,
 * by running the White Season engine on the result: the review shows exactly what approval would credit.
 */
export function evaluateGymImport(imp: GymImport, chosen: Record<string, string | undefined>, snapshot: DataSnapshot, config: Config): Map<string, RowEval> {
  const out = new Map<string, RowEval>();
  const season = config.winter.season;
  const byAthlete = new Map<string, GymImportRow[]>();
  for (const r of imp.rows) {
    const id = chosen[r.key];
    out.set(r.key, { rowKey: r.key, athleteId: id, entries: [], warnings: [] });
    if (id) byAthlete.set(id, [...(byAthlete.get(id) ?? []), r]);
  }
  for (const [athleteId, rows] of byAthlete) {
    const athlete = snapshot.athletes.find((a) => a.id === athleteId);
    if (!athlete) continue;
    const existing = snapshot.performances.filter((p) => p.athleteId === athleteId && isGymSession(p));
    const seen = new Set(existing.map((p) => `${p.date}|${p.gym!.card}`));
    const newPerfs: Performance[] = [];
    const entryPerf = new Map<string, string>();
    const parts = snapshot.participation.filter((q) => q.athleteId === athleteId);
    const newParts: Participation[] = [];
    // A Summit pass in this import counts from its date.
    const passDates = [athlete.summitPass?.date, ...rows.filter((r) => r.action === 'summit').map((r) => r.date)].filter((d): d is ISODate => !!d).sort();
    for (const r of rows) {
      const ev = out.get(r.key)!;
      ev.warnings.push(...r.warnings);
      if (r.action === 'summit') {
        ev.other = athlete.summitPass ? { action: 'skip', warnings: [`already holds a Summit pass (from ${athlete.summitPass.date})`] } : { action: 'import', warnings: [] };
        continue;
      }
      if (r.action === 'freeze') {
        const id = freezeId(athleteId, r.date, r.freezeKind ?? 'medical');
        const stored = parts.some((q) => q.id === id);
        ev.other = stored ? { action: 'skip', warnings: ['already imported: skipped'] } : { action: 'import', warnings: inWhiteSeason(r.date, season) ? [] : [GYM_WARN.outside] };
        if (!stored) newParts.push({ id, athleteId, isoWeek: isoWeek(r.date), type: 'freeze', date: r.date, freezeKind: r.freezeKind ?? 'medical' });
        continue;
      }
      for (const e of r.entries) {
        const warnings: string[] = [...e.problems, ...e.notes];
        if (e.hurt) warnings.push(GYM_WARN.hurt);
        if (!inWhiteSeason(e.date, season)) warnings.push(GYM_WARN.outside);
        if (e.problems.length || !e.card) {
          ev.entries.push({ key: e.key, action: 'skip', credited: false, warnings, amber: e.hurt });
          continue;
        }
        const k = `${e.date}|${e.card}`;
        if (seen.has(k)) {
          ev.entries.push({ key: e.key, action: 'skip', credited: false, warnings: [...warnings, GYM_WARN.already], amber: e.hurt });
          continue;
        }
        seen.add(k);
        if (e.tier === 3 && !passDates.some((d) => d <= e.date)) warnings.push(GYM_WARN.summit);
        const id = gymPerfId(athleteId, e.date, e.card, 0);
        entryPerf.set(e.key, id);
        newPerfs.push(gymPerformance(id, athleteId, e, r, imp.source, config, ''));
        ev.entries.push({ key: e.key, action: 'import', credited: false, warnings, amber: e.hurt });
      }
      if (r.rf) {
        const id = rfId(athleteId, r.date);
        const stored = parts.some((q) => q.id === id) || newParts.some((q) => q.id === id);
        ev.rf = { action: stored ? 'skip' : 'import', warnings: stored ? ['RF already imported: skipped'] : [] };
        if (!stored) newParts.push({ id, athleteId, isoWeek: isoWeek(r.date), type: 'freeze', date: r.date, freezeKind: 'self_rf' });
      }
    }
    // Run the engine on stored + new to learn what is credited and what each RF does.
    const lastSunday = rows.reduce((a, r) => (weekSunday(isoWeek(r.date)) > a ? weekSunday(isoWeek(r.date)) : a), season.start);
    const sim = computeWhite({ athlete, perfs: [...snapshot.performances.filter((p) => p.athleteId === athleteId), ...newPerfs], participation: [...parts, ...newParts], config, asOf: lastSunday });
    const simEntries = new Map(sim?.weeks.flatMap((w) => w.entries.map((e) => [e.perfId, e])) ?? []);
    for (const r of rows) {
      const ev = out.get(r.key)!;
      for (const ee of ev.entries) {
        const id = entryPerf.get(ee.key);
        const s = id ? simEntries.get(id) : undefined;
        if (!s) continue;
        ee.credited = s.credited;
        if (s.notCredited === 'same_date') ee.warnings.push(GYM_WARN.sameDate);
        if (s.notCredited === 'over_cap') ee.warnings.push(GYM_WARN.overCap);
      }
      if (r.rf && ev.rf) {
        const wk = sim?.weeks.find((w) => w.week === isoWeek(r.date));
        if (wk?.rf === 'over_allowance') ev.rf.warnings.push(GYM_WARN.rfOver);
        if (wk?.rf === 'ignored_qualified') ev.rf.warnings.push(GYM_WARN.rfQualified);
        if (!inWhiteSeason(r.date, season)) ev.rf.warnings.push(GYM_WARN.outside);
      }
    }
  }
  return out;
}

function gymPerformance(id: string, athleteId: string, e: GymImportEntry, r: GymImportRow, source: PerfSource, config: Config, now: string): Performance {
  const p: Performance = {
    id,
    athleteId,
    date: e.date,
    kind: 'gym_session',
    gym: { card: e.card!, ...(e.tier ? { tier: e.tier } : {}), hurt: e.hurt, holiday: whiteWeekKind(isoWeek(e.date), config.winter.season) === 'holiday' },
    // Gym sessions never feed a rating, so there is no verification step (DECISIONS: White Season).
    verified: true,
    source,
    rawInput: r.raw,
    history: [],
  };
  if (now) p.createdAt = now;
  return p;
}

export interface GymCommitSummary {
  sessions: number;
  credited: number;
  rfs: number;
  summitPasses: number;
  freezes: number;
  aliases: number;
  skipped: number;
}

/**
 * The change set approval makes: gym sessions, self RFs, Summit passes and coach/medical freezes for every row
 * with an athlete chosen. A name the coach picked by hand (or a fuzzy match confirmed) is learned as an alias,
 * and a Form email is stored as an alias. Re-importing the same block adds nothing.
 */
export function gymImportChanges(imp: GymImport, chosen: Record<string, string | undefined>, snapshot: DataSnapshot, config: Config, now: string): { changes: Changes; summary: GymCommitSummary } {
  const evals = evaluateGymImport(imp, chosen, snapshot, config);
  const perfs: Performance[] = [];
  const parts: Participation[] = [];
  const athletes = new Map<string, Athlete>();
  const summary: GymCommitSummary = { sessions: 0, credited: 0, rfs: 0, summitPasses: 0, freezes: 0, aliases: 0, skipped: 0 };
  const current = (id: string) => athletes.get(id) ?? snapshot.athletes.find((a) => a.id === id);
  for (const r of imp.rows) {
    const athleteId = chosen[r.key];
    const ev = evals.get(r.key);
    if (!athleteId || !ev) {
      summary.skipped += Math.max(1, r.entries.length);
      continue;
    }
    const a = current(athleteId);
    if (!a) continue;
    // Learn the spelling (and the Form email) once the coach has confirmed the match.
    if (r.match.athleteId !== athleteId) {
      const learned = withLearnedAlias(a, r.name, snapshot.athletes);
      if (learned) {
        athletes.set(athleteId, learned);
        summary.aliases++;
      }
    }
    if (r.email) {
      const cur = current(athleteId)!;
      if (!cur.aliases.some((x) => x.toLowerCase() === r.email!.toLowerCase())) {
        athletes.set(athleteId, { ...cur, aliases: [...cur.aliases, r.email] });
        summary.aliases++;
      }
    }
    if (r.action === 'summit') {
      if (ev.other?.action === 'import') {
        const cur = current(athleteId)!;
        if (!cur.summitPass) {
          athletes.set(athleteId, { ...cur, summitPass: { date: r.date } });
          summary.summitPasses++;
        }
      } else summary.skipped++;
      continue;
    }
    if (r.action === 'freeze') {
      if (ev.other?.action === 'import') {
        parts.push({ id: freezeId(athleteId, r.date, r.freezeKind ?? 'medical'), athleteId, isoWeek: isoWeek(r.date), type: 'freeze', date: r.date, freezeKind: r.freezeKind ?? 'medical' });
        summary.freezes++;
      } else summary.skipped++;
      continue;
    }
    r.entries.forEach((e) => {
      const ee = ev.entries.find((x) => x.key === e.key);
      if (!ee || ee.action !== 'import') {
        summary.skipped++;
        return;
      }
      perfs.push(gymPerformance(gymPerfId(athleteId, e.date, e.card!, 0), athleteId, e, r, imp.source, config, now));
      summary.sessions++;
      if (ee.credited) summary.credited++;
    });
    if (r.rf && ev.rf?.action === 'import' && !parts.some((q) => q.id === rfId(athleteId, r.date))) {
      parts.push({ id: rfId(athleteId, r.date), athleteId, isoWeek: isoWeek(r.date), type: 'freeze', date: r.date, freezeKind: 'self_rf' });
      summary.rfs++;
    }
  }
  const changes: Changes = { put: {} };
  if (perfs.length) changes.put!.performances = perfs;
  if (parts.length) changes.put!.participation = parts;
  if (athletes.size) changes.put!.athletes = [...athletes.values()];
  return { changes, summary };
}
