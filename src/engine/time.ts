// Time parsing (spec 3.1, 4.2–4.4): typed, pasted, Tasuki-line and dictated times → seconds.
// Readings: "a:b" is m:ss, "a:b:c" is h:mm:ss, and spoken "X Y" with no units is minutes then seconds.
// A dot ("16.15") is read as minutes.seconds only in a time column. Nothing is dropped silently:
// unreadable or implausible input is an error, and ambiguous input that is accepted carries a warning.
// Every limit comes from config.input; nothing here reads the clock.
import type { Config } from './config';
import { DEFAULT_CONFIG } from './config';
import { formatPace, formatTime } from './format';

export { formatDelta, formatPace, formatTime } from './format';

/** 'time' when the text is known to be a time (a time column or field); 'any' for anything else. */
export type TimeContext = 'time' | 'any';

export type TimeParse =
  | { ok: true; sec: number; normalized: string; warnings: string[] }
  | { ok: false; error: string; warnings: string[] };

export interface TimeOptions {
  context?: TimeContext;
  config?: Config;
}

/** A time found inside a line. start/end index the original text, and raw === text.slice(start, end). */
export interface TimeMatch {
  sec: number;
  start: number;
  end: number;
  raw: string;
  warnings: string[];
}

/** A time-shaped token that was rejected ("16:75", "0:05"), with the reason. */
export interface TimeProblem {
  start: number;
  end: number;
  raw: string;
  error: string;
}

type Unit = 'h' | 'm' | 's';
type Read = { sec: number; warnings: string[] } | { error: string };

const MULT: Record<Unit, number> = { h: 3600, m: 60, s: 1 };
const RANK: Record<Unit, number> = { h: 0, m: 1, s: 2 };
const HIGHER: Record<Unit, Unit | null> = { h: null, m: 'h', s: 'm' };
const LOWER: Record<Unit, Unit | null> = { h: 'm', m: 's', s: null };
const UNIT_NAME: Record<Unit, string> = { h: 'Hours', m: 'Minutes', s: 'Seconds' };

// ---------------------------------------------------------------------------------------------
// Normalisation: lower case, NFKC (full-width → half-width), quote marks folded to ' and ".

const CHAR_MAP = new Map<string, string>([
  ['′', "'"], // ′ prime
  ['‘', "'"],
  ['’', "'"],
  ['‛', "'"],
  ['`', "'"],
  ['´', "'"],
  ['＇', "'"],
  ['″', '"'], // ″ double prime
  ['“', '"'],
  ['”', '"'],
  ['„', '"'],
  ['‟', '"'],
  ['＂', '"'],
  ['ʹ', "'"], // modifier letter prime
  ['ʺ', '"'], // modifier letter double prime
  ['∶', ':'], // ratio sign, from some PDF fonts
  ['꞉', ':'], // modifier letter colon
  ['‐', '-'],
  ['‑', '-'],
  ['‒', '-'],
  ['–', '-'],
  ['—', '-'],
  ['−', '-'],
]);

/** Normalised text, with each normalised character's [from, to) range in the original. */
interface Norm {
  s: string;
  from: number[];
  to: number[];
}

function normalise(text: string): Norm {
  let s = '';
  const from: number[] = [];
  const to: number[] = [];
  let p = 0;
  for (const ch of text) {
    const r = (CHAR_MAP.get(ch) ?? ch.normalize('NFKC')).toLowerCase();
    for (let k = 0; k < r.length; k++) {
      from.push(p);
      to.push(p + ch.length);
    }
    s += r;
    p += ch.length;
  }
  return { s, from, to };
}

// ---------------------------------------------------------------------------------------------
// Tokens and atoms.

type Tok =
  | { t: 'num'; s: number; e: number; int: string; frac: string }
  | { t: 'knum'; s: number; e: number; v: number; lead0: boolean }
  | { t: 'word'; s: number; e: number; w: string }
  | { t: 'unit'; s: number; e: number; u: Unit; w: string }
  | { t: 'p'; s: number; e: number; w: string };

const NUM_RE = /\d+(?:\.(\d+))?/y;
const WORD_RE = /[a-zß-öø-ɏ]+/y;
const KANJI_RE = /[〇零一二三四五六七八九十]+/y;
const KANJI_DIGITS = new Map<string, number>([
  ['〇', 0], ['零', 0], ['一', 1], ['二', 2], ['三', 3], ['四', 4], ['五', 5], ['六', 6], ['七', 7], ['八', 8], ['九', 9],
]);

/** 十六 → 16, 五十五 → 55, 〇五 → 5 (with a leading zero). Kanji numerals 0–99 only. */
function kanjiValue(run: string): { v: number; lead0: boolean } | null {
  const t = run.indexOf('十');
  if (t >= 0) {
    if (run.indexOf('十', t + 1) >= 0) return null;
    const a = run.slice(0, t);
    const b = run.slice(t + 1);
    if (a.length > 1 || b.length > 1) return null;
    const tens = a === '' ? 1 : KANJI_DIGITS.get(a);
    const ones = b === '' ? 0 : KANJI_DIGITS.get(b);
    if (tens === undefined || tens === 0 || ones === undefined) return null;
    return { v: tens * 10 + ones, lead0: false };
  }
  if (run.length > 2) return null;
  let v = 0;
  for (const c of run) v = v * 10 + (KANJI_DIGITS.get(c) ?? 0);
  return { v, lead0: run.length === 2 && KANJI_DIGITS.get(run[0]) === 0 };
}

/** A kanji numeral run glued to a Japanese time unit on either side: 七分, 五十五秒, 分五十五, 一時間. */
function kanjiNextToUnit(s: string, a: number, b: number): boolean {
  return s[b] === '分' || s[b] === '秒' || s.startsWith('時間', b) || s[a - 1] === '分' || s.slice(a - 2, a) === '時間';
}

/**
 * kanji 'all' reads every kanji numeral run as a number (a whole time field); 'units' only runs glued to
 * 時間 / 分 / 秒, so the 一 of a name such as 健一 stays a letter in free text.
 */
function tokenise(s: string, kanji: 'all' | 'units'): Tok[] {
  const out: Tok[] = [];
  let p = 0;
  const sticky = (re: RegExp): string | null => {
    re.lastIndex = p;
    const m = re.exec(s);
    return m ? m[0] : null;
  };
  while (p < s.length) {
    const c = s[p];
    if (/\s/.test(c)) {
      p++;
      continue;
    }
    if (/\d/.test(c)) {
      const m = sticky(NUM_RE) ?? c;
      const [int, frac = ''] = m.split('.');
      out.push({ t: 'num', s: p, e: p + m.length, int, frac });
      p += m.length;
      continue;
    }
    const word = sticky(WORD_RE);
    if (word) {
      out.push({ t: 'word', s: p, e: p + word.length, w: word });
      p += word.length;
      continue;
    }
    if (c === "'" || c === '"') {
      const two = c === "'" && s[p + 1] === "'";
      const len = two ? 2 : 1;
      out.push({ t: 'unit', s: p, e: p + len, u: c === "'" && !two ? 'm' : 's', w: c === "'" && !two ? "'" : '"' });
      p += len;
      continue;
    }
    if (c === '時' && s[p + 1] === '間') {
      out.push({ t: 'unit', s: p, e: p + 2, u: 'h', w: '時間' });
      p += 2;
      continue;
    }
    if (c === '分' || c === '秒') {
      out.push({ t: 'unit', s: p, e: p + 1, u: c === '分' ? 'm' : 's', w: c });
      p++;
      continue;
    }
    const run = sticky(KANJI_RE);
    if (run && (kanji === 'all' || kanjiNextToUnit(s, p, p + run.length))) {
      const k = kanjiValue(run);
      out.push(k ? { t: 'knum', s: p, e: p + run.length, v: k.v, lead0: k.lead0 } : { t: 'p', s: p, e: p + run.length, w: run });
      p += run.length;
      continue;
    }
    out.push({ t: 'p', s: p, e: p + 1, w: c });
    p++;
  }
  return out;
}

interface NumAtom {
  k: 'num';
  s: number;
  e: number;
  v: number;
  /** Decimal digits after the point ('' for none). */
  frac: string;
  /** Spoken (number words or kanji) rather than digits. */
  word: boolean;
  /** Digits as written: '5' → 1, '05' / 'oh five' / 'fifteen' → 2. */
  digits: number;
  /** False when glued to a date, place or colon time ("2026-11-01", "7/23", "16:"). */
  standalone: boolean;
}
interface UnitAtom {
  k: 'unit';
  s: number;
  e: number;
  u: Unit;
  /** Source spelling: 'm', 'min', "'", '"', '分', ... */
  w: string;
}
interface OtherAtom {
  k: 'and' | 'comma' | 'a' | 'word' | 'p';
  s: number;
  e: number;
  w: string;
}
type Atom = NumAtom | UnitAtom | OtherAtom;

const ONES = new Map<string, number>(
  ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'].map(
    (w, i) => [w, i] as [string, number],
  ),
).set('nought', 0);
const TENS = new Map<string, number>([
  ['twenty', 20], ['thirty', 30], ['forty', 40], ['fourty', 40], ['fifty', 50], ['sixty', 60], ['seventy', 70], ['eighty', 80], ['ninety', 90],
]);
/** Words read as a leading zero before a digit word: "oh five" = 05. */
const ZEROISH = new Set(['oh', 'o', 'zero', 'nought']);
const UNIT_WORDS = new Map<string, Unit>([
  ['h', 'h'], ['hr', 'h'], ['hrs', 'h'], ['hour', 'h'], ['hours', 'h'],
  ['m', 'm'], ['min', 'm'], ['mins', 'm'], ['minute', 'm'], ['minutes', 'm'],
  ['s', 's'], ['sec', 's'], ['secs', 's'], ['second', 's'], ['seconds', 's'],
]);

function isStandalone(s: string, a: number, b: number): boolean {
  const before = s[a - 1] ?? '';
  const after = s[b] ?? '';
  if (before === ':' || before === '/' || before === '.') return false;
  if (before === '-' && /\d/.test(s[a - 2] ?? '')) return false;
  if (after === ':' || after === '/') return false;
  if (after === '-' && /\d/.test(s[b + 1] ?? '')) return false;
  return true;
}

/** Joins number words ("fifty-two" → 52, "oh five" → 05) and classifies unit words. */
function buildAtoms(toks: Tok[], s: string): Atom[] {
  const atoms: Atom[] = [];
  /** A ones word (1–9) joined to toks[i] by a space or a hyphen. */
  const onesAfter = (i: number): { v: number; j: number } | null => {
    const a = toks[i];
    const b = toks[i + 1];
    let w: Tok | undefined;
    let j = i + 1;
    if (b?.t === 'word') w = b;
    else if (b?.t === 'p' && b.w === '-' && b.s === a.e && toks[i + 2]?.s === b.e) {
      w = toks[i + 2];
      j = i + 2;
    }
    const v = w?.t === 'word' ? ONES.get(w.w) : undefined;
    return v !== undefined && v >= 1 && v <= 9 ? { v, j } : null;
  };
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t === 'num') {
      atoms.push({ k: 'num', s: t.s, e: t.e, v: parseInt(t.int, 10), frac: t.frac, word: false, digits: t.int.length, standalone: isStandalone(s, t.s, t.e) });
    } else if (t.t === 'knum') {
      atoms.push({ k: 'num', s: t.s, e: t.e, v: t.v, frac: '', word: true, digits: t.lead0 || t.v >= 10 ? 2 : 1, standalone: true });
    } else if (t.t === 'unit') {
      atoms.push({ k: 'unit', s: t.s, e: t.e, u: t.u, w: t.w });
    } else if (t.t === 'p') {
      atoms.push({ k: t.w === ',' ? 'comma' : 'p', s: t.s, e: t.e, w: t.w });
    } else {
      const w = t.w;
      const unit = UNIT_WORDS.get(w);
      const tens = TENS.get(w);
      const ones = ONES.get(w);
      // "oh" / "o" is a leading zero only after a number ("seven oh five"); before one it is a name or an
      // initial ("Hana O seven fifty five"). "zero" and "nought" are numbers either way.
      const zero = ZEROISH.has(w) && (ONES.has(w) || atoms[atoms.length - 1]?.k === 'num');
      const joined = tens !== undefined || zero ? onesAfter(i) : null;
      const num = (v: number, e: number, digits: number): NumAtom => ({ k: 'num', s: t.s, e, v, frac: '', word: true, digits, standalone: true });
      if (unit) atoms.push({ k: 'unit', s: t.s, e: t.e, u: unit, w });
      else if (tens !== undefined) {
        atoms.push(num(tens + (joined?.v ?? 0), joined ? toks[joined.j].e : t.e, 2));
        if (joined) i = joined.j;
      } else if (joined) {
        atoms.push(num(joined.v, toks[joined.j].e, 2));
        i = joined.j;
      } else if (ones !== undefined) atoms.push(num(ones, t.e, ones >= 10 ? 2 : 1));
      else atoms.push({ k: w === 'and' ? 'and' : w === 'a' || w === 'an' ? 'a' : 'word', s: t.s, e: t.e, w });
    }
  }
  return atoms;
}

// ---------------------------------------------------------------------------------------------
// Readers.

/** formatTime, keeping any fractional seconds: 975.4 → '16:15.4'. */
function normalisedTime(sec: number): string {
  const ms = Math.round(sec * 1000);
  const rest = ms % 1000;
  const base = formatTime((ms - rest) / 1000);
  return rest === 0 ? base : `${base}.${String(rest).padStart(3, '0').replace(/0+$/, '')}`;
}

function fracSec(frac: string): number {
  return frac ? Number(`0.${frac}`) : 0;
}

/** "m:ss" (b, no c) or "h:mm:ss". strict (inside free text) refuses one-digit fields instead of warning. */
function readColon(a: string, b: string, c: string | undefined, frac: string, raw: string, strict: boolean): Read {
  const warnings: string[] = [];
  if (c === undefined) {
    const m = Number(a);
    const s = Number(b);
    if (b.length > 2 || (strict && b.length < 2)) return { error: `Seconds need two digits in "${raw}"` };
    if (s >= 60) return { error: `Seconds must be below 60 in "${raw}"` };
    const sec = m * 60 + s;
    if (b.length === 1) warnings.push(`Read "${raw}" as ${normalisedTime(sec)} (seconds should have two digits)`);
    if (m >= 60) warnings.push(`Read "${raw}" as ${m} min ${s} s (${normalisedTime(sec)})`);
    return { sec: sec + fracSec(frac), warnings };
  }
  // A zero fraction ("16:15:00.0") is still what Excel makes of a typed 16:15.
  const zeroFrac = !Number(frac);
  if (b.length > 2 || c.length > 2 || (strict && (b.length < 2 || c.length < 2))) return { error: `Minutes and seconds need two digits in "${raw}"` };
  const h = Number(a);
  const m = Number(b);
  const s = Number(c);
  if (m >= 60) return { error: `Minutes must be below 60 in "${raw}"` };
  if (s >= 60) return { error: `Seconds must be below 60 in "${raw}"` };
  const sec = h * 3600 + m * 60 + s;
  if (b.length === 1 || c.length === 1) warnings.push(`Read "${raw}" as ${normalisedTime(sec)}`);
  // Excel turns a typed 16:15 into 16:15:00 (16 hours).
  if (h >= 10 && s === 0 && zeroFrac) warnings.push(`Read "${raw}" as ${h} h ${m} min; if it came from Excel it may mean ${h}:${b} (minutes:seconds)`);
  return { sec: sec + fracSec(frac), warnings };
}

/** "16.15" (minutes.seconds) or "1.02.33" (h.mm.ss): time context only. */
function readDot(a: string, b: string, c: string | undefined, raw: string): Read {
  const notTime = { error: `"${raw}" is not a time (try 16:15, 1:02:33 or 16m15s)` };
  if (c !== undefined) {
    if (b.length !== 2 || c.length !== 2) return notTime;
    const h = Number(a);
    const m = Number(b);
    const s = Number(c);
    if (m >= 60) return { error: `Minutes must be below 60 in "${raw}"` };
    if (s >= 60) return { error: `Seconds must be below 60 in "${raw}"` };
    const sec = h * 3600 + m * 60 + s;
    return { sec, warnings: [`Read "${raw}" as ${normalisedTime(sec)} (hours.minutes.seconds)`] };
  }
  const m = Number(a);
  if (a.length > 3 || b.length > 2) return notTime;
  // "16.0" is 16:00 whichever way it is read.
  if (b === '0') return { sec: m * 60, warnings: [`Read "${raw}" as ${normalisedTime(m * 60)} (minutes.seconds)`] };
  if (b.length === 1) {
    return { error: `"${raw}" is ambiguous (${m}:0${b}, ${formatTime(m * 60 + Number(b) * 6)} or ${m}:${b}0?): write it with a colon` };
  }
  const s = Number(b);
  if (s >= 60) return { error: `Seconds must be below 60 in "${raw}" (for decimal minutes write ${raw} min)` };
  const sec = m * 60 + s;
  return { sec, warnings: [`Read "${raw}" as ${normalisedTime(sec)} (minutes.seconds)`] };
}

interface Part {
  /** null for "a"/"an" ("an hour"). */
  num: NumAtom | null;
  v: number;
  frac: string;
  unitAtom: UnitAtom | null;
  conn: 'and' | 'comma' | null;
  /** Index of the part's last atom. */
  last: number;
}

type UnitsRead =
  | { ok: true; sec: number; warnings: string[]; unitless: boolean; end: number; startPos: number; endPos: number }
  | { ok: false; error: string; unitless: boolean; end: number; startPos: number; endPos: number };

function isNumStart(a: Atom | undefined): boolean {
  return !!a && ((a.k === 'num' && a.standalone) || a.k === 'a');
}

/** Number [unit] pairs, joined by spaces, "and" or commas: "1 hour 2 minutes thirty three". */
function collectParts(atoms: Atom[], i: number): Part[] {
  const parts: Part[] = [];
  let j = i;
  let conn: Part['conn'] = null;
  while (j < atoms.length) {
    const a = atoms[j];
    const next = atoms[j + 1];
    const unitAtom = next?.k === 'unit' ? next : null;
    if (a.k === 'num' && a.standalone) {
      parts.push({ num: a, v: a.v, frac: a.frac, unitAtom, conn, last: unitAtom ? j + 1 : j });
    } else if (a.k === 'a' && unitAtom) {
      parts.push({ num: null, v: 1, frac: '', unitAtom, conn, last: j + 1 });
    } else break;
    j = parts[parts.length - 1].last + 1;
    // "16 min. 15 sec."
    const dot = atoms[j];
    if (unitAtom && dot?.k === 'p' && dot.w === '.' && dot.s === unitAtom.e && /^[a-z]+$/.test(unitAtom.w)) {
      parts[parts.length - 1].last = j;
      j++;
    }
    // Japanese results write hundredths straight after the seconds mark: 4'05"32, 16分15秒3.
    const glued = atoms[j];
    const part = parts[parts.length - 1];
    if (
      unitAtom &&
      (unitAtom.w === '"' || unitAtom.w === '秒') &&
      !part.frac &&
      glued?.k === 'num' &&
      !glued.word &&
      !glued.frac &&
      glued.s === unitAtom.e &&
      glued.digits <= 3
    ) {
      part.frac = String(glued.v).padStart(glued.digits, '0');
      part.last = j;
      j++;
    }
    conn = null;
    const c = atoms[j];
    if (c && (c.k === 'and' || c.k === 'comma') && unitAtom && isNumStart(atoms[j + 1])) {
      conn = c.k;
      j++;
    } else if (!isNumStart(c)) break;
  }
  return parts;
}

/**
 * Units grammar from atom i: "16m15s", "16 min 15", "7'45\"", "16分15秒", "eight minutes ten",
 * "seven fifty five". inText applies the stricter rules for free text (no bare digit pairs, a lone
 * "m" may be metres, '"' may be a closing CSV quote) and gives up (null) rather than erroring.
 */
function readUnits(atoms: Atom[], i: number, inText: boolean, quote: (a: number, b: number) => string): UnitsRead | null {
  let parts = collectParts(atoms, i);
  if (parts.length === 0) return null;
  if (inText) {
    const cut = parts.findIndex((p, k) => k > 0 && !p.unitAtom && p.conn === 'comma');
    if (cut > 0) parts = parts.slice(0, cut);
  }
  const startPos = atoms[i].s;
  const span = () => {
    const last = parts[parts.length - 1].last;
    return { end: last + 1, startPos, endPos: atoms[last].e };
  };
  const raw = () => quote(startPos, span().endPos);
  const fail = (error: string, unitless: boolean): UnitsRead => ({ ok: false, error, unitless, ...span() });
  const spoken = () => parts.some((p) => p.num?.word);

  let units: Unit[] = [];
  const first = parts.findIndex((p) => p.unitAtom);
  if (first < 0) {
    // No units at all: "seven fifty five" (m s) or "one oh two thirty three" (h m s).
    if (inText && (parts.length < 2 || parts.length > 3 || !spoken())) return null;
    if (parts.length === 1) {
      const n = parts[0].num;
      const r = raw();
      if (n && !n.word && !n.frac && (n.digits === 3 || n.digits === 4) && n.v % 100 < 60) {
        return fail(`"${r}" has no units: did you mean ${Math.floor(n.v / 100)}:${String(n.v % 100).padStart(2, '0')}? (for seconds write ${r}s)`, true);
      }
      return fail(`"${r}" has no units: write it as m:ss (16:15) or with units (975s, 16 min)`, true);
    }
    if (parts.length > 3) return fail(`Too many numbers in "${raw()}" to read as a time`, true);
    units = parts.length === 2 ? ['m', 's'] : ['h', 'm', 's'];
  } else {
    // Infer missing units from their neighbours: "nine hours forty five" → 45 minutes.
    if (inText && parts.slice(0, first).some((p) => !p.num?.word)) return null;
    units[first] = parts[first].unitAtom!.u;
    for (let k = first - 1; k >= 0; k--) {
      const hi = HIGHER[units[k + 1]];
      if (!hi) return inText ? null : fail(`Units out of order in "${raw()}"`, false);
      units[k] = hi;
    }
    for (let k = first + 1; k < parts.length; k++) {
      const u = parts[k].unitAtom?.u ?? LOWER[units[k - 1]];
      if (!u) {
        if (!inText) return fail(`Too many numbers in "${raw()}" to read as a time`, false);
        parts = parts.slice(0, k);
        break;
      }
      units[k] = u;
    }
    units = units.slice(0, parts.length);
    for (let k = 1; k < parts.length; k++) {
      if (RANK[units[k]] <= RANK[units[k - 1]]) return fail(`Units out of order in "${raw()}"`, false);
    }
  }

  if (inText) {
    for (let k = 0; k < parts.length; k++) {
      const ua = parts[k].unitAtom;
      const nx = parts[k + 1];
      let ok = true;
      // A lone "m" may be metres ("climb 20 m"): only minutes after hours or before seconds.
      if (ua?.w === 'm') ok = units.slice(0, k).includes('h') || (!!nx && (nx.unitAtom ? nx.unitAtom.u === 's' : !!nx.num && !nx.num.word && nx.num.s === ua.e));
      // A minute mark needs seconds after it; a '"' is a seconds mark only after a minute mark (else a CSV quote).
      else if (ua?.w === "'") ok = !!nx && (!nx.unitAtom || nx.unitAtom.w === '"');
      else if (ua?.w === '"') ok = k > 0 && parts[k - 1].unitAtom?.w === "'";
      if (!ok) {
        if (k === 0) return null;
        parts = parts.slice(0, k);
        units = units.slice(0, k);
        break;
      }
    }
    const explicit = parts.some((p) => p.unitAtom);
    if (!explicit && (parts.length < 2 || !spoken())) return null;
    if (parts.length < 2 && !parts[0].num) return null;
  }
  const unitless = !parts.some((p) => p.unitAtom);

  for (let k = 0; k < parts.length; k++) {
    if (parts[k].frac && k < parts.length - 1) return fail(`Only the last number in "${raw()}" can have a decimal point`, unitless);
    if (k > 0 && parts[k].v >= 60) return fail(`${UNIT_NAME[units[k]]} must be below 60 in "${raw()}"`, unitless);
  }
  let sec = 0;
  parts.forEach((p, k) => {
    sec += (p.v + fracSec(p.frac)) * MULT[units[k]];
  });

  const warnings: string[] = [];
  if (unitless) {
    const r = raw();
    const shown = normalisedTime(sec);
    if (parts.length === 3) warnings.push(`Read "${r}" as ${shown} (hours, minutes and seconds)`);
    else if (parts[1].num && parts[1].num.digits === 1) warnings.push(`Read "${r}" as ${shown}`);
    else if (!spoken()) warnings.push(`Read "${r}" as ${shown} (minutes then seconds)`);
    else if (parts[0].v >= 60) warnings.push(`Read "${r}" as ${parts[0].v} min ${parts[1].v} s (${shown})`);
  }
  return { ok: true, sec, warnings, unitless, ...span() };
}

/** The config.input range check. */
function rangeError(sec: number, config: Config): string | null {
  const { minTimeSec, maxTimeSec } = config.input;
  if (sec < minTimeSec) return `Implausible time ${normalisedTime(sec)} (shorter than ${formatTime(minTimeSec)})`;
  if (sec > maxTimeSec) return `Implausible time ${normalisedTime(sec)} (longer than ${formatTime(maxTimeSec)})`;
  return null;
}

/** The range check; `hint` is appended to a range error ("... may mean 49:30"). */
function checked(r: Read, config: Config, hint = ''): Read {
  if ('error' in r) return r;
  const error = rangeError(r.sec, config);
  return error ? { error: error + hint } : r;
}

/** Excel shows a typed 49:30 as 49:30:00: the hint for an out-of-range h:mm:00 (or h:mm:00.0) with h >= 10. */
function excelHint(a: string, b: string, c: string | undefined, frac: string): string {
  return c !== undefined && Number(c) === 0 && !Number(frac) && Number(a) >= 10 ? `; if it came from Excel it may mean ${Number(a)}:${b} (minutes:seconds)` : '';
}

/**
 * How a unit word after a colon time fits it: 'agree' ("16:15 min" is m:ss, "1:02:33 hrs" is h:mm:ss),
 * 'hm' ("9:45 h", as European results write 9 h 45 min) or 'no' ("16:15 s", "1:02:33 min", "9:45.5 h").
 */
function colonUnitFit(unit: Unit, hms: boolean, frac: string): 'agree' | 'hm' | 'no' {
  if (hms) return unit === 'h' ? 'agree' : 'no';
  if (unit === 'm') return 'agree';
  return unit === 'h' && !frac ? 'hm' : 'no';
}

/** "h:mm" followed by an hours unit ("9:45 h"): hours and minutes, with a warning because it is unusual. */
function readHm(a: string, b: string, raw: string): Read {
  if (b.length !== 2) return { error: `Minutes need two digits in "${raw}"` };
  const h = Number(a);
  const m = Number(b);
  if (m >= 60) return { error: `Minutes must be below 60 in "${raw}"` };
  return { sec: h * 3600 + m * 60, warnings: [`Read "${raw}" as ${h} h ${m} min`] };
}

/** A colon time with an optional unit word after it (already split into fields). */
function readColonWithUnit(a: string, b: string, c: string | undefined, frac: string, unit: Unit | undefined, raw: string, strict: boolean): Read {
  const fit = unit === undefined ? 'agree' : colonUnitFit(unit, c !== undefined, frac);
  if (fit === 'no') return { error: `Units do not fit the colon time in "${raw}"` };
  if (fit === 'hm') return readHm(a, b, raw);
  return readColon(a, b, c, frac, raw, strict);
}

// ---------------------------------------------------------------------------------------------
// Public API.

/**
 * Parse a whole field as a time. context 'time' (the default) also reads "16.15" as 16:15;
 * in 'any' a dotted number is refused because it may be a distance or a decimal.
 * Spoken forms from dictation ("seven fifty five", "one hour two minutes thirty three") work too, as do
 * a unit that agrees with a colon time ("16:15 min", "1:02:33 hrs"), "h:mm h" read as hours and minutes
 * with a warning ("9:45 h"), and Japanese hundredths ("4'05\"32"). A unit that cannot fit ("16:15 s")
 * is an error. Out-of-range h:mm:00 errors carry the Excel hint ("49:30:00 ... may mean 49:30").
 */
export function parseTime(input: string, opts: TimeOptions = {}): TimeParse {
  const config = opts.config ?? DEFAULT_CONFIG;
  const context = opts.context ?? 'time';
  const text = typeof input === 'string' ? input : '';
  const n = normalise(text);
  let a = 0;
  let b = n.s.length;
  while (a < b && /\s/.test(n.s[a])) a++;
  // Dictation often ends with a full stop.
  while (b > a && /[\s.,;!?。、]/.test(n.s[b - 1])) b--;
  if (a >= b) return { ok: false, error: 'No time entered', warnings: [] };
  const s = n.s.slice(a, b);
  const quote = (x: number, y: number) => text.slice(n.from[a + x], n.to[a + y - 1]);
  const raw = quote(0, s.length);

  let r: Read;
  let hint = '';
  const c0 = /^(\d+):(\d+)(?::(\d+))?(?:\.(\d+))?(?:\s*([a-z]+))?$/.exec(s);
  // A word after a colon time counts only when it is a unit ("16:15 min", "9:45 h"); "16:15 pb" is not a time.
  const colonUnit = c0?.[5] === undefined ? undefined : UNIT_WORDS.get(c0[5]);
  const colon = c0 && (c0[5] === undefined || colonUnit) ? c0 : null;
  const dot = /^(\d+)\.(\d+)(?:\.(\d+))?$/.exec(s);
  if (colon) {
    r = readColonWithUnit(colon[1], colon[2], colon[3], colon[4] ?? '', colonUnit, raw, false);
    hint = excelHint(colon[1], colon[2], colon[3], colon[4] ?? '');
  } else if (dot && context !== 'time') {
    const hint = dot[3] !== undefined ? `${dot[1]}:${dot[2]}:${dot[3]}` : dot[2].length === 2 ? `${dot[1]}:${dot[2]}` : 'it with a colon (m:ss)';
    r = { error: `"${raw}" looks like a decimal number, not a time: write ${hint} (a dot is read as minutes.seconds only in a time column)` };
  } else if (dot) r = readDot(dot[1], dot[2], dot[3], raw);
  else {
    const atoms = buildAtoms(tokenise(s, 'all'), s);
    const u = readUnits(atoms, 0, false, quote);
    if (!u || u.end < atoms.length) r = { error: `"${raw}" is not a time (try 16:15, 1:02:33 or 16m15s)` };
    else r = u.ok ? { sec: u.sec, warnings: u.warnings } : { error: u.error };
  }
  const warnings = 'error' in r ? [] : r.warnings;
  r = checked(r, config, hint);
  if ('error' in r) return { ok: false, error: r.error, warnings };
  return { ok: true, sec: r.sec, normalized: normalisedTime(r.sec), warnings };
}

/** Words that mark the next number as something other than a time ("leg 2", "climb 20 m", "stork 22"). */
const NOT_TIME_AFTER = new Set([
  'place', 'pos', 'position', 'rank', 'leg', 'stage', 'climb', 'ascent', 'descent', 'gain', 'elevation', 'elev',
  'ankle', 'calf', 'stork', 'hop', 'age', 'aged', 'year', 'years', 'yr', 'yrs', 'y', 'grade', 'team', 'bib', 'no',
  'number', 'num', 'lap', 'laps', 'error', 'errors', 'nav', 'level', 'round', 'heat', 'wave', 'group', 'of', 'top',
  'distance', 'dist', 'field',
]);
const DISTANCE_WORDS = new Set(['km', 'kms', 'k', 'mi', 'mile', 'miles', 'metre', 'metres', 'meter', 'meters', 'kilometre', 'kilometres', 'kilometer', 'kilometers']);
const LETTERS = /[a-zß-öø-ɏ]/;
const COLON_IN_TEXT = /(\d+):(\d+)(?::(\d+))?(?:\.(\d+))?/y;
/** A word straight after a colon time, glued or after one space ("16:15min", "9:45 h"); not "m40". */
const UNIT_AFTER_COLON = /^( ?)([a-zß-öø-ɏ]+)(?![a-zß-öø-ɏ\d])/;
/**
 * What may follow a spaced unit so that it ends the cell: the end, punctuation, a tab or a number
 * ("16:15 min, leg 2", "16:15 min. leg 2", "9:45 h"). "16:15 Min Testfield" starts a name instead.
 */
const UNIT_ENDS_CELL = /^(?:$|[^a-zß-öø-ɏ ]| +(?:$|[^a-zß-öø-ɏ ]))/;
/** The same for a one-letter unit, whose full stop may be an initial's: "16:15 H. Mockridge". */
const LETTER_UNIT_ENDS_CELL = /^(?:$|[^a-zß-öø-ɏ .]| +(?:$|[^a-zß-öø-ɏ ])|\.(?! *[a-zß-öø-ɏ]))/;
/** A dotted time continued: the ".33" of "1.02.33". */
const DOT_MORE = /\.(\d+)/y;
const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';
/**
 * A date joined to the next token by one space or a "T", as in a Forms timestamp: "2026-11-07 10:15:30",
 * "11/7/26 10:15:30", "7 Nov 2026 10:15", "Nov 7, 2026 10:15", "2026年11月7日 10:15". A comma or a tab after
 * the date ends a column, so "2026-11-05,24:10" is a date column and then a time column.
 */
const DATE_BEFORE = new RegExp(
  `(?:\\d{1,4}[-/.]\\d{1,2}[-/.]\\d{1,4}[ t]|(?:\\d{1,2}[- ]${MONTH}[- ]\\d{2,4}|${MONTH} \\d{1,2},? \\d{2,4}) |\\d{2,4}年\\d{1,2}月\\d{1,2}日(?:\\(.\\))? ?)$`,
);
/** How far back DATE_BEFORE looks ("7 November 2026 " is 16 characters). */
const DATE_LOOKBACK = 24;
/** A pace, not a time: "3:15/km", "4 min/km", "5:30 per mile". */
const PACE_AFTER = /^\s*(?:mins?\s*)?(?:\/|per\s)\s*(?:km|k|mi|mile)\b/;

function excludedStart(atoms: Atom[], i: number): boolean {
  const a = atoms[i];
  let prev = atoms[i - 1];
  if (prev?.k === 'p' && (prev.w === ':' || prev.w === '=')) prev = atoms[i - 2];
  if (!prev) return false;
  if (prev.k === 'p') return prev.w === '#' || prev.w === '第' || prev.w === '№';
  if (prev.k === 'word' && NOT_TIME_AFTER.has(prev.w)) return true;
  // Glued to letters: "Y9", "U18".
  return a.k === 'num' && !a.word && prev.k !== 'num' && prev.e === a.s && LETTERS.test(prev.w[0] ?? '');
}

function scan(text: string, opts: TimeOptions): { match: TimeMatch | null; problem: TimeProblem | null } {
  const config = opts.config ?? DEFAULT_CONFIG;
  const context = opts.context ?? 'any';
  const n = normalise(text);
  const s = n.s;
  const atoms = buildAtoms(tokenise(s, 'units'), s);
  const at = (a: number, b: number) => ({ start: n.from[a], end: n.to[b - 1], raw: text.slice(n.from[a], n.to[b - 1]) });
  const quote = (a: number, b: number) => at(a, b).raw;
  const after = (pos: number) => {
    const k = atoms.findIndex((x) => x.s >= pos);
    return k < 0 ? atoms.length : k;
  };
  let low: TimeMatch | null = null;
  let problem: TimeProblem | null = null;

  let i = 0;
  while (i < atoms.length) {
    const a = atoms[i];
    if (a.k !== 'num' && a.k !== 'a') {
      i++;
      continue;
    }
    if (a.k === 'num' && !a.word) {
      COLON_IN_TEXT.lastIndex = a.s;
      const c = COLON_IN_TEXT.exec(s);
      if (c) {
        let end = a.s + c[0].length;
        const frac = c[4] ?? '';
        // "16:15min", "1:02:33 hrs", "9:45 h": the unit belongs to the time (it used to be ignored or to hide it).
        // A glued unit always belongs to the time; a spaced one only when it ends the cell.
        const w = UNIT_AFTER_COLON.exec(s.slice(end));
        const glued = !!w && !w[1];
        const endsCell = !!w && (w[2].length === 1 ? LETTER_UNIT_ENDS_CELL : UNIT_ENDS_CELL).test(s.slice(end + w[0].length));
        const unit = w && (glued || endsCell) ? UNIT_WORDS.get(w[2]) : undefined;
        const unitLength = unit && w ? w[0].length : 0;
        const next = unit ? '' : (s[end] ?? '');
        // A clock time after a date is a timestamp; 24:10 cannot be a clock time, so it is a result.
        const clock = Number(c[1]) <= 23 && DATE_BEFORE.test(s.slice(Math.max(0, a.s - DATE_LOOKBACK), a.s));
        const skip =
          LETTERS.test(s[a.s - 1] ?? '') ||
          LETTERS.test(next) ||
          next === ':' ||
          (next === '.' && /\d/.test(s[end + 1] ?? '')) ||
          /^\s+[ap]\.?m\b/.test(s.slice(end)) ||
          PACE_AFTER.test(s.slice(end)) ||
          clock;
        if (!skip) {
          end += unitLength;
          const raw = quote(a.s, end);
          const r = checked(readColonWithUnit(c[1], c[2], c[3], frac, unit, raw, true), config, excelHint(c[1], c[2], c[3], frac));
          if (!('error' in r)) return { match: { sec: r.sec, ...at(a.s, end), warnings: r.warnings }, problem };
          problem ??= { ...at(a.s, end), error: r.error };
        }
        i = after(end);
        continue;
      }
    }
    if (excludedStart(atoms, i)) {
      i++;
      continue;
    }
    // Dots in a time column, unless a distance ("21.10 km"): "16.15" is 16:15 and "1.02.33" is 1:02:33 (it used
    // to stop at "1.02"). "16.5" and "16.75" are reported as parseTime reports them; "4.0" is passed over quietly
    // because in a line it is most likely a distance.
    if (context === 'time' && a.k === 'num' && !a.word && (a.frac.length === 1 || a.frac.length === 2) && a.digits <= 2 && a.standalone) {
      const nx = atoms[i + 1];
      const distance = nx?.k === 'unit' || (nx?.k === 'word' && DISTANCE_WORDS.has(nx.w)) || (nx?.k === 'p' && nx.w === '%');
      DOT_MORE.lastIndex = a.e;
      const more = DOT_MORE.exec(s);
      const end = more ? DOT_MORE.lastIndex : a.e;
      if (!distance && (more || a.frac !== '0')) {
        // A fourth dotted field ("1.02.33.4") is not a time either way.
        if (s[end] === '.' && /\d/.test(s[end + 1] ?? '')) {
          i = after(end);
          continue;
        }
        const r = checked(readDot(s.slice(a.s, a.s + a.digits), a.frac, more?.[1], quote(a.s, end)), config);
        if (!('error' in r)) return { match: { sec: r.sec, ...at(a.s, end), warnings: r.warnings }, problem };
        problem ??= { ...at(a.s, end), error: r.error };
        i = after(end);
        continue;
      }
    }
    const u = readUnits(atoms, i, true, quote);
    if (u && PACE_AFTER.test(s.slice(u.endPos))) {
      i = u.end;
      continue;
    }
    if (u) {
      const error = u.ok ? rangeError(u.sec, config) : u.error;
      if (u.ok && !error) {
        const match = { sec: u.sec, ...at(u.startPos, u.endPos), warnings: u.warnings };
        // A bare spoken pair is weak evidence: prefer a clearer time later in the line.
        if (!u.unitless) return { match, problem };
        low ??= match;
      } else if (error) {
        // Also a rejected spoken pair ("seven seventy"): dictation never drops a time silently.
        problem ??= { ...at(u.startPos, u.endPos), error };
      }
      i = u.end;
      continue;
    }
    i++;
  }
  return { match: low, problem };
}

/**
 * The first time in a free-text line ("Aiko Testfield, 8:10, leg 2" → 8:10), or null.
 * Ignores places ("7/23", "place 7"), distances ("4.0 km", "64 km"), "64 laps", dates, "leg 2",
 * "climb 20 m", ages, year groups ("Y9"), ARM measures and clock timestamps (a clock time of 0–23 h joined
 * to a date by a space or "T"; after a comma or tab the date is its own column). A unit word that ends the
 * cell belongs to a colon time ("16:15min", "9:45 h" = 9 h 45 min; "16:15 s" is a problem). Spoken times
 * work ("seven fifty five", "七分五十五秒"), but a bare spoken pair gives way to a clearer time later in the line.
 * context defaults to 'any' here (free text); pass 'time' to also read "16.15" as 16:15 and "1.02.33" as 1:02:33.
 * Rejected time-shaped tokens are skipped; findTimeProblemInText says why.
 */
export function findTimeInText(text: string, opts: TimeOptions = {}): TimeMatch | null {
  return scan(typeof text === 'string' ? text : '', opts).match;
}

/** The first time-shaped token in a line that was rejected ("16:75", "0:05"), with the reason, or null. */
export function findTimeProblemInText(text: string, opts: TimeOptions = {}): TimeProblem | null {
  return scan(typeof text === 'string' ? text : '', opts).problem;
}

/**
 * Pace sanity check (spec 4.2): a warning when timeSec over distanceKm is faster than
 * config.input.fastestPaceSecPerKm or slower than slowestPaceSecPerKm, else null.
 * Which distance to pass (raw or effective) is the caller's choice.
 */
export function paceWarning(timeSec: number, distanceKm: number, config: Config): string | null {
  if (!Number.isFinite(timeSec) || !Number.isFinite(distanceKm) || timeSec <= 0 || distanceKm <= 0) return null;
  const pace = timeSec / distanceKm;
  const { fastestPaceSecPerKm: fast, slowestPaceSecPerKm: slow } = config.input;
  // Round away from the limit so the shown pace never equals it.
  if (pace < fast) return `Implausible pace ${formatPace(Math.floor(pace))} (faster than ${formatPace(fast)})`;
  if (pace > slow) return `Implausible pace ${formatPace(Math.ceil(pace))} (slower than ${formatPace(slow)})`;
  return null;
}
