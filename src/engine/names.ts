// Name matching for Paste-and-Match, Quick Entry and roster import (spec 4.2, 4.5).
// Pure functions: the roster and config are passed in. Names are never keys; this only proposes ids.
import type { Athlete, ISODate, YearGroup } from '../types';
import type { Config } from './config';
import { academicYearOf } from './dates';

/** Standard Jaro–Winkler constants (part of the algorithm, not a coach setting). */
const JW_PREFIX_SCALE = 0.1;
const JW_MAX_PREFIX = 4;
/** Fuzzy suggestions shown per name (review table space). */
const MAX_FUZZY_CANDIDATES = 5;

const LATIN = /\p{Script=Latin}/u;
/** Latin letters that NFD does not decompose, folded to a plain spelling. */
const LATIN_FOLD: Record<string, string> = { ß: 'ss', ø: 'o', đ: 'd', ð: 'd', ł: 'l', æ: 'ae', œ: 'oe', þ: 'th', ı: 'i', ħ: 'h' };
const LATIN_FOLD_RE = /[ßøđðłæœþıħ]/g;
/** A dash typed after kana is a long-vowel mark (テストフィ-ルド = テストフィールド), not punctuation. */
const KANA_DASH = /(?<=[ぁ-ゖゝゞァ-ヺー-ヾ])[-‐-―−](?=[ぁ-ゖゝゞァ-ヺー-ヾ]|\s|$)/g;
/** Anything that is not a letter, digit or combining mark is a separator (plus modifier-letter apostrophes ʼ ʻ). */
const SEPARATOR = /[^\p{L}\p{N}\p{M}]+|[ʹ-ʿ]+/gu;

const WARN_INACTIVE = 'inactive athlete (no active athlete matched)';
const WARN_GIVEN_ONLY = 'given name only: confirm the athlete';
const WARN_FAMILY_ONLY = 'family name only: confirm the athlete';
/** One word of a two-or-more-word alias (アイコ of テストフィールド アイコ): given or family, in another script. */
const WARN_PART_ONLY = 'one part of a name only: confirm the athlete';

/**
 * Review-table match types (spec 4.2): exact alias, normalised, initials, fuzzy suggestion, ambiguous
 * (two or more athletes), unmatched, and outsider (a non-roster competitor in a results table; only
 * when the caller passes `outsiders: true`).
 */
export type MatchType = 'exact_alias' | 'normalised' | 'initials' | 'fuzzy' | 'ambiguous' | 'unmatched' | 'outsider';

export interface MatchCandidate {
  athleteId: string;
  /** 1 for levels exact_alias / normalised / initials; the Jaro–Winkler similarity for fuzzy. */
  score: number;
  type: MatchType;
  /** The stored alias or normalised key that matched. */
  via: string;
}

export interface NameMatch {
  input: string;
  type: MatchType;
  /** Set only for a confident match (exact_alias, normalised, initials). Never for fuzzy or ambiguous. */
  athleteId?: string;
  candidates: MatchCandidate[];
  warnings: string[];
}

export interface MatchOptions {
  /**
   * The rows are a full results table (a race website, a PDF), so a name that matches nobody and has
   * no fuzzy suggestion is an outsider: counted for field size, never stored (spec 4.2 point 5).
   */
  outsiders?: boolean;
}

/** Katakana (full-width, and half-width via NFKC) to hiragana. Every other character is unchanged. */
export function toHiragana(s: string): string {
  const full = s.replace(/[｡-ﾟ]+/g, (m) => m.normalize('NFKC'));
  let out = '';
  for (const ch of full) {
    const c = ch.codePointAt(0)!;
    // ァ (30A1) … ヶ (30F6) and the iteration marks ヽ ヾ sit exactly 0x60 above their hiragana.
    out += (c >= 0x30a1 && c <= 0x30f6) || c === 0x30fd || c === 0x30fe ? String.fromCodePoint(c - 0x60) : ch;
  }
  return out;
}

/**
 * Comparable form of a name: NFKC (full-width → half-width, half-width katakana → full-width), lowercase,
 * Latin diacritics stripped (U+0300–U+036F only, so kana dakuten survive), punctuation → space,
 * katakana → hiragana, spaces collapsed. Kanji are left as they are (no reading is guessed).
 */
export function normaliseName(s: string): string {
  let t = (s ?? '').normalize('NFKC').toLowerCase();
  t = t.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
  t = t.replace(LATIN_FOLD_RE, (c) => LATIN_FOLD[c]);
  t = t.replace(KANA_DASH, 'ー');
  t = t.replace(SEPARATOR, ' ');
  t = toHiragana(t);
  return t.replace(/ +/g, ' ').trim();
}

/** Standard Jaro–Winkler similarity (0..1) over code points: prefix scale 0.1, prefix of at most 4. */
export function jaroWinkler(a: string, b: string): number {
  const s1 = Array.from(a);
  const s2 = Array.from(b);
  const l1 = s1.length;
  const l2 = s2.length;
  if (l1 === 0 && l2 === 0) return 1;
  if (l1 === 0 || l2 === 0) return 0;
  const window = Math.max(0, Math.floor(Math.max(l1, l2) / 2) - 1);
  const used1 = new Array<boolean>(l1).fill(false);
  const used2 = new Array<boolean>(l2).fill(false);
  let m = 0;
  for (let i = 0; i < l1; i++) {
    const hi = Math.min(l2 - 1, i + window);
    for (let j = Math.max(0, i - window); j <= hi; j++) {
      if (!used2[j] && s1[i] === s2[j]) {
        used1[i] = used2[j] = true;
        m++;
        break;
      }
    }
  }
  if (m === 0) return 0;
  let k = 0;
  let halfTranspositions = 0;
  for (let i = 0; i < l1; i++) {
    if (!used1[i]) continue;
    while (!used2[k]) k++;
    if (s1[i] !== s2[k]) halfTranspositions++;
    k++;
  }
  const t = halfTranspositions / 2;
  const jaro = (m / l1 + m / l2 + (m - t) / m) / 3;
  let prefix = 0;
  while (prefix < Math.min(JW_MAX_PREFIX, l1, l2) && s1[prefix] === s2[prefix]) prefix++;
  return jaro + prefix * JW_PREFIX_SCALE * (1 - jaro);
}

/** Level-1 form: NFKC, trimmed, whitespace runs as one space. Otherwise exact (case and script kept). */
function exactForm(s: string): string {
  return (s ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
}

/** Strings with no Latin letters (kanji, kana) are compared with every space removed. */
function compareForm(n: string): string {
  return LATIN.test(n) ? n : n.replace(/ /g, '');
}

/**
 * Every space removed, so punctuation that a timing system dropped still matches:
 * "Hana OMockridge" = "Hana O'Mockridge" ("hana o mockridge"), "MaryJane" = "Mary-Jane".
 */
function squash(n: string): string {
  return n.replace(/ /g, '');
}

/** First letter of each token of a name part: "mary jane" → "mj", "o mockridge" → "om". */
function initialsOf(part: string): string {
  return part
    .split(' ')
    .map((t) => Array.from(t)[0] ?? '')
    .join('');
}

function nameParts(a: Pick<Athlete, 'givenName' | 'familyName' | 'preferredName'>) {
  const given = normaliseName(a.givenName ?? '');
  const preferred = normaliseName(a.preferredName ?? '');
  const family = normaliseName(a.familyName ?? '');
  const firsts = [...new Set([given, preferred].filter(Boolean))];
  return { firsts, family };
}

/**
 * Every normalised key an athlete answers to: "given family", "family given", "preferred family",
 * "family preferred", each alias, and each two-token alias reversed. Useful for type-ahead too.
 */
export function nameKeys(a: Pick<Athlete, 'givenName' | 'familyName' | 'preferredName' | 'aliases'>): string[] {
  const { firsts, family } = nameParts(a);
  const out: string[] = [];
  if (firsts.length && family) for (const f of firsts) out.push(`${f} ${family}`, `${family} ${f}`);
  else if (firsts.length) out.push(...firsts);
  else if (family) out.push(family);
  for (const alias of a.aliases ?? []) {
    const n = normaliseName(alias);
    if (!n) continue;
    out.push(n);
    const toks = n.split(' ');
    if (toks.length === 2) out.push(`${toks[1]} ${toks[0]}`);
  }
  return [...new Set(out)];
}

interface Indexed {
  athlete: Athlete;
  /** exactForm(alias) → alias as stored */
  exact: Map<string, string>;
  /** compareForm(key) → normalised key */
  keys: Map<string, string>;
  /** squash(key) → normalised key (the punctuation-dropped fallback). */
  squashed: Map<string, string>;
  /** Normalised given and preferred names (distinct). */
  firsts: string[];
  family: string;
  /** Each word of every alias of two or more words ("てすとふぃーるど", "あいこ", "試験", "愛子"). */
  aliasParts: string[];
}

/** The words of every multi-word alias: name parts in another script, which on their own are never confident. */
function aliasPartsOf(a: Pick<Athlete, 'aliases'>): string[] {
  const out = new Set<string>();
  for (const alias of a.aliases ?? []) {
    const toks = normaliseName(alias).split(' ');
    if (toks.length >= 2) for (const t of toks) out.add(t);
  }
  return [...out];
}

function indexAthlete(a: Athlete): Indexed {
  const exact = new Map<string, string>();
  for (const alias of a.aliases ?? []) {
    const e = exactForm(alias);
    if (e && !exact.has(e)) exact.set(e, alias);
  }
  const keys = new Map<string, string>();
  const squashed = new Map<string, string>();
  for (const k of nameKeys(a)) {
    if (!keys.has(compareForm(k))) keys.set(compareForm(k), k);
    // Only names of two or more tokens: "Sam Pleton" must not become a one-word alias "Sampleton".
    if (k.includes(' ') && !squashed.has(squash(k))) squashed.set(squash(k), k);
  }
  return { athlete: a, exact, keys, squashed, ...nameParts(a), aliasParts: aliasPartsOf(a) };
}

/**
 * Initials ("aiko t", "a testfield", "testfield a", "h o mockridge", "m j smith example"): a run of single
 * Latin letters at the start or the end, the rest a full given/preferred name with the family initial(s), or
 * the full family name with the given initial(s). Single letters inside a family name ("O'Mockridge" →
 * "o mockridge") are fine. Returns the full-name key it expands to, or undefined.
 */
function initialsVia(n: string, ix: Indexed): string | undefined {
  if (!ix.family || !ix.firsts.length) return undefined;
  for (const { letters, rest } of initialSplits(n)) {
    for (const f of ix.firsts) {
      if (squash(rest) === squash(f) && fitsInitials(letters, ix.family)) return `${f} ${ix.family}`;
      if (squash(rest) === squash(ix.family) && fitsInitials(letters, f)) return `${ix.family} ${f}`;
    }
  }
  return undefined;
}

/** letters are a leading part of the part's initials ("m" or "mj" for "mary jane"). */
function fitsInitials(letters: string, part: string): boolean {
  return initialsOf(part).startsWith(letters);
}

/**
 * Ways to read a name as initials plus a spelled-out part: a run of single Latin letters at the start or the
 * end ("a testfield" → a + testfield; "h o mockridge" → h + o mockridge, then ho + mockridge).
 */
function initialSplits(n: string): { letters: string; rest: string }[] {
  const toks = n.split(' ');
  const isInitial = (t: string) => /^[a-z]$/.test(t);
  const out: { letters: string; rest: string }[] = [];
  for (let k = 1; k < toks.length; k++) {
    const lead = toks.slice(0, k);
    if (lead.every(isInitial)) out.push({ letters: lead.join(''), rest: toks.slice(k).join(' ') });
    const tail = toks.slice(toks.length - k);
    if (tail.every(isInitial)) out.push({ letters: tail.join(''), rest: toks.slice(0, toks.length - k).join(' ') });
  }
  return out;
}

/**
 * Initials with a typo in the spelled-out part ("D. Osampel"): when the initials fit exactly, the best
 * Jaro–Winkler of that part against the matching full name part, with the full-name key it points to.
 */
function fuzzyInitials(n: string, ix: Indexed): { score: number; via: string } | null {
  if (!ix.family || !ix.firsts.length) return null;
  let best: { score: number; via: string } | null = null;
  const consider = (score: number, via: string) => {
    if (!best || score > best.score) best = { score, via };
  };
  for (const { letters, rest } of initialSplits(n)) {
    for (const f of ix.firsts) {
      if (fitsInitials(letters, ix.family)) consider(jaroWinkler(squash(rest), squash(f)), `${f} ${ix.family}`);
      if (fitsInitials(letters, f)) consider(jaroWinkler(squash(rest), squash(ix.family)), `${ix.family} ${f}`);
    }
  }
  return best;
}

/**
 * Levels 1–3 over one pool. Levels 1 and 2 are taken together, so a stored alias that is exactly another
 * athlete's name gives two hits (ambiguous), never a silent pick; exact-alias hits are listed first. The
 * punctuation-dropped (squashed) comparison is tried only when nothing else hit, then initials.
 */
function confidentHits(input: string, n: string, pool: Indexed[]): MatchCandidate[] {
  const e = exactForm(input);
  const hit = (ix: Indexed, type: MatchType, via: string): MatchCandidate => ({ athleteId: ix.athlete.id, score: 1, type, via });
  const exact = pool.filter((ix) => ix.exact.has(e)).map((ix) => hit(ix, 'exact_alias', ix.exact.get(e)!));
  const c = compareForm(n);
  const seen = new Set(exact.map((h) => h.athleteId));
  const normalised = pool.filter((ix) => !seen.has(ix.athlete.id) && ix.keys.has(c)).map((ix) => hit(ix, 'normalised', ix.keys.get(c)!));
  if (exact.length || normalised.length) return [...exact, ...normalised];
  const sq = squash(c);
  const squashed = pool.filter((ix) => ix.squashed.has(sq)).map((ix) => hit(ix, 'normalised', ix.squashed.get(sq)!));
  if (squashed.length) return squashed;
  const initials: MatchCandidate[] = [];
  for (const ix of pool) {
    const via = initialsVia(n, ix);
    if (via) initials.push(hit(ix, 'initials', via));
  }
  return initials;
}

/**
 * Level 4 over one pool: best Jaro–Winkler per athlete against every key (both name orders); for an input
 * with as many tokens as a single name part, against the given / preferred / family name or one word of a
 * multi-word alias alone; and, for initials, against the spelled-out part when the initials fit ("D. Osampel").
 */
function fuzzyHits(n: string, pool: Indexed[], threshold: number): MatchCandidate[] {
  const c = compareForm(n);
  const tokens = n.split(' ').length;
  const out: MatchCandidate[] = [];
  for (const ix of pool) {
    let best = 0;
    let via = '';
    const consider = (form: string, key: string) => {
      const s = jaroWinkler(c, form);
      if (s > best) [best, via] = [s, key];
    };
    for (const [form, key] of ix.keys) consider(form, key);
    for (const part of [...ix.firsts, ix.family, ...ix.aliasParts]) if (part && part.split(' ').length === tokens) consider(compareForm(part), part);
    const fi = fuzzyInitials(n, ix);
    if (fi && fi.score > best) [best, via] = [fi.score, fi.via];
    if (best >= threshold) out.push({ athleteId: ix.athlete.id, score: best, type: 'fuzzy', via });
  }
  out.sort((x, y) => y.score - x.score || (x.athleteId < y.athleteId ? -1 : x.athleteId > y.athleteId ? 1 : 0));
  return out.slice(0, MAX_FUZZY_CANDIDATES);
}

function countWarning(count: number): string {
  return count === 2 ? 'two athletes matched' : `${count} athletes matched`;
}

/**
 * A bare name part: the input is the given / preferred name, or the family name, of an athlete who has
 * both (a one-name athlete's name is their full name), or one word of a multi-word alias (the same name
 * part in katakana or kanji: アイコ of テストフィールド アイコ). Such input is never confident.
 */
function partOnlyWarning(c: string, all: Indexed[]): string | null {
  if (all.some((ix) => ix.family && ix.firsts.some((f) => compareForm(f) === c))) return WARN_GIVEN_ONLY;
  if (all.some((ix) => ix.firsts.length && ix.family && compareForm(ix.family) === c)) return WARN_FAMILY_ONLY;
  if (all.some((ix) => ix.aliasParts.includes(c))) return WARN_PART_ONLY;
  return null;
}

/**
 * Match one pasted / typed name to the roster (spec 4.2). Ladder, stopping at the first level with an answer:
 * exact_alias / normalised (one athlete: confident; several: ambiguous) → initials (likewise) → fuzzy
 * (suggestions only, best first, at most 5) → unmatched (or outsider with `opts.outsiders`). Inactive athletes
 * are tried only when no active athlete matches. A given or family name on its own is never confident.
 */
export function matchName(input: string, roster: Athlete[], config: Config, opts: MatchOptions = {}): NameMatch {
  const n = normaliseName(input);
  if (!n) return { input, type: 'unmatched', candidates: [], warnings: ['empty name'] };
  const all = (roster ?? []).map(indexAthlete);
  const pools: [Indexed[], string[]][] = [
    [all.filter((ix) => ix.athlete.active !== false), []],
    [all.filter((ix) => ix.athlete.active === false), [WARN_INACTIVE]],
  ];
  const partOnly = partOnlyWarning(compareForm(n), all);
  const warnings = partOnly ? [partOnly] : [];

  if (!partOnly) {
    for (const [pool, extra] of pools) {
      const hits = confidentHits(input, n, pool);
      if (hits.length === 1) return { input, type: hits[0].type, athleteId: hits[0].athleteId, candidates: hits, warnings: [...extra] };
      if (hits.length > 1) return { input, type: 'ambiguous', candidates: hits, warnings: [countWarning(hits.length), ...extra] };
    }
  }
  for (const [pool, extra] of pools) {
    const hits = fuzzyHits(n, pool, config.input.fuzzyThreshold);
    if (hits.length) return { input, type: 'fuzzy', candidates: hits, warnings: [...warnings, ...extra] };
  }
  return { input, type: opts.outsiders ? 'outsider' : 'unmatched', candidates: [], warnings };
}

/**
 * Alias learning (spec 4.2 point 6): after the coach confirms a fuzzy or manual match, a copy of the athlete
 * with `raw` (trimmed) added to aliases. Null when it would teach nothing or teach a clash: empty, its
 * normalised form is already a key, it is a bare name part (given / preferred / family name, or one word of a
 * multi-word alias such as アイコ: never confident anyway), it is an initials form of this athlete (learning it
 * would hide a later clash with another athlete's initials), or, when `roster` is given, it is another
 * athlete's bare name part (never confident either) or already names another athlete confidently (an alias,
 * a name in either order, or initials): learning it would send that athlete's results here.
 */
export function withLearnedAlias(athlete: Athlete, raw: string, roster?: Athlete[]): Athlete | null {
  const alias = (raw ?? '').trim().replace(/\s+/g, ' ');
  const n = normaliseName(alias);
  if (!n) return null;
  const ix = indexAthlete(athlete);
  const c = compareForm(n);
  if (ix.keys.has(c) || ix.squashed.has(squash(c)) || ix.exact.has(exactForm(alias))) return null;
  if ([...ix.firsts, ix.family, ...ix.aliasParts].some((part) => part && compareForm(part) === c)) return null;
  if (initialsVia(n, ix)) return null;
  if (roster) {
    const others = roster.filter((a) => a.id !== athlete.id).map(indexAthlete);
    if (partOnlyWarning(c, others) || confidentHits(alias, n, others).length) return null;
  }
  return { ...athlete, aliases: [...(athlete.aliases ?? []), alias] };
}

/** When the year group is recorded: the academic year it refers to (default: the academic year of `asOf`). */
export interface DuplicateCheckOptions {
  asOf: ISODate;
  config: Config;
}

/**
 * Roster import duplicate check (spec 4.5): an athlete in the same year group whose name (either order,
 * given or preferred, or a stored alias) normalises to the candidate's name, spaces and punctuation aside.
 * Active athletes first. Year groups are compared in the same academic year: an athlete recorded as Y9 for
 * 2025 is the same year as a Y10 candidate for 2026. That needs both `yearGroupYear`s, or `at` (missing
 * years default to the academic year of at.asOf); otherwise the year groups are compared as written.
 */
export function findDuplicateAthlete(
  candidate: { givenName: string; familyName: string; preferredName?: string; yearGroup: YearGroup; yearGroupYear?: number },
  roster: Athlete[],
  at?: DuplicateCheckOptions,
): Athlete | undefined {
  const keys = nameKeys({ givenName: candidate.givenName, familyName: candidate.familyName, preferredName: candidate.preferredName ?? '', aliases: [] });
  const forms = new Set(keys.map(compareForm));
  const squashedForms = new Set(keys.map((k) => squash(compareForm(k))));
  if (!forms.size) return undefined;
  const defaultYear = at ? academicYearOf(at.asOf, at.config.age.academicYearStartMonth, at.config.age.academicYearStartDay) : undefined;
  const candYear = candidate.yearGroupYear ?? defaultYear;
  /** a's year group shifted into the candidate's academic year (not clamped: a Y13 from two years ago is "Y15"). */
  const sameYear = (a: Athlete): boolean => {
    if (a.yearGroup === 'Staff' || candidate.yearGroup === 'Staff') return a.yearGroup === candidate.yearGroup;
    const aYear = a.yearGroupYear ?? defaultYear;
    if (candYear === undefined || aYear === undefined) return a.yearGroup === candidate.yearGroup;
    return Number(a.yearGroup.slice(1)) + (candYear - aYear) === Number(candidate.yearGroup.slice(1));
  };
  const sameName = (a: Athlete): boolean => nameKeys(a).some((k) => forms.has(compareForm(k)) || squashedForms.has(squash(compareForm(k))));
  const same = (roster ?? []).filter((a) => sameYear(a) && sameName(a));
  return same.find((a) => a.active !== false) ?? same[0];
}
