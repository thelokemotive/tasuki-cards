// Whole-school race workbooks (the Green Long Ducker): one sheet per house, each listing every pupil with
// their year group and finishing position. Positions are places within that pupil's race, and the races are
// split by boys/girls (the house says which) and by section: Y7–8, Y9–11, and Sixth Form when the workbook
// has a Sixth Form sheet (otherwise Y12–13 ran with the seniors, as in 2025). Where positions restart for
// each year group inside a section (several pupils sharing each place), each year is its own race.
// The result is one placings list per race, so every pupil counts towards the field and our runners get
// their place and "Compared with the school" (top %).
import type { SheetRead } from './xlsx';

/** Harrow Appi houses: boys' and girls' boarding houses. */
export const HOUSES: Record<string, 'M' | 'F'> = { churchill: 'M', masamune: 'M', nitobe: 'M', hearn: 'M', elizabeth: 'F', ogata: 'F', lyons: 'F' };

interface Entry {
  name: string;
  sex: 'M' | 'F';
  year: number;
  place: number;
  house: string;
}

export interface RaceGroup {
  label: string;
  finishers: number;
  /** True when places restart for each year group, so each year was scored on its own. */
  byYear: boolean;
}

export interface WholeSchoolRead {
  /** Tab-separated placings table (Event, Place, Name, Sex, Year, Category, Club). */
  text: string;
  groups: RaceGroup[];
  finishers: number;
  skipped: number;
}

const find = (header: string[], re: RegExp) => header.findIndex((h) => re.test(h.trim()));

function entriesOf(sheet: SheetRead, sex: 'M' | 'F'): { entries: Entry[]; skipped: number } {
  const hi = sheet.rows.findIndex((r) => r.some((c) => /^(yr|year)(\s*group)?$/i.test(c.trim())));
  if (hi < 0) return { entries: [], skipped: 0 };
  const h = sheet.rows[hi];
  const col = {
    year: find(h, /^(yr|year)(\s*group)?$/i),
    place: (() => {
      const exact = find(h, /^(score\s*\(position\)|position|place|finish)$/i);
      return exact >= 0 ? exact : find(h, /position|place|finish/i);
    })(),
    racing: find(h, /^racing/i),
    pref: find(h, /^preferred/i),
    full: find(h, /^full\s*name/i),
    first: find(h, /^(first|given)\s*name/i),
    last: find(h, /^(last|family)\s*name|^surname/i),
  };
  if (col.place < 0) return { entries: [], skipped: 0 };
  const entries: Entry[] = [];
  let skipped = 0;
  for (const r of sheet.rows.slice(hi + 1)) {
    const year = Number(r[col.year]);
    const full = col.full >= 0 ? r[col.full]?.trim() : '';
    const pref = col.pref >= 0 ? r[col.pref]?.trim() : '';
    let name = '';
    if (col.first >= 0 || col.last >= 0) name = [r[col.first] ?? '', r[col.last] ?? ''].map((x) => x.trim()).filter(Boolean).join(' ');
    else if (full && pref) name = `${pref} ${full.split(/\s+/).pop()}`;
    else name = full || pref;
    if (!name || !(year >= 7 && year <= 13)) continue;
    const place = Number(r[col.place]);
    if ((col.racing >= 0 && /^false$/i.test(r[col.racing] ?? '')) || !Number.isInteger(place) || place < 1) {
      skipped++;
      continue;
    }
    entries.push({ name, sex, year, place, house: sheet.sheetName.trim() });
  }
  return { entries, skipped };
}

export function looksLikeWholeSchool(sheets: SheetRead[]): boolean {
  return sheets.filter((s) => HOUSES[s.sheetName.trim().toLowerCase()]).length >= 3;
}

export function wholeSchoolToTable(sheets: SheetRead[], eventName: string): WholeSchoolRead | undefined {
  if (!looksLikeWholeSchool(sheets)) return undefined;
  const sixthSeparate = sheets.some((s) => /sixth/i.test(s.sheetName));
  const all: Entry[] = [];
  let skipped = 0;
  for (const s of sheets) {
    const sex = HOUSES[s.sheetName.trim().toLowerCase()];
    if (!sex) continue;
    const r = entriesOf(s, sex);
    all.push(...r.entries);
    skipped += r.skipped;
  }
  if (all.length < 2) return undefined;
  const section = (y: number) => (y <= 8 ? 'junior' : y <= 11 || !sixthSeparate ? 'senior' : 'sixth form');
  const sexWord = (s: 'M' | 'F') => (s === 'M' ? 'boys' : 'girls');
  const bySection = new Map<string, Entry[]>();
  for (const e of all) {
    const k = `${section(e.year)} ${sexWord(e.sex)}`;
    bySection.set(k, [...(bySection.get(k) ?? []), e]);
  }
  const out = ['Event\tPlace\tName\tSex\tYear\tCategory\tClub'];
  const groups: RaceGroup[] = [];
  for (const [label, list] of bySection) {
    // Places restarting per year group show up as many pupils sharing each place.
    const shared = 1 - new Set(list.map((e) => e.place)).size / list.length;
    const years = new Set(list.map((e) => e.year));
    const byYear = years.size > 1 && shared > 0.25;
    const races = byYear ? [...years].sort((a, b) => a - b).map((y) => [`Y${y} ${sexWord(list[0].sex)}`, list.filter((e) => e.year === y)] as const) : [[label, list] as const];
    for (const [l, es] of races) {
      groups.push({ label: l, finishers: es.length, byYear });
      for (const e of [...es].sort((a, b) => a.place - b.place)) out.push([`${eventName} ${l}`, String(e.place), e.name, e.sex, `Y${e.year}`, l, e.house].join('\t'));
    }
  }
  return { text: out.join('\n'), groups, finishers: all.length, skipped };
}
