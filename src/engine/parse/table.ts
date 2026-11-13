// Results tables copied from race websites, PDFs and Excel (spec 4.2 item 1) and Microsoft/Google
// Forms CSV exports (item 3). Columns are found from headers (English or Japanese) or, without a
// header, heuristically: time = the column that parses as times, place = small integers, name = text.
import type { PerfKind, PerfSource } from '../../types';
import type { Config } from '../config';
import { isISODate } from '../dates';
import { findTimeInText, findTimeProblemInText, parseTime } from '../time';
import { detectDelimiter, joinQuotedLines, normaliseSeparators, splitLine, type Delimiter } from './split';
import type { RawParse, RawRow, RawSection, SectionDefaults } from './types';

export type ColumnRole = 'place' | 'name' | 'given' | 'family' | 'time' | 'category' | 'club' | 'bib' | 'sex' | 'event' | 'date' | 'distance' | 'kind' | 'ignore';

const HEADER_WORDS: [ColumnRole, RegExp][] = [
  ['place', /^(順位|着順|総合順位|place|pos(ition)?|rank|overall|#|no\.?)$/i],
  ['given', /^(名|first\s*name|given\s*name|forename|preferred\s*name)$/i],
  ['family', /^(姓|last\s*name|surname|family\s*name)$/i],
  ['name', /^(氏名|名前|選手名?|ランナー|name|runner|athlete|full\s*name|your\s*(full\s*)?name|participant|student(\s*name)?)$/i],
  ['time', /^(記録|タイム|時間|ネット(タイム)?|グロス(タイム)?|time|result|finish(\s*time)?|chip(\s*time)?|gun(\s*time)?|net(\s*time)?|your\s*time|official\s*time)$/i],
  ['category', /^(種目|部門|クラス|カテゴリー?|区分|category|cat\.?|class|age\s*(group|cat(egory)?)|division)$/i],
  ['club', /^(所属|チーム|学校|club|team|school|affiliation)$/i],
  ['bib', /^(ゼッケン|ナンバー|bib(\s*no\.?)?|race\s*no\.?|number)$/i],
  ['sex', /^(性別|sex|gender|m\/f)$/i],
  ['event', /^(大会名?|レース名?|event(\s*name)?|race(\s*name)?|which\s*(race|event)|parkrun\s*(name|event)?)$/i],
  ['date', /^(日付|開催日|date(\s*of\s*(run|race|event))?|race\s*date|event\s*date|when)$/i],
  ['distance', /^(距離|distance(\s*\(km\))?|km)$/i],
  ['kind', /^(種類|type(\s*of\s*(run|event))?|kind)$/i],
];

const FORMS_MARKERS = /^(timestamp|タイムスタンプ|start\s*time|completion\s*time|email(\s*address)?|id)$/i;

function roleOfHeader(cell: string): ColumnRole | undefined {
  const c = cell.replace(/[\s:：*?？]+$/, '').trim();
  for (const [role, re] of HEADER_WORDS) if (re.test(c)) return role;
  // Forms questions are long: "What was your finish time?" / "Name of the event"
  if (/time/i.test(c) && !/(start|completion|stamp)/i.test(c)) return 'time';
  if (/\bname\b/i.test(c) && /(event|race)/i.test(c)) return 'event';
  if (/\bname\b/i.test(c)) return 'name';
  if (/\bdate\b/i.test(c)) return 'date';
  if (/distance/i.test(c)) return 'distance';
  return undefined;
}

export interface TableLayout {
  delimiter: Delimiter;
  headerRow: number | null;
  roles: ColumnRole[];
  forms: boolean;
}

/** Find the header row (within the first 5 non-empty lines) and the role of each column. */
export function detectLayout(lines: string[]): TableLayout {
  const delimiter = detectDelimiter(lines);
  const cells = lines.map((l) => splitLine(l, delimiter));
  for (let i = 0; i < Math.min(5, cells.length); i++) {
    const roles = cells[i].map((c) => roleOfHeader(c) ?? 'ignore');
    const known = roles.filter((r) => r !== 'ignore').length;
    if (known >= 2 && (roles.includes('name') || roles.includes('family') || roles.includes('given'))) {
      const forms = cells[i].some((c) => FORMS_MARKERS.test(c.trim()));
      // MS Forms has its own "Name" column (the account); prefer a question like "Your name" when present.
      if (forms) {
        const nameCols = roles.map((r, j) => (r === 'name' ? j : -1)).filter((j) => j >= 0);
        if (nameCols.length > 1) for (const j of nameCols) if (/^name$/i.test(cells[i][j].trim())) roles[j] = 'ignore';
        cells[i].forEach((c, j) => {
          if (FORMS_MARKERS.test(c.trim())) roles[j] = 'ignore';
        });
      }
      return { delimiter, headerRow: i, roles, forms };
    }
  }
  return { delimiter, headerRow: null, roles: inferRoles(cells), forms: false };
}

/** Without a header: score columns by content. */
function inferRoles(cells: string[][]): ColumnRole[] {
  const width = Math.max(0, ...cells.map((r) => r.length));
  if (width <= 1) return ['name'];
  const roles: ColumnRole[] = Array(width).fill('ignore');
  const col = (j: number) => cells.map((r) => r[j] ?? '').filter((c) => c);
  const frac = (j: number, f: (c: string) => boolean) => {
    const xs = col(j);
    return xs.length ? xs.filter(f).length / xs.length : 0;
  };
  const isTime = (c: string) => /\d/.test(c) && parseTime(c, { context: 'time' }).ok && /[:'′分"″秒.]|\b(min|m|s|sec)\b/i.test(c);
  const isInt = (c: string) => /^\d{1,4}\.?$/.test(c);
  const isText = (c: string) => /[\p{L}]{2,}/u.test(c) && !isTime(c);
  let timeCol = -1;
  let best = 0;
  for (let j = 0; j < width; j++) {
    const s = frac(j, isTime);
    if (s > best + 0.001) {
      best = s;
      timeCol = j;
    }
  }
  if (timeCol >= 0 && best >= 0.5) roles[timeCol] = 'time';
  const placeCol = [...Array(width).keys()].find((j) => roles[j] === 'ignore' && frac(j, isInt) >= 0.8);
  if (placeCol != null) roles[placeCol] = 'place';
  let nameCol = -1;
  best = 0;
  for (let j = 0; j < width; j++) {
    if (roles[j] !== 'ignore') continue;
    const s = frac(j, isText);
    if (s > best) {
      best = s;
      nameCol = j;
    }
  }
  if (nameCol >= 0) roles[nameCol] = 'name';
  return roles;
}

const KIND_WORDS: [RegExp, PerfKind][] = [
  [/parkrun/i, 'parkrun'],
  [/long\s*run|ロング/i, 'long_run'],
  [/relay|ekiden|駅伝/i, 'relay_leg'],
  [/race|レース|大会|xc|trail|marathon|10k|5k/i, 'race'],
];

function kindFrom(text: string | undefined): PerfKind | undefined {
  if (!text) return undefined;
  for (const [re, k] of KIND_WORDS) if (re.test(text)) return k;
  return undefined;
}

/** dd/mm/yyyy (UK), yyyy/mm/dd, yyyy-mm-dd, yyyy年m月d日, optionally followed by a clock time. */
export function parseDateCell(s: string): string | undefined {
  const t = s.trim();
  let m: RegExpExecArray | null;
  const iso = (y: number, mo: number, d: number) => {
    const out = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return isISODate(out) ? out : undefined;
  };
  if ((m = /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/.exec(t))) return iso(+m[1], +m[2], +m[3]);
  if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(t))) return iso(+m[3], +m[2], +m[1]);
  return undefined;
}

export function parseTable(text: string, opts: { today: string; config: Config; source?: PerfSource; defaults?: SectionDefaults; layout?: TableLayout }): RawParse {
  const { today, config } = opts;
  const physical = text.split(/\r?\n/).map(normaliseSeparators);
  // logical lines (a quoted Forms answer may span physical lines), each with its first physical line number
  const joined = joinQuotedLines(physical);
  const kept: { l: string; n: number }[] = [];
  let at = 1;
  for (const l of joined) {
    if (l.trim()) kept.push({ l, n: at });
    at += l.split('\n').length;
  }
  const lines = kept.map((x) => x.l);
  const layout = opts.layout ?? detectLayout(lines);
  const source: PerfSource = opts.source ?? (layout.forms ? 'form' : 'paste');
  const d = opts.defaults ?? {};
  const sections = new Map<string, RawSection>();
  const warnings: string[] = [];
  const rows: RawRow[] = [];
  const sectionFor = (name: string | undefined, date: string | undefined, kind: PerfKind | undefined, distanceKm: number | undefined): RawSection => {
    const nm = name?.trim() || d.name || '';
    const dt = date ?? d.date ?? today;
    const key = `t:${nm.toLowerCase()}|${dt}`;
    let s = sections.get(key);
    if (!s) {
      s = { key, type: 'event', name: nm, date: dt, perfKind: kind ?? d.perfKind ?? 'race', distanceKm: distanceKm ?? d.distanceKm, climbM: d.climbM, courseName: d.courseName, official: d.official ?? true, line: 0, warnings: [] };
      if (!nm) s.warnings.push('No event name: choose or create the event above');
      if (!date && !d.date) s.warnings.push('No date: using today');
      sections.set(key, s);
    }
    return s;
  };

  const roleIdx = (r: ColumnRole) => layout.roles.indexOf(r);
  const iName = roleIdx('name');
  const iGiven = roleIdx('given');
  const iFamily = roleIdx('family');
  const iTime = roleIdx('time');
  const iPlace = roleIdx('place');
  const iCat = roleIdx('category');
  const iEvent = roleIdx('event');
  const iDate = roleIdx('date');
  const iDist = roleIdx('distance');
  const iKind = roleIdx('kind');
  const iClub = roleIdx('club');
  const iSex = roleIdx('sex');

  lines.forEach((line, idx) => {
    if (layout.headerRow != null && idx <= layout.headerRow) return;
    const cells = splitLine(line, layout.delimiter);
    const get = (i: number) => (i >= 0 ? (cells[i] ?? '').trim() : '');
    const ln = kept[idx].n;
    // a repeated header row (multi-page PDFs) or a section title line
    if (layout.headerRow != null && cells.filter((c) => roleOfHeader(c)).length >= 2) return;
    const row: RawRow = { line: ln, raw: line, sectionKey: '', name: '', source, warnings: [], errors: [] };
    let name = iName >= 0 ? get(iName) : [get(iGiven), get(iFamily)].filter(Boolean).join(' ');
    let timeText = get(iTime);
    if (layout.delimiter === 'none' || (iName < 0 && iGiven < 0 && iFamily < 0)) {
      // Free text line: "7  Aiko Testfield  Appi  16:15" or "Aiko Testfield 16:15"
      const t = findTimeInText(line, { context: 'time', config });
      const head = t ? line.slice(0, t.start) : line;
      const pm = /^\s*(\d{1,4})[.)]?\s+/.exec(head);
      if (pm) row.place = Number(pm[1]);
      name = head.slice(pm ? pm[0].length : 0).replace(/[,，\t]+\s*$/, '').trim();
      if (t) {
        row.timeSec = t.sec;
        row.timeRaw = t.raw;
        row.warnings.push(...t.warnings);
      } else {
        const p = findTimeProblemInText(line, { context: 'time', config });
        row.errors.push(p ? p.error : 'missing time');
      }
      timeText = '';
    } else if (timeText) {
      const t = parseTime(timeText, { context: 'time', config });
      if (t.ok) {
        row.timeSec = t.sec;
        row.timeRaw = timeText;
        row.warnings.push(...t.warnings);
      } else row.errors.push(`${t.error}`);
    } else if (iTime >= 0) row.errors.push('missing time');
    row.name = name.replace(/\s+/g, ' ').trim();
    if (iPlace >= 0) {
      const p = /^(\d+)/.exec(get(iPlace));
      if (p) row.place = Number(p[1]);
    }
    if (iCat >= 0 && get(iCat)) row.category = get(iCat);
    if (iClub >= 0 && get(iClub)) row.club = get(iClub);
    if (iSex >= 0 && get(iSex)) row.sexText = get(iSex);
    let date: string | undefined;
    if (iDate >= 0 && get(iDate)) {
      date = parseDateCell(get(iDate));
      if (!date) row.warnings.push(`Date not understood: “${get(iDate)}”`);
    }
    let dist: number | undefined;
    if (iDist >= 0 && get(iDist)) {
      const m = /(\d+(?:[.,]\d+)?)/.exec(get(iDist));
      if (m) dist = Number(m[1].replace(',', '.'));
      if (dist != null && /mile/i.test(get(iDist))) dist *= 1.609344;
    }
    if (dist != null) row.distanceKm = dist;
    const evName = iEvent >= 0 ? get(iEvent) : undefined;
    const kind = kindFrom(iKind >= 0 ? get(iKind) : undefined) ?? (layout.forms ? kindFrom(evName) : undefined);
    if (!row.name && row.timeSec == null) return; // blank / decorative line
    if (!row.name) row.errors.push('No name');
    const sec = sectionFor(evName, date, kind, layout.forms ? undefined : dist);
    row.sectionKey = sec.key;
    if (layout.forms) row.unverified = true;
    rows.push(row);
  });

  // A placings list (a whole-school race with positions only, no times at all) is still useful: keep the
  // places. In a table that has times, a missing time stays an error (the row is skipped).
  if (rows.length && rows.every((r) => r.timeSec == null) && rows.some((r) => r.place != null)) {
    for (const r of rows) {
      if (r.place == null || !r.errors.includes('missing time')) continue;
      r.errors = r.errors.filter((e) => e !== 'missing time');
      r.warnings.push('place only (no time)');
    }
    warnings.push('A placings list: places only, no times. Places and field sizes are saved; times can be added later.');
  }
  if (!rows.length) warnings.push('No results found. Check that the text has a name and a time on each line.');
  if (layout.headerRow == null && layout.delimiter !== 'none' && !layout.roles.includes('time')) warnings.push('Could not find a time column');
  return { format: layout.forms ? 'forms' : 'table', sections: [...sections.values()], rows, warnings };
}
