import { describe, expect, it } from 'vitest';
import type { Athlete } from '../types';
import { DEFAULT_CONFIG, cloneConfig } from './config';
import { findDuplicateAthlete, jaroWinkler, matchName, nameKeys, normaliseName, toHiragana, withLearnedAlias } from './names';

const cfg = DEFAULT_CONFIG;

/** Invented athletes only. */
function athlete(p: Partial<Athlete> & Pick<Athlete, 'id' | 'givenName' | 'familyName'>): Athlete {
  return {
    preferredName: '',
    aliases: [],
    sex: 'F',
    yearGroup: 'Y9',
    displayMode: 'first_initial',
    absoluteBoardOptOut: false,
    avatar: { seed: 1, skinTone: 0, hairStyle: 0, hairColour: 0, kitColour: 'academy-navy', accessory: 'none' },
    active: true,
    ...p,
  };
}

const aiko = athlete({ id: 'a-aiko', givenName: 'Aiko', familyName: 'Testfield', aliases: ['テストフィールド アイコ', '試験 愛子'] });
const ben = athlete({ id: 'a-ben', givenName: 'Benjamin', preferredName: 'Ben', familyName: 'Sampleton', sex: 'M', yearGroup: 'Y10' });
const daichi = athlete({ id: 'a-daichi', givenName: 'Daichi', familyName: 'Ōsample', sex: 'M', yearGroup: 'Y11', aliases: ['見本大地'] });
const coach = athlete({ id: 'a-coach', givenName: 'Coach', familyName: 'Example', sex: 'M', yearGroup: 'Staff' });
const roster = [aiko, ben, daichi, coach];

const match = (input: string, r: Athlete[] = roster, c = cfg) => matchName(input, r, c);

describe('normaliseName', () => {
  it.each([
    ['TESTFIELD, Aiko', 'testfield aiko'], // comma → space, lowercase
    ['Ōno-Testfield', 'ono testfield'], // Ō → NFD O + U+0304 → macron stripped; hyphen → space
    ['ＡＩＫＯ　ＴＥＳＴＦＩＥＬＤ', 'aiko testfield'], // full-width romaji and ideographic space (NFKC)
    ['ﾃｽﾄﾌｨｰﾙﾄﾞ・ｱｲｺ', 'てすとふぃーるど あいこ'], // half-width → full-width katakana → hiragana; ・ → space
    ['ガッコウ', 'がっこう'], // ガ = カ + U+3099 under NFD: the dakuten must survive
    ['  Ben   (Sampleton). ', 'ben sampleton'],
    ['Hana O’Mockridge', 'hana o mockridge'],
    ['テストフィ-ルド', 'てすとふぃーるど'], // a dash typed after kana is a long-vowel mark
    ['試験　愛子', '試験 愛子'], // kanji untouched
    ['Strøm Æsample', 'strom aesample'], // letters NFD cannot decompose are folded
  ])('%s → %s', (input, out) => {
    expect(normaliseName(input)).toBe(out);
  });

  it('makes hiragana and katakana equivalent', () => {
    expect(normaliseName('アイコ')).toBe(normaliseName('あいこ'));
    expect(normaliseName('ｱｲｺ')).toBe(normaliseName('あいこ'));
  });
});

describe('toHiragana', () => {
  it('maps katakana 0x60 down and leaves everything else', () => {
    expect(toHiragana('アイコ')).toBe('あいこ');
    expect(toHiragana('ヴィ')).toBe('ゔぃ'); // ヴ 30F4 − 60 = 3094
    expect(toHiragana('ｱｲｺ')).toBe('あいこ'); // half-width goes through NFKC first
    expect(toHiragana('ヽヾ')).toBe('ゝゞ');
    expect(toHiragana('Aiko 愛子 ー')).toBe('Aiko 愛子 ー');
  });
});

describe('jaroWinkler', () => {
  it('reproduces the classic worked examples', () => {
    // MARTHA / MARHTA: m = 6, T/H swapped → 2 half-transpositions, t = 1.
    // Jaro = (6/6 + 6/6 + 5/6) / 3 = 0.94444; prefix "MAR" l = 3 → 0.94444 + 3 × 0.1 × 0.05556 = 0.96111
    expect(jaroWinkler('MARTHA', 'MARHTA')).toBeCloseTo(0.961111, 5);
    // DWAYNE / DUANE: m = 4 (D, A, N, E), t = 0. Jaro = (4/6 + 4/5 + 1) / 3 = 0.82222; l = 1 → 0.84
    expect(jaroWinkler('DWAYNE', 'DUANE')).toBeCloseTo(0.84, 5);
    // DIXON / DICKSONX: window = floor(8/2) − 1 = 3; m = 4 (D, I, O, N), t = 0.
    // Jaro = (4/5 + 4/8 + 1) / 3 = 0.76667; l = 2 → 0.76667 + 0.2 × 0.23333 = 0.81333
    expect(jaroWinkler('DIXON', 'DICKSONX')).toBeCloseTo(0.813333, 5);
  });

  it('handles identical, empty and disjoint strings', () => {
    expect(jaroWinkler('aiko', 'aiko')).toBe(1);
    expect(jaroWinkler('', '')).toBe(1);
    expect(jaroWinkler('aiko', '')).toBe(0);
    expect(jaroWinkler('abc', 'xyz')).toBe(0);
  });

  it('caps the prefix bonus at 4 characters', () => {
    // "aiko tesfield" (13) vs "aiko testfield" (14): window 6, all 13 match in order, t = 0.
    // Jaro = (13/13 + 13/14 + 13/13) / 3 = 0.976190; common prefix is 8 long but l = 4:
    // 0.976190 + 4 × 0.1 × 0.023810 = 0.985714
    expect(jaroWinkler('aiko tesfield', 'aiko testfield')).toBeCloseTo(0.985714, 5);
  });
});

describe('matchName: confident levels', () => {
  it('matches "given family" and family-name-first orders as normalised', () => {
    for (const input of ['Aiko Testfield', 'TESTFIELD Aiko', 'Testfield, Aiko']) {
      const m = match(input);
      expect(m.type).toBe('normalised');
      expect(m.athleteId).toBe('a-aiko');
      expect(m.warnings).toEqual([]);
    }
    expect(match('Testfield, Aiko').candidates[0].via).toBe('testfield aiko');
  });

  it('matches preferred name + family in either order', () => {
    expect(match('Ben Sampleton').athleteId).toBe('a-ben');
    expect(match('Sampleton Ben').athleteId).toBe('a-ben');
    expect(match('Benjamin Sampleton').athleteId).toBe('a-ben');
  });

  it('matches initials in every common form', () => {
    for (const input of ['Aiko T', 'A. Testfield', 'A Testfield', 'Testfield A', 'Testfield, A.']) {
      const m = match(input);
      expect(m.type, input).toBe('initials');
      expect(m.athleteId, input).toBe('a-aiko');
    }
    expect(match('Ben S').athleteId).toBe('a-ben'); // preferred name + family initial
    expect(match('B. Sampleton').athleteId).toBe('a-ben');
  });

  it('matches a stored katakana alias from hiragana and half-width katakana input', () => {
    // Half-width: NFKC turns ﾃｽﾄﾌｨｰﾙﾄﾞ ｱｲｺ into テストフィールド アイコ, exactly the stored alias.
    const half = match('ﾃｽﾄﾌｨｰﾙﾄﾞ ｱｲｺ');
    expect(half.type).toBe('exact_alias');
    expect(half.athleteId).toBe('a-aiko');
    expect(half.candidates[0].via).toBe('テストフィールド アイコ');
    // Hiragana: only equal after katakana → hiragana, so level 2.
    const hira = match('てすとふぃーるど あいこ');
    expect(hira.type).toBe('normalised');
    expect(hira.athleteId).toBe('a-aiko');
    // Two-token alias reversed, and written with ・
    expect(match('アイコ・テストフィールド').athleteId).toBe('a-aiko');
  });

  it('matches kanji only via stored aliases, with or without the space', () => {
    expect(match('試験 愛子')).toMatchObject({ type: 'exact_alias', athleteId: 'a-aiko' });
    expect(match('試験　愛子')).toMatchObject({ type: 'exact_alias', athleteId: 'a-aiko' }); // ideographic space → NFKC
    expect(match('試験愛子')).toMatchObject({ type: 'normalised', athleteId: 'a-aiko' }); // spaces removed for non-Latin
    expect(match('愛子 試験')).toMatchObject({ type: 'normalised', athleteId: 'a-aiko' }); // reversed alias
    // Stored without the space
    expect(match('見本大地')).toMatchObject({ type: 'exact_alias', athleteId: 'a-daichi' });
    expect(match('見本 大地')).toMatchObject({ type: 'normalised', athleteId: 'a-daichi' });
    // A kanji name nobody has stored is not matched (no reading is guessed)
    expect(match('模造 花子').type).toBe('unmatched');
  });

  it('ignores diacritics and full-width romaji', () => {
    expect(match('Daichi Osample')).toMatchObject({ type: 'normalised', athleteId: 'a-daichi' });
    expect(match('DAICHI ŌSAMPLE')).toMatchObject({ type: 'normalised', athleteId: 'a-daichi' });
    expect(match('ＡＩＫＯ　ＴＥＳＴＦＩＥＬＤ')).toMatchObject({ type: 'normalised', athleteId: 'a-aiko' });
    expect(match('Ｔｅｓｔｆｉｅｌｄ　Ａ．')).toMatchObject({ type: 'initials', athleteId: 'a-aiko' });
  });

  it('never lets a stored alias silently take another athlete\'s real name', () => {
    // "Hana Mockridge" is Hana's name, but also exactly an alias of Aiko's (a bad learned alias).
    // Levels 1 and 2 are taken together, so this is ambiguous, with the exact alias listed first.
    const hana = athlete({ id: 'a-hana', givenName: 'Hana', familyName: 'Mockridge' });
    const aikoAlias = { ...aiko, aliases: ['hana mockridge'] };
    const m = match('hana mockridge', [aikoAlias, hana]);
    expect(m).toMatchObject({ type: 'ambiguous', warnings: ['two athletes matched'] });
    expect(m.athleteId).toBeUndefined();
    expect(m.candidates.map((c) => [c.athleteId, c.type])).toEqual([
      ['a-aiko', 'exact_alias'],
      ['a-hana', 'normalised'],
    ]);
    expect(match('Hana Mockridge', [aikoAlias, hana])).toMatchObject({ type: 'ambiguous' }); // level 2 for both
    // With no clash the exact alias is confident
    expect(match('hana mockridge', [aikoAlias])).toMatchObject({ type: 'exact_alias', athleteId: 'a-aiko' });
  });
});

describe('matchName: ambiguous, fuzzy and unmatched', () => {
  it('reports ambiguous initials with no athleteId', () => {
    const tan = athlete({ id: 'a-tan', givenName: 'Aiko', familyName: 'Tanbridge' });
    const m = match('Aiko T', [aiko, tan]);
    expect(m.type).toBe('ambiguous');
    expect(m.athleteId).toBeUndefined();
    expect(m.candidates.map((c) => c.athleteId)).toEqual(['a-aiko', 'a-tan']);
    expect(m.candidates.every((c) => c.type === 'initials')).toBe(true);
    expect(m.warnings).toEqual(['two athletes matched']);

    const toll = athlete({ id: 'a-toll', givenName: 'Aiko', familyName: 'Tollmock' });
    expect(match('Aiko T', [aiko, tan, toll]).warnings).toEqual(['3 athletes matched']);
  });

  it('reports two athletes with the same full name as ambiguous', () => {
    const ben2 = athlete({ id: 'a-ben2', givenName: 'Ben', familyName: 'Sampleton', yearGroup: 'Y7' });
    const m = match('Ben Sampleton', [ben, ben2]);
    expect(m.type).toBe('ambiguous');
    expect(m.athleteId).toBeUndefined();
    expect(m.warnings).toContain('two athletes matched');
  });

  it('offers a typo only as a fuzzy suggestion', () => {
    const m = match('Aiko Tesfield');
    expect(m.type).toBe('fuzzy');
    expect(m.athleteId).toBeUndefined();
    expect(m.candidates).toHaveLength(1);
    expect(m.candidates[0]).toMatchObject({ athleteId: 'a-aiko', type: 'fuzzy', via: 'aiko testfield' });
    expect(m.candidates[0].score).toBeCloseTo(0.985714, 5); // worked in the jaroWinkler test above
  });

  it('takes the fuzzy threshold from config', () => {
    const strict = cloneConfig(cfg);
    strict.input.fuzzyThreshold = 0.99; // 0.9857 < 0.99
    expect(match('Aiko Tesfield', roster, strict).type).toBe('unmatched');
  });

  it('sorts fuzzy suggestions best first and keeps at most 5', () => {
    const fams = ['Testfielda', 'Testfieldab', 'Testfieldabc', 'Testfieldabcd', 'Testfieldabcde', 'Testfieldabcdef'];
    const many = fams.map((f, i) => athlete({ id: `a-${i}`, givenName: 'Aiko', familyName: f }));
    const m = match('Aiko Testfeld', many);
    expect(m.type).toBe('fuzzy');
    expect(m.candidates).toHaveLength(5);
    const scores = m.candidates.map((c) => c.score);
    expect([...scores].sort((x, y) => y - x)).toEqual(scores);
    expect(m.candidates[0].athleteId).toBe('a-0'); // the shortest family name is closest
  });

  it('never matches a given name on its own confidently', () => {
    const m = match('Aiko');
    expect(m.type).toBe('fuzzy');
    expect(m.athleteId).toBeUndefined();
    expect(m.candidates[0]).toMatchObject({ athleteId: 'a-aiko', score: 1, via: 'aiko' });
    expect(m.warnings).toEqual(['given name only: confirm the athlete']);
    // Even when "Aiko" has been stored as an alias
    const withAlias = { ...aiko, aliases: ['Aiko'] };
    expect(match('Aiko', [withAlias]).athleteId).toBeUndefined();
    // Preferred names count as given names
    expect(match('Ben').athleteId).toBeUndefined();
    expect(match('Ben').candidates[0].athleteId).toBe('a-ben');
  });

  it('leaves an outsider unmatched', () => {
    const m = match('Zed Outsiderson');
    expect(m).toEqual({ input: 'Zed Outsiderson', type: 'unmatched', candidates: [], warnings: [] });
    expect(match('   ').warnings).toEqual(['empty name']);
  });
});

describe('matchName: inactive athletes', () => {
  const oldHana = athlete({ id: 'a-hana-old', givenName: 'Hana', familyName: 'Mockridge', active: false, yearGroup: 'Y13' });
  const newHana = athlete({ id: 'a-hana-new', givenName: 'Hana', familyName: 'Mockridge', yearGroup: 'Y7' });

  it('matches an inactive athlete only when no active athlete matches, with a warning', () => {
    const m = match('Hana Mockridge', [oldHana, aiko]);
    expect(m).toMatchObject({ type: 'normalised', athleteId: 'a-hana-old' });
    expect(m.warnings).toEqual(['inactive athlete (no active athlete matched)']);
  });

  it('prefers the active athlete', () => {
    const m = match('Hana Mockridge', [oldHana, newHana]);
    expect(m).toMatchObject({ type: 'normalised', athleteId: 'a-hana-new', warnings: [] });
  });

  it('applies the same rule to fuzzy suggestions', () => {
    const m = match('Hana Mockrige', [oldHana]);
    expect(m.type).toBe('fuzzy');
    expect(m.warnings).toEqual(['inactive athlete (no active athlete matched)']);
    expect(match('Hana Mockrige', [oldHana, newHana]).candidates.map((c) => c.athleteId)).toEqual(['a-hana-new']);
  });
});

describe('withLearnedAlias', () => {
  it('adds a confirmed typo as an alias, once', () => {
    const learned = withLearnedAlias(aiko, '  Aiko   Tesfield ');
    expect(learned).not.toBeNull();
    expect(learned!.aliases).toEqual(['テストフィールド アイコ', '試験 愛子', 'Aiko Tesfield']);
    expect(aiko.aliases).toHaveLength(2); // the original is untouched
    // Next import: the same spelling is now an exact alias match
    expect(matchName('Aiko Tesfield', [learned!], cfg)).toMatchObject({ type: 'exact_alias', athleteId: 'a-aiko' });
    // No duplicates, in any case, order or script
    expect(withLearnedAlias(learned!, 'Aiko Tesfield')).toBeNull();
    expect(withLearnedAlias(learned!, 'TESFIELD, Aiko')).toBeNull(); // reversed two-token alias
  });

  it('refuses strings that are already keys or must never be confident', () => {
    expect(withLearnedAlias(aiko, 'Testfield, Aiko')).toBeNull(); // name key
    expect(withLearnedAlias(aiko, 'あいこ　てすとふぃーるど')).toBeNull(); // katakana alias, reversed, in hiragana
    expect(withLearnedAlias(aiko, '試験愛子')).toBeNull(); // kanji alias without the space
    expect(withLearnedAlias(aiko, 'Aiko')).toBeNull(); // bare given name
    expect(withLearnedAlias(aiko, 'Aiko T.')).toBeNull(); // initials form
    expect(withLearnedAlias(aiko, '  ')).toBeNull();
  });

  it('learns nicknames and new scripts', () => {
    expect(withLearnedAlias(aiko, 'Ai-chan')!.aliases).toContain('Ai-chan');
    expect(withLearnedAlias(ben, 'ベン サンプルトン')!.aliases).toEqual(['ベン サンプルトン']);
  });
});

describe('findDuplicateAthlete', () => {
  it('finds the same name in the same year group, in any order, case or spelling of diacritics', () => {
    expect(findDuplicateAthlete({ givenName: 'Aiko', familyName: 'TESTFIELD', yearGroup: 'Y9' }, roster)?.id).toBe('a-aiko');
    expect(findDuplicateAthlete({ givenName: 'Testfield', familyName: 'Aiko', yearGroup: 'Y9' }, roster)?.id).toBe('a-aiko'); // columns swapped
    expect(findDuplicateAthlete({ givenName: 'Daichi', familyName: 'Osample', yearGroup: 'Y11' }, roster)?.id).toBe('a-daichi');
    // School layout "Surname | Preferred Name": only the preferred name is known
    expect(findDuplicateAthlete({ givenName: '', familyName: 'Sampleton', preferredName: 'Ben', yearGroup: 'Y10' }, roster)?.id).toBe('a-ben');
  });

  it('does not match across year groups or different people', () => {
    expect(findDuplicateAthlete({ givenName: 'Aiko', familyName: 'Testfield', yearGroup: 'Y10' }, roster)).toBeUndefined();
    expect(findDuplicateAthlete({ givenName: 'Hana', familyName: 'Mockridge', yearGroup: 'Y9' }, roster)).toBeUndefined();
    expect(findDuplicateAthlete({ givenName: '', familyName: '', yearGroup: 'Y9' }, roster)).toBeUndefined();
  });

  it('prefers an active athlete when several share name and year', () => {
    const old = { ...aiko, id: 'a-aiko-old', active: false };
    expect(findDuplicateAthlete({ givenName: 'Aiko', familyName: 'Testfield', yearGroup: 'Y9' }, [old, aiko])?.id).toBe('a-aiko');
  });
});

describe('nameKeys', () => {
  it('lists both orders, aliases and reversed two-token aliases', () => {
    expect(nameKeys(aiko)).toEqual(['aiko testfield', 'testfield aiko', 'てすとふぃーるど あいこ', 'あいこ てすとふぃーるど', '試験 愛子', '愛子 試験']);
    expect(nameKeys(ben)).toEqual(['benjamin sampleton', 'sampleton benjamin', 'ben sampleton', 'sampleton ben']);
  });
});

// ---------------------------------------------------------------------------------------------
// Adversarial verification against spec 4.2 / 4.5 (each block names the rule it checks).

describe('initials (spec 4.2 "Takuto K", "T. Kobori") with awkward family and given names', () => {
  const hanaO = athlete({ id: 'a-hanao', givenName: 'Hana', familyName: "O'Mockridge" }); // normalises to "hana" + "o mockridge"
  const mary = athlete({ id: 'a-mary', givenName: 'Mary-Jane', familyName: 'Smith-Example' }); // "mary jane" + "smith example"
  const r = [hanaO, mary, aiko];

  it.each([
    // [input, athlete, via]
    ["H. O'Mockridge", 'a-hanao', 'o mockridge hana'], // "h" + full family "o mockridge" (its single "o" is not an initial)
    ["O'Mockridge H", 'a-hanao', 'o mockridge hana'], // single letters at both ends: the trailing "h" is the initial
    ["O'Mockridge, H.", 'a-hanao', 'o mockridge hana'],
    ['Hana O', 'a-hanao', 'hana o mockridge'], // family initials of "o mockridge" are "om": "o" is a leading part
    ["Hana O'M", 'a-hanao', 'hana o mockridge'], // "o m" = "om"
    ['M. J. Smith-Example', 'a-mary', 'smith example mary jane'], // given initials of "mary jane" are "mj"
    ['M.J. Smith-Example', 'a-mary', 'smith example mary jane'],
    ['M Smith-Example', 'a-mary', 'smith example mary jane'],
    ['Mary-Jane S. E.', 'a-mary', 'mary jane smith example'],
    ['Smith-Example M.', 'a-mary', 'smith example mary jane'],
  ])('%s → initials', (input, id, via) => {
    const m = match(input, r);
    expect(m.type, input).toBe('initials');
    expect(m.athleteId).toBe(id);
    expect(m.candidates[0].via).toBe(via);
  });

  it('refuses initials that do not fit', () => {
    expect(match('M. K. Smith-Example', r).type).not.toBe('initials'); // "mk" is not a leading part of "mj"
    expect(match('J. Smith-Example', r).type).not.toBe('initials'); // "j" is Jane's initial, not Mary-Jane's first
    expect(match('Hana M', r).type).not.toBe('initials'); // the family initial is "o", not "m"
    expect(match('A B', r).type).toBe('unmatched'); // two initials and no full name part
  });
});

describe('punctuation dropped by a timing system (spec 4.2 "strip punctuation")', () => {
  const hanaO = athlete({ id: 'a-hanao', givenName: 'Hana', familyName: "O'Mockridge" });
  const mary = athlete({ id: 'a-mary', givenName: 'Mary-Jane', familyName: 'Smith-Example' });
  const r = [hanaO, mary, aiko];

  it.each([
    ['Hana OMockridge', 'a-hanao', 'hana o mockridge'], // "hanaomockridge" either way
    ['OMOCKRIDGE, Hana', 'a-hanao', 'o mockridge hana'],
    ['Hana O Mockridge', 'a-hanao', 'hana o mockridge'], // the plain level-2 form
    ['MaryJane SmithExample', 'a-mary', 'mary jane smith example'],
    ['Maryjane Smith Example', 'a-mary', 'mary jane smith example'],
  ])('%s → normalised', (input, id, via) => {
    expect(match(input, r)).toMatchObject({ type: 'normalised', athleteId: id, candidates: [{ via }] });
  });

  it('still answers with the spaced form first', () => {
    expect(match('Aiko Testfield', r).candidates[0].via).toBe('aiko testfield');
  });

  it('never squashes two words into a one-word alias', () => {
    const benAlias = { ...ben, aliases: ['Benji'] };
    expect(match('Ben Ji', [benAlias]).athleteId).toBeUndefined();
    expect(match('Benji', [benAlias])).toMatchObject({ type: 'exact_alias', athleteId: 'a-ben' });
  });
});

describe('a single name part is never confident (spec 4.2 "Fuzzy matches are suggestions only")', () => {
  it('flags a bare family name, even one stored as an alias', () => {
    const benAlias = { ...ben, aliases: ['Sampleton'] };
    const m = match('Sampleton', [aiko, benAlias]);
    expect(m.type).toBe('fuzzy');
    expect(m.athleteId).toBeUndefined();
    expect(m.warnings).toEqual(['family name only: confirm the athlete']);
    expect(m.candidates[0]).toMatchObject({ athleteId: 'a-ben', score: 1 });
  });

  it('matches a one-name athlete (no family name) by that name', () => {
    const kiri = athlete({ id: 'a-kiri', givenName: 'Kiri', familyName: '' });
    expect(match('Kiri', [kiri, aiko])).toMatchObject({ type: 'normalised', athleteId: 'a-kiri', warnings: [] });
    // ... but not when another athlete has Kiri as a given name
    const kiriT = athlete({ id: 'a-kiri-t', givenName: 'Kiri', familyName: 'Testfield' });
    const m = match('Kiri', [kiri, kiriT]);
    expect(m.type).toBe('fuzzy');
    expect(m.warnings).toEqual(['given name only: confirm the athlete']);
    expect(m.candidates.map((c) => c.athleteId)).toEqual(['a-kiri', 'a-kiri-t']); // tie on 1.0: by id
  });
});

describe('fuzzy threshold and ordering (spec 4.2 "Jaro–Winkler ≥ 0.88")', () => {
  const nora = athlete({ id: 'a-nora', givenName: 'Nora', familyName: 'Quill' }); // key "nora quill", 10 characters

  it('includes a suggestion at exactly 0.88', () => {
    // "nora quabc" vs "nora quill": both 10 long, window = floor(10/2) − 1 = 4.
    // Matches n, o, r, a, space, q, u = 7 (the a of "abc" is outside the window of the used a); t = 0.
    // Jaro = (7/10 + 7/10 + 7/7) / 3 = 0.8; prefix "nora" l = 4 → 0.8 + 4 × 0.1 × 0.2 = 0.88
    expect(jaroWinkler('nora quabc', 'nora quill')).toBe(0.88);
    const m = match('Nora Quabc', [nora]);
    expect(m.type).toBe('fuzzy');
    expect(m.candidates[0].score).toBe(0.88);
  });

  it('excludes one just below', () => {
    // "nora qxbcd": 6 matches. Jaro = (0.6 + 0.6 + 1) / 3 = 0.7333; + 0.4 × 0.2667 = 0.84 < 0.88
    expect(jaroWinkler('nora qxbcd', 'nora quill')).toBeCloseTo(0.84, 9);
    expect(match('Nora Qxbcd', [nora]).type).toBe('unmatched');
  });

  it('breaks ties by athlete id', () => {
    const h1 = athlete({ id: 'a-h2', givenName: 'Hana', familyName: 'Mockridge' });
    const h2 = athlete({ id: 'a-h1', givenName: 'Hana', familyName: 'Mockridge', yearGroup: 'Y7' });
    const m = match('Hana Mockrige', [h1, h2]);
    expect(m.type).toBe('fuzzy');
    expect(m.candidates[0].score).toBe(m.candidates[1].score);
    expect(m.candidates.map((c) => c.athleteId)).toEqual(['a-h1', 'a-h2']);
  });

  it('copes with an empty roster', () => {
    expect(match('Aiko Testfield', [])).toEqual({ input: 'Aiko Testfield', type: 'unmatched', candidates: [], warnings: [] });
  });
});

describe('outsiders (spec 4.2 point 5)', () => {
  it('types a name that matches nobody as an outsider when the rows are a results table', () => {
    expect(matchName('Zed Outsiderson', roster, cfg, { outsiders: true })).toEqual({ input: 'Zed Outsiderson', type: 'outsider', candidates: [], warnings: [] });
    // a near miss is still a suggestion, and confident matches are unchanged
    expect(matchName('Aiko Tesfield', roster, cfg, { outsiders: true }).type).toBe('fuzzy');
    expect(matchName('Aiko Testfield', roster, cfg, { outsiders: true })).toMatchObject({ type: 'normalised', athleteId: 'a-aiko' });
    // the default stays 'unmatched', and an empty cell is never an outsider
    expect(matchName('Zed Outsiderson', roster, cfg).type).toBe('unmatched');
    expect(matchName(' ', roster, cfg, { outsiders: true }).type).toBe('unmatched');
  });
});

describe('alias learning against the roster (spec 4.2 point 6)', () => {
  const hana = athlete({ id: 'a-hana', givenName: 'Hana', familyName: 'Mockridge' });
  const r = [aiko, hana];

  it('refuses a string that already names another athlete', () => {
    expect(withLearnedAlias(aiko, 'Hana Mockridge', r)).toBeNull(); // Hana's name
    expect(withLearnedAlias(aiko, 'MOCKRIDGE, Hana', r)).toBeNull(); // either order
    expect(withLearnedAlias(aiko, 'H. Mockridge', r)).toBeNull(); // Hana's initials
    const hanaAlias = { ...hana, aliases: ['Hanamo'] };
    expect(withLearnedAlias(aiko, 'Hanamo', [aiko, hanaAlias])).toBeNull(); // Hana's stored alias
  });

  it('still learns a genuine typo, and without a roster behaves as before', () => {
    expect(withLearnedAlias(aiko, 'Aiko Tesfield', r)!.aliases).toContain('Aiko Tesfield');
    expect(withLearnedAlias(aiko, 'Hana Mockridge')!.aliases).toContain('Hana Mockridge');
    expect(withLearnedAlias(aiko, 'Aiko TestField', r)).toBeNull(); // only case differs from a key
    expect(withLearnedAlias({ ...aiko, familyName: "O'Testfield" }, 'Aiko OTestfield', r)).toBeNull(); // already matches squashed
  });
});

describe('roster duplicates across academic years (spec 4.5 "name + year")', () => {
  const asOf = '2026-10-22'; // academic year 2026 (from 1 September)
  const at = { asOf, config: cfg };
  // Imported last year as Y9 (academic year 2025): Y10 this year
  const aiko25 = { ...aiko, yearGroupYear: 2025 };

  it('compares year groups in the same academic year', () => {
    // 9 + (2026 − 2025) = 10
    expect(findDuplicateAthlete({ givenName: 'Aiko', familyName: 'Testfield', yearGroup: 'Y10', yearGroupYear: 2026 }, [aiko25])?.id).toBe('a-aiko');
    expect(findDuplicateAthlete({ givenName: 'Aiko', familyName: 'Testfield', yearGroup: 'Y10' }, [aiko25], at)?.id).toBe('a-aiko');
    // a Y9 Aiko this year is a different (younger) athlete
    expect(findDuplicateAthlete({ givenName: 'Aiko', familyName: 'Testfield', yearGroup: 'Y9' }, [aiko25], at)).toBeUndefined();
  });

  it('does not clamp at Y13: a graduate is not this year\'s Y13', () => {
    const grad = { ...aiko, id: 'a-grad', yearGroup: 'Y13' as const, yearGroupYear: 2024, active: false };
    // 13 + (2026 − 2024) = 15 ≠ 13
    expect(findDuplicateAthlete({ givenName: 'Aiko', familyName: 'Testfield', yearGroup: 'Y13' }, [grad], at)).toBeUndefined();
  });

  it('keeps Staff as Staff and falls back to the written year group without years', () => {
    const staff = { ...coach, yearGroupYear: 2020 };
    expect(findDuplicateAthlete({ givenName: 'Coach', familyName: 'Example', yearGroup: 'Staff' }, [staff], at)?.id).toBe('a-coach');
    expect(findDuplicateAthlete({ givenName: 'Aiko', familyName: 'Testfield', yearGroup: 'Y9' }, [aiko25])?.id).toBe('a-aiko'); // no candidate year, no `at`
  });

  it('ignores dropped punctuation in names', () => {
    const mary = athlete({ id: 'a-mary', givenName: 'Mary-Jane', familyName: 'Smith-Example' });
    expect(findDuplicateAthlete({ givenName: 'Maryjane', familyName: 'Smithexample', yearGroup: 'Y9' }, [mary])?.id).toBe('a-mary');
  });

  it('copes with an empty roster', () => {
    expect(findDuplicateAthlete({ givenName: 'Aiko', familyName: 'Testfield', yearGroup: 'Y9' }, [], at)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------
// Adversarial verification, round 2: each block is a deviation that was found and fixed.

describe('a bare name part in another script is never confident either (spec 4.2)', () => {
  // Aiko's aliases テストフィールド アイコ and 試験 愛子 are two-part names: アイコ / 愛子 are her given name,
  // テストフィールド / 試験 her family name, written in katakana and kanji.
  it('treats one part of a two-part alias as a bare name part', () => {
    const m = match('アイコ');
    expect(m.type).toBe('fuzzy');
    expect(m.athleteId).toBeUndefined();
    expect(m.candidates[0]).toMatchObject({ athleteId: 'a-aiko', score: 1, via: 'あいこ' });
    expect(m.warnings).toEqual(['one part of a name only: confirm the athlete']);
    // kanji parts used to get no suggestion at all
    expect(match('試験')).toMatchObject({ type: 'fuzzy', candidates: [{ athleteId: 'a-aiko', score: 1, via: '試験' }] });
    expect(match('愛子').candidates.map((c) => c.athleteId)).toEqual(['a-aiko']);
  });

  it('stays unconfident when that part was stored as an alias of its own', () => {
    // "Aiko" alone is never confident, even as a stored alias; アイコ alone used to be an exact_alias match
    const stored = { ...aiko, aliases: [...aiko.aliases, 'アイコ'] };
    const m = match('アイコ', [stored, ben]);
    expect(m.type).toBe('fuzzy');
    expect(m.athleteId).toBeUndefined();
    expect(m.warnings).toEqual(['one part of a name only: confirm the athlete']);
  });

  it('leaves full names and one-word nicknames confident', () => {
    expect(match('テストフィールド アイコ')).toMatchObject({ type: 'exact_alias', athleteId: 'a-aiko' });
    const nick = { ...aiko, aliases: [...aiko.aliases, 'アイコン'] };
    expect(match('アイコン', [nick, ben])).toMatchObject({ type: 'exact_alias', athleteId: 'a-aiko' });
  });
});

describe('alias learning never stores a bare name part (spec 4.2 point 6)', () => {
  it('refuses a part of this athlete\'s name in any script', () => {
    expect(withLearnedAlias(aiko, 'アイコ')).toBeNull();
    expect(withLearnedAlias(aiko, 'テストフィールド')).toBeNull();
    expect(withLearnedAlias(aiko, '試験')).toBeNull();
  });

  it('refuses another athlete\'s bare name: it could never match confidently, so it would teach nothing', () => {
    const r = [aiko, ben];
    expect(withLearnedAlias(aiko, 'Ben', r)).toBeNull(); // Ben's preferred name (it used to be learned)
    expect(withLearnedAlias(aiko, 'Sampleton', r)).toBeNull(); // his family name
    // a one-word nickname is still learned
    expect(withLearnedAlias(aiko, 'Aikkon', r)!.aliases).toContain('Aikkon');
    expect(withLearnedAlias(aiko, 'あいちゃん', r)!.aliases).toContain('あいちゃん');
  });
});

describe('initials with a typo are offered as fuzzy suggestions (spec 4.2 initials + Jaro–Winkler ≥ 0.88)', () => {
  it.each([
    // [input, athlete, via, score]
    // "D. Osampel": "d" fits Daichi; JW("osampel", "osample"): m = 7, the e/l swap is 2 half-transpositions (t = 1).
    // Jaro = (7/7 + 7/7 + 6/7) / 3 = 0.952381; prefix "osam" (4) → 0.952381 + 0.4 × 0.047619 = 0.971429
    ['D. Osampel', 'a-daichi', 'osample daichi', 0.971429],
    // "A. Tesfield": "a" fits Aiko; JW("tesfield", "testfield"): m = 8, t = 0, window 3.
    // Jaro = (8/8 + 8/9 + 8/8) / 3 = 0.962963; prefix "tes" (3) → 0.962963 + 0.3 × 0.037037 = 0.974074
    ['A. Tesfield', 'a-aiko', 'testfield aiko', 0.974074],
  ] as const)('%s → %s', (input, id, via, score) => {
    // both used to be unmatched: the whole input against "daichi osample" is only 0.79
    const m = match(input);
    expect(m.type).toBe('fuzzy');
    expect(m.athleteId).toBeUndefined();
    expect(m.candidates[0]).toMatchObject({ athleteId: id, via, type: 'fuzzy' });
    expect(m.candidates[0].score).toBeCloseTo(score, 5);
  });

  it('needs the initial itself to fit', () => {
    // "z" is nobody's initial, so a spelled-out family name alone is not enough
    expect(match('Z. Testfield').type).toBe('unmatched');
    expect(match('Hana Z').type).toBe('unmatched');
    // and the threshold still comes from config: 0.9714 < 0.98
    const strict = cloneConfig(cfg);
    strict.input.fuzzyThreshold = 0.98;
    expect(match('D. Osampel', roster, strict).type).toBe('unmatched');
  });
});
