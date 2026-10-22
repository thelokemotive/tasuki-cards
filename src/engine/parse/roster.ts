// Roster import (spec 4.5): tab- or comma-separated rows with an interactive column mapping. Handles
// the school layout (Surname | Preferred Name | …) and simple lines
// "Surname, Preferred name, Year, Sex[, DOB][, alias; alias]". Duplicates are detected on name + year.
import type { Athlete, ISODate, Sex, YearGroup } from '../../types';
import type { Config } from '../config';
import { academicYearOf } from '../dates';
import { findDuplicateAthlete } from '../names';
import { detectDelimiter, normaliseSeparators, splitLine, type Delimiter } from './split';
import { parseDateCell } from './table';

export type RosterField = 'family' | 'preferred' | 'given' | 'fullName' | 'year' | 'sex' | 'dob' | 'aliases' | 'house' | 'notes' | 'ignore';

export const ROSTER_FIELD_LABELS: Record<RosterField, string> = {
  family: 'Surname',
  preferred: 'Preferred name',
  given: 'Given (legal) name',
  fullName: 'Full name',
  year: 'Year group',
  sex: 'Sex',
  dob: 'Date of birth',
  aliases: 'Aliases (; separated)',
  house: 'House',
  notes: 'Notes',
  ignore: '(ignore)',
};

const HEADERS: [RosterField, RegExp][] = [
  ['family', /^(surname|family\s*name|last\s*name|姓)$/i],
  ['preferred', /^(preferred(\s*(first\s*)?name)?|known\s*as|nickname|呼び名)$/i],
  ['given', /^(given\s*name|first\s*name|forename|legal\s*(first\s*)?name|名)$/i],
  ['fullName', /^(name|full\s*name|student(\s*name)?|氏名|名前)$/i],
  ['year', /^(year(\s*group)?|yr|yg|form|class|学年|grade)$/i],
  ['sex', /^(sex|gender|m\/f|性別)$/i],
  ['dob', /^(dob|d\.o\.b\.?|date\s*of\s*birth|birth\s*date|birthday|生年月日)$/i],
  ['aliases', /^(alias(es)?|other\s*names?|kanji|katakana|kana|japanese\s*name|ふりがな|フリガナ|カナ)$/i],
  ['house', /^(house|寮)$/i],
  ['notes', /^(notes?|comments?|備考)$/i],
];

export interface RosterLayout {
  delimiter: Delimiter;
  hasHeader: boolean;
  columns: RosterField[];
  headerCells: string[];
}

export interface RosterCandidate {
  line: number;
  raw: string;
  givenName: string;
  familyName: string;
  preferredName: string;
  yearGroup?: YearGroup;
  sex?: Sex;
  dob?: ISODate;
  aliases: string[];
  house?: string;
  notes?: string;
  errors: string[];
  warnings: string[];
  duplicateOf?: string;
}

export function parseYearGroup(s: string): YearGroup | undefined {
  const t = s.trim();
  if (/^(staff|teacher|coach|教員|先生)/i.test(t)) return 'Staff';
  const m = /^(?:y(?:ear)?|yr|grade|g)?\s*(\d{1,2})/i.exec(t.replace(/\s+/g, ' '));
  if (!m) return undefined;
  const n = Number(m[1]);
  return n >= 7 && n <= 13 ? (`Y${n}` as YearGroup) : undefined;
}

export function parseSex(s: string): Sex | undefined {
  const t = s.trim().toLowerCase();
  if (/^(m|male|boy|b|man|男|男子|男性)$/.test(t)) return 'M';
  if (/^(f|female|girl|g|woman|w|女|女子|女性)$/.test(t)) return 'F';
  return undefined;
}

/** Suggest a layout: header row if present, else the simple positional format. */
export function detectRosterLayout(text: string): RosterLayout {
  const lines = text.split(/\r?\n/).map(normaliseSeparators).filter((l) => l.trim());
  const delimiter = detectDelimiter(lines) === 'none' ? (lines.some((l) => l.includes(',')) ? 'comma' : 'tab') : detectDelimiter(lines);
  const first = lines.length ? splitLine(lines[0], delimiter) : [];
  const fromHeader = first.map((c) => HEADERS.find(([, re]) => re.test(c.trim().replace(/[:：*]$/, '')))?.[0] ?? 'ignore');
  if (fromHeader.filter((f) => f !== 'ignore').length >= 2) return { delimiter, hasHeader: true, columns: fromHeader, headerCells: first };
  const width = Math.max(0, ...lines.slice(0, 20).map((l) => splitLine(l, delimiter).length));
  const positional: RosterField[] = ['family', 'preferred', 'year', 'sex', 'dob', 'aliases'];
  const columns: RosterField[] = Array.from({ length: width }, (_, i) => positional[i] ?? 'ignore');
  // "Surname, Preferred, Year, Sex, alias; alias" (no DOB): a 5th column that is not a date is aliases
  if (width === 5) {
    const fifth = lines.slice(0, 20).map((l) => splitLine(l, delimiter)[4] ?? '');
    if (fifth.every((c) => !c || !parseDateCell(c))) columns[4] = 'aliases';
  }
  return { delimiter, hasHeader: false, columns, headerCells: [] };
}

export function parseRoster(text: string, layout: RosterLayout, ctx: { roster: Athlete[]; asOf: ISODate; config: Config }): RosterCandidate[] {
  const lines = text.split(/\r?\n/).map(normaliseSeparators);
  const out: RosterCandidate[] = [];
  let skippedHeader = !layout.hasHeader;
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    if (!skippedHeader) {
      skippedHeader = true;
      return;
    }
    const cells = splitLine(line, layout.delimiter);
    const c: RosterCandidate = { line: i + 1, raw: line, givenName: '', familyName: '', preferredName: '', aliases: [], errors: [], warnings: [] };
    layout.columns.forEach((field, j) => {
      const v = (cells[j] ?? '').trim();
      if (!v) return;
      switch (field) {
        case 'family':
          c.familyName = v;
          break;
        case 'preferred':
          c.preferredName = v;
          break;
        case 'given':
          c.givenName = v;
          break;
        case 'fullName': {
          // "Surname, Given" or "Given Surname"
          const comma = /^([^,]+),\s*(.+)$/.exec(v);
          const parts = comma ? [comma[2], comma[1]] : v.split(/\s+/);
          if (comma || parts.length >= 2) {
            c.givenName ||= comma ? parts[0] : parts.slice(0, -1).join(' ');
            c.familyName ||= comma ? parts[1] : parts.at(-1)!;
          } else c.givenName ||= v;
          break;
        }
        case 'year':
          c.yearGroup = parseYearGroup(v);
          if (!c.yearGroup) c.errors.push(`Year group not understood: “${v}”`);
          break;
        case 'sex':
          c.sex = parseSex(v);
          if (!c.sex) c.errors.push(`Sex not understood: “${v}” (use M or F)`);
          break;
        case 'dob':
          c.dob = parseDateCell(v);
          // simple lines "Surname, Preferred, Year, Sex, alias; alias" (no DOB) in a file where other rows have one
          if (!c.dob && !layout.hasHeader && !/\d/.test(v) && layout.columns[j + 1] === 'aliases' && !cells[j + 1]) {
            c.aliases.push(...v.split(/[;；、]/).map((x) => x.trim()).filter(Boolean));
            break;
          }
          if (!c.dob) c.warnings.push(`Date of birth not understood: “${v}” (use YYYY-MM-DD or DD/MM/YYYY); left blank`);
          break;
        case 'aliases':
          c.aliases.push(...v.split(/[;；、]/).map((x) => x.trim()).filter(Boolean));
          break;
        case 'house':
          c.house = v;
          break;
        case 'notes':
          c.notes = v;
          break;
      }
    });
    c.preferredName ||= c.givenName;
    c.givenName ||= c.preferredName;
    if (!c.familyName && !c.preferredName) c.errors.push('No name');
    if (!c.yearGroup && !c.errors.some((e) => e.startsWith('Year'))) c.errors.push('No year group');
    if (!c.sex && !c.errors.some((e) => e.startsWith('Sex'))) c.errors.push('No sex (M/F)');
    if (c.yearGroup && (c.familyName || c.preferredName)) {
      const dup = findDuplicateAthlete(
        { givenName: c.givenName, familyName: c.familyName, preferredName: c.preferredName, yearGroup: c.yearGroup, yearGroupYear: academicYearOf(ctx.asOf, ctx.config.age.academicYearStartMonth, ctx.config.age.academicYearStartDay) },
        ctx.roster,
        { asOf: ctx.asOf, config: ctx.config },
      );
      if (dup) c.duplicateOf = dup.id;
      const earlier = out.find((o) => o.yearGroup === c.yearGroup && o.familyName.toLowerCase() === c.familyName.toLowerCase() && o.preferredName.toLowerCase() === c.preferredName.toLowerCase());
      if (earlier) c.warnings.push(`Same as line ${earlier.line}`);
    }
    out.push(c);
  });
  return out;
}
