// Build the roster from pasted results (go-live plan 3): an unmatched or outsider row can become a new
// athlete in one action. Sex is read from the category or sex column, the club column says whether the
// runner is one of ours ("Our school" names in Settings), and the name as written is kept as an alias
// when it is not in Latin script (kanji, kana), so the next results table matches it exactly.
import type { Athlete, Sex, YearGroup } from '../../types';
import { defaultAvatar } from '../avatarDefaults';
import { normaliseName } from '../names';

/** What the coach confirms before a new athlete is created. */
export interface NewAthleteDraft {
  /** Normalised name as written: every review row with this key becomes the same new athlete. */
  key: string;
  /** The name exactly as it appeared in the results. */
  asWritten: string;
  givenName: string;
  familyName: string;
  preferredName: string;
  sex?: Sex;
  yearGroup?: YearGroup;
  aliases: string[];
}

const LATIN = /\p{Script=Latin}/u;
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]/u;

/**
 * Sex from a category or sex cell: 男子/女子, 男/女, M/F, Men/Women, Boys/Girls, Male/Female, Ladies,
 * and age categories such as M40, F18, U15 Boys, 中学女子. Undefined when the text says neither, or both.
 */
export function inferSex(text: string | undefined): Sex | undefined {
  if (!text) return undefined;
  const t = text.normalize('NFKC').toLowerCase();
  const female = /女|\b(women|womens|woman|girls?|female|ladies|lady)\b|(^|[^a-z])[fw](\d|\b)/.test(t);
  const male = /男|\b(men|mens|man|boys?|male)\b|(^|[^a-z])m(\d|\b)/.test(t);
  if (female && !male) return 'F';
  if (male && !female) return 'M';
  return undefined;
}

/** "Our school" names until the coach sets their own in Settings → Data (the coach's examples). */
export const DEFAULT_OUR_SCHOOL = ['Harrow', 'ハロウ', '安比', 'Appi'];

/** The stored names, or the defaults when none have been saved (an empty list means "none"). */
export function ourSchoolNames(meta: { ourSchoolNames?: string[] }): string[] {
  return meta.ourSchoolNames ?? DEFAULT_OUR_SCHOOL;
}

/** True when a club / team / school cell names our school (any of the Settings names, case and width ignored). */
export function isOurSchool(club: string | undefined, names: string[] | undefined): boolean {
  if (!club || !names?.length) return false;
  const c = normaliseName(club).replace(/\s+/g, '');
  return names.some((n) => {
    const k = normaliseName(n).replace(/\s+/g, '');
    return k.length > 0 && c.includes(k);
  });
}

const cap = (w: string) => (w ? w[0].toLocaleUpperCase('en-GB') + w.slice(1).toLocaleLowerCase('en-GB') : w);
const isUpperWord = (w: string) => w.length > 1 && w === w.toLocaleUpperCase('en-GB') && w !== w.toLocaleLowerCase('en-GB');

/**
 * A first proposal for the new athlete's names, from the name as written:
 * - "YAMADA Hanako" / "Hanako YAMADA" (results tables write the family name in capitals) → Hanako Yamada;
 * - "Yamada, Hanako" → Hanako Yamada; "Aiko Testfield" → given Aiko, family Testfield;
 * - kanji or kana ("山田 花子") → family 山田, given 花子 (Japanese order), with the name as written kept
 *   as an alias. The coach can type the romaji names in the dialog.
 */
export function proposeNewAthlete(asWritten: string, sex?: Sex): NewAthleteDraft {
  const name = asWritten.normalize('NFKC').replace(/\s+/g, ' ').trim();
  const key = normaliseName(name);
  let given = '';
  let family = '';
  const aliases: string[] = [];
  if (!LATIN.test(name) && CJK.test(name)) {
    const parts = name.split(' ');
    if (parts.length >= 2) {
      family = parts[0];
      given = parts.slice(1).join(' ');
    } else given = name;
    aliases.push(asWritten.trim());
  } else if (name.includes(',')) {
    const [f, ...g] = name.split(',');
    family = f.trim();
    given = g.join(' ').trim();
  } else {
    const parts = name.split(' ');
    if (parts.length === 1) given = parts[0];
    else if (isUpperWord(parts[0]) && !isUpperWord(parts[parts.length - 1])) {
      family = parts[0];
      given = parts.slice(1).join(' ');
    } else {
      given = parts.slice(0, -1).join(' ');
      family = parts[parts.length - 1];
    }
    const fix = (s: string) => (isUpperWord(s.replace(/[\s'-]/g, '')) ? s.split(/([\s'-])/).map(cap).join('') : s);
    given = fix(given);
    family = fix(family);
    // A capitalised family name ("YAMADA Hanako") is a different spelling from the athlete's name: keep it.
    if (name !== `${given} ${family}`.trim() && name !== `${family} ${given}`.trim() && isUpperWord(name.replace(/[\s,'-]/g, ''))) aliases.push(asWritten.trim());
  }
  return { key, asWritten: asWritten.trim(), givenName: given, familyName: family, preferredName: given, sex, aliases };
}

/** Ready to create: a first name, a sex and a year group. */
export function draftProblem(d: NewAthleteDraft): string | undefined {
  if (!(d.preferredName || d.givenName).trim()) return 'a first name is needed';
  if (!d.sex) return 'choose the sex';
  if (!d.yearGroup) return 'choose the year group';
  return undefined;
}

/** The athlete record for a confirmed draft (same defaults as a new athlete typed into the roster). */
export function athleteFromDraft(d: NewAthleteDraft, id: string, createdAt: string, yearGroupYear: number): Athlete {
  const givenName = d.givenName.trim() || d.preferredName.trim();
  const aliases = [...new Set(d.aliases.map((a) => a.trim()).filter((a) => a && normaliseName(a) !== normaliseName(`${givenName} ${d.familyName}`)))];
  return {
    id,
    givenName,
    familyName: d.familyName.trim(),
    preferredName: d.preferredName.trim() || givenName,
    aliases,
    sex: d.sex ?? 'F',
    yearGroup: d.yearGroup ?? 'Y7',
    yearGroupYear,
    displayMode: 'first_initial',
    absoluteBoardOptOut: false,
    avatar: defaultAvatar(id),
    active: true,
    createdAt,
  };
}
