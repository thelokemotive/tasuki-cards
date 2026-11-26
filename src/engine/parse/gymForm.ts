// Holiday Microsoft Form CSV (spec §9b): one response per session. Columns are found by their question text
// (or by the coach's remembered mapping), names are matched with the usual matcher ("Family, Given" or
// "Given Family"; a confirmed respondent's email is learned as an alias), and the answers become the same
// GymImport as the paper sheet, so the review table and warnings are shared.
import type { Athlete, ISODate } from '../../types';
import type { Config } from '../config';
import { addDays, isISODate } from '../dates';
import { matchName, type NameMatch } from '../names';
import { snapMonday } from '../white';
import { gymEntry, type GymImport, type GymImportRow } from './gymLine';
import { detectDelimiter, joinQuotedLines, normaliseSeparators, splitLine } from './split';

export type FormField = 'id' | 'completed' | 'email' | 'name' | 'date' | 'card' | 'level' | 'hurt';
export const FORM_FIELDS: { field: FormField; label: string; required: boolean }[] = [
  { field: 'name', label: 'Name', required: true },
  { field: 'date', label: 'Date of session', required: true },
  { field: 'card', label: 'What did you do?', required: true },
  { field: 'level', label: 'Which level?', required: false },
  { field: 'hurt', label: 'Did anything hurt?', required: false },
  { field: 'email', label: 'Email', required: false },
  { field: 'id', label: 'ID', required: false },
  { field: 'completed', label: 'Completion time', required: false },
];

const GUESS: [FormField, RegExp][] = [
  ['id', /^id$/i],
  ['completed', /completion time|completed/i],
  ['email', /e-?mail|メール/i],
  ['hurt', /hurt|pain|痛/i],
  ['level', /level|tier|レベル/i],
  ['date', /date of session|^date|日付/i],
  ['card', /what did you do|which card|activity/i],
  ['name', /^name$|名前|full name/i],
];

/** The mapping: field → header text (as remembered in meta.gymFormMapping). */
export type FormMapping = Partial<Record<FormField, string>> & { dateOrder?: 'dmy' | 'mdy' };

export interface FormTable {
  header: string[];
  rows: { line: number; cells: string[]; raw: string }[];
}

export function readFormTable(text: string): FormTable {
  const physical = text.split(/\r?\n/).map(normaliseSeparators);
  const lines = joinQuotedLines(physical).filter((l) => l.trim());
  if (!lines.length) return { header: [], rows: [] };
  const delim = detectDelimiter(lines);
  return { header: splitLine(lines[0], delim).map((h) => h.trim()), rows: lines.slice(1).map((l, i) => ({ line: i + 2, cells: splitLine(l, delim).map((c) => c.trim()), raw: l })) };
}

/** A holiday Form export: its questions include the level or "did anything hurt", or the remembered headers. */
export function looksLikeGymForm(text: string, remembered?: FormMapping): boolean {
  const first = text.split(/\r?\n/).find((l) => l.trim()) ?? '';
  if (/did anything hurt|which level/i.test(first) && /what did you do/i.test(first)) return true;
  if (!remembered?.name || !remembered.card || !remembered.date) return false;
  return [remembered.name, remembered.card, remembered.date].every((h) => first.includes(h!));
}

/** Guess the mapping from the header, keeping remembered choices that still exist. */
export function guessMapping(header: string[], remembered: FormMapping = {}): FormMapping {
  const out: FormMapping = { dateOrder: remembered.dateOrder ?? 'dmy' };
  const used = new Set<string>();
  for (const { field } of FORM_FIELDS) {
    const r = remembered[field];
    if (r && header.includes(r)) {
      out[field] = r;
      used.add(r);
    }
  }
  for (const [field, re] of GUESS) {
    if (out[field]) continue;
    const h = header.find((x) => !used.has(x) && re.test(x) && !/^start time$/i.test(x));
    if (h) {
      out[field] = h;
      used.add(h);
    }
  }
  return out;
}

/** "1/2/2027", "2027-01-02", "02.01.2027 10:15", or an Excel serial date. */
export function formDate(s: string, order: 'dmy' | 'mdy' = 'dmy'): ISODate | undefined {
  const t = s.trim();
  let m: RegExpExecArray | null;
  const iso = (y: number, mo: number, d: number) => {
    const out = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return isISODate(out) ? out : undefined;
  };
  if ((m = /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/.exec(t))) return iso(+m[1], +m[2], +m[3]);
  if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(t))) {
    const a = +m[1];
    const b = +m[2];
    // A first number above 12 can only be the day, a second above 12 only the day.
    if (a > 12) return iso(+m[3], b, a);
    if (b > 12) return iso(+m[3], a, b);
    return order === 'mdy' ? iso(+m[3], a, b) : iso(+m[3], b, a);
  }
  if ((m = /^(\d{5})(\.\d+)?$/.exec(t))) return addDays('1899-12-30', +m[1]);
  return undefined;
}

/** "Family, Given" → "Given Family"; anything else as written. */
export function formName(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ');
  const m = /^([^,]+),\s*(.+)$/.exec(t);
  return m ? `${m[2]} ${m[1]}` : t;
}

/** The card for an answer: by card name (case and spacing ignored), else a single code letter. */
export function cardFromAnswer(answer: string, config: Config): string | undefined {
  const a = answer.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!a) return undefined;
  const cards = config.winter.cards;
  const exact = cards.find((c) => c.name.toLowerCase() === a);
  if (exact) return exact.code;
  // Longest name first, so "Holiday Express" is not read as "Express".
  const byLen = [...cards].sort((x, y) => y.name.length - x.name.length);
  const inc = byLen.find((c) => a.includes(c.name.toLowerCase().replace(/\s*\(.*\)$/, '')));
  if (inc) return inc.code;
  return cards.find((c) => c.code.toLowerCase() === a)?.code;
}

export function levelFromAnswer(answer: string, config: Config): number | undefined {
  const a = answer.trim().toLowerCase();
  if (!a) return undefined;
  const i = config.winter.tierNames.findIndex((t) => t.toLowerCase() === a || a.startsWith(t.toLowerCase()));
  if (i >= 0) return i + 1;
  const n = /^[123]$/.exec(a);
  return n ? Number(a) : undefined;
}

/** A respondent whose email is already a stored alias is matched confidently. */
function matchRespondent(name: string, email: string, roster: Athlete[], config: Config): NameMatch {
  const e = email.trim().toLowerCase();
  if (e) {
    const hits = roster.filter((a) => a.aliases.some((x) => x.trim().toLowerCase() === e));
    if (hits.length === 1) return { input: name || email, type: 'exact_alias', athleteId: hits[0].id, candidates: [{ athleteId: hits[0].id, score: 1, type: 'exact_alias', via: email }], warnings: [] };
  }
  const given = formName(name);
  const m = matchName(given, roster, config);
  if (m.athleteId || given === name.trim()) return m;
  const raw = matchName(name, roster, config);
  return raw.athleteId ? raw : m;
}

/** Parse a Form export with a mapping into a GymImport (one row per response). */
export function parseGymForm(text: string, mapping: FormMapping, roster: Athlete[], config: Config, today: ISODate): GymImport {
  const t = readFormTable(text);
  const out: GymImport = { format: 'form', source: 'form', rows: [], warnings: [] };
  const missing = FORM_FIELDS.filter((f) => f.required && !(mapping[f.field] && t.header.includes(mapping[f.field]!)));
  if (missing.length) {
    out.warnings.push(`Choose the column for: ${missing.map((f) => f.label).join(', ')}`);
    return out;
  }
  const col = (f: FormField) => (mapping[f] ? t.header.indexOf(mapping[f]!) : -1);
  const cell = (cells: string[], f: FormField) => (col(f) >= 0 ? (cells[col(f)] ?? '').trim() : '');
  for (const r of t.rows) {
    const name = cell(r.cells, 'name');
    const email = cell(r.cells, 'email');
    const id = cell(r.cells, 'id');
    const warnings: string[] = [];
    const date = formDate(cell(r.cells, 'date'), mapping.dateOrder) ?? formDate(cell(r.cells, 'completed'), mapping.dateOrder);
    if (!date) {
      out.warnings.push(`Line ${r.line}: no date of session (“${cell(r.cells, 'date')}”)`);
      continue;
    }
    if (date > today) warnings.push('date is in the future');
    const answer = cell(r.cells, 'card');
    const code = cardFromAnswer(answer, config);
    const level = levelFromAnswer(cell(r.cells, 'level'), config);
    const hurt = /^(y|yes|はい)/i.test(cell(r.cells, 'hurt'));
    const key = `F${id || r.line}`;
    const entry = code
      ? gymEntry(`${key}-0`, date, code, level != null ? String(level) : undefined, hurt, `${code}${level ?? ''}${hurt ? '!' : ''}`, config)
      : { key: `${key}-0`, date, code: answer || '?', hurt, problems: [`Unknown answer “${answer}”`], notes: [] };
    const row: GymImportRow = { key, line: r.line, action: 'gym', name: name || email, email: email || undefined, match: matchRespondent(name, email, roster, config), date: snapMonday(date), entries: [entry], rf: false, raw: r.raw, warnings };
    out.rows.push(row);
  }
  if (!out.rows.length && !out.warnings.length) out.warnings.push('No responses found.');
  return out;
}

/** Unmatched responses as radar entries (keyed so a re-import does not repeat them). */
export function unmatchedEntries(rows: GymImportRow[], at: string): { key: string; name: string; email?: string; date?: ISODate; card?: string; at: string }[] {
  return rows.map((r) => ({ key: `${r.key}|${r.name}|${r.entries[0]?.date ?? ''}`, name: r.name, email: r.email, date: r.entries[0]?.date, card: r.entries[0]?.card, at }));
}

