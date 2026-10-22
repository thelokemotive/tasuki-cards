import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, cloneConfig } from './config';
import * as format from './format';
import { findTimeInText, findTimeProblemInText, formatDelta, formatPace, formatTime, paceWarning, parseTime } from './time';

/** parseTime, expecting success. */
function sec(input: string, context: 'time' | 'any' = 'time'): number {
  const r = parseTime(input, { context });
  if (!r.ok) throw new Error(`expected "${input}" to parse, got: ${r.error}`);
  return r.sec;
}

describe('parseTime: accepted forms (spec 3.1)', () => {
  it.each([
    // [input, seconds, normalized]
    ['16:15', 975, '16:15'], // 16×60 + 15
    ['1:02:33', 3753, '1:02:33'], // 3600 + 2×60 + 33
    ['0:16:15', 975, '16:15'], // 0 h, 16 min 15 s
    ['16m15s', 975, '16:15'],
    ['16m 15s', 975, '16:15'],
    ['16 min 15', 975, '16:15'], // unitless number after minutes = seconds
    ['16 mins 15 secs', 975, '16:15'],
    ['16min15sec', 975, '16:15'],
    ['16 min. 15 sec.', 975, '16:15'],
    ['16 minutes, 15 seconds', 975, '16:15'],
    ['975s', 975, '16:15'], // 975 = 16×60 + 15
    ['975 sec', 975, '16:15'],
    ['7\'45"', 465, '7:45'], // 7×60 + 45
    ['7′45″', 465, '7:45'], // prime marks 7′45″
    ['7’45”', 465, '7:45'], // curly quotes 7’45”
    ["7'45''", 465, '7:45'], // two apostrophes as the seconds mark
    ['１６：１５', 975, '16:15'], // full-width １６：１５
    ['１：０２：３３', 3753, '1:02:33'], // full-width １：０２：３３
    ['16分15秒', 975, '16:15'],
    ['1時間2分33秒', 3753, '1:02:33'],
    ['１６分１５秒', 975, '16:15'], // full-width digits with kanji units
    ['十六分十五秒', 975, '16:15'], // kanji numerals: 十六 = 16, 十五 = 15
    ['一時間二分三十三秒', 3753, '1:02:33'], // 三十三 = 3×10 + 3
    ['  16:15  ', 975, '16:15'],
    ['9:45:00', 35100, '9:45:00'], // 9×3600 + 45×60
    ['8:10', 490, '8:10'], // 8×60 + 10
    ['4:52', 292, '4:52'], // 4×60 + 52
    ['1h 2m 33s', 3753, '1:02:33'],
    ['1hr 2', 3720, '1:02:00'], // unitless after hours = minutes: 3600 + 2×60
    ['90 min', 5400, '1:30:00'], // 90×60
    ['16.5 min', 990, '16:30'], // decimal minutes: 16.5×60
    ['20 m', 1200, '20:00'], // a time field: m is minutes
  ] as const)('%s → %i s', (input, expected, normalized) => {
    const r = parseTime(input);
    expect(r).toMatchObject({ ok: true, sec: expected, normalized });
  });

  it('keeps fractional seconds', () => {
    // 16×60 + 15.4 = 975.4
    const r = parseTime('16:15.4');
    expect(r.ok && r.sec).toBeCloseTo(975.4, 9);
    expect(r.ok && r.normalized).toBe('16:15.4');
    // 3753 + 0.25
    expect(parseTime('1:02:33.25')).toMatchObject({ ok: true, normalized: '1:02:33.25' });
    expect(sec('975.4s')).toBeCloseTo(975.4, 9);
  });

  it('reads "16.15" as minutes.seconds only in a time column', () => {
    const t = parseTime('16.15', { context: 'time' });
    expect(t).toMatchObject({ ok: true, sec: 975, normalized: '16:15' });
    expect(t.warnings).toEqual(['Read "16.15" as 16:15 (minutes.seconds)']);
    // 'time' is the default context
    expect(parseTime('16.15')).toMatchObject({ ok: true, sec: 975 });
    // 1.02.33 → 3600 + 120 + 33
    expect(parseTime('1.02.33')).toMatchObject({ ok: true, sec: 3753 });

    const any = parseTime('16.15', { context: 'any' });
    expect(any.ok).toBe(false);
    expect(!any.ok && any.error).toBe('"16.15" looks like a decimal number, not a time: write 16:15 (a dot is read as minutes.seconds only in a time column)');
  });

  it('reads spoken times from dictation (spec 4.4)', () => {
    expect(sec('seven fifty five')).toBe(475); // 7×60 + 55
    expect(sec('eight minutes ten')).toBe(490); // 8×60 + 10
    expect(sec('one hour two minutes thirty three')).toBe(3753); // 3600 + 120 + 33
    expect(sec('sixteen fifteen')).toBe(975); // 16×60 + 15
    expect(sec('four fifty-two')).toBe(292); // 4×60 + 52
    expect(sec('four fifty two')).toBe(292);
    expect(sec('nine hours forty five')).toBe(35100); // 9×3600 + 45×60
    expect(parseTime('nine hours forty five')).toMatchObject({ normalized: '9:45:00' });
    expect(sec('twenty one oh five')).toBe(1265); // 21×60 + 5
    expect(sec('sixteen minutes and fifteen seconds')).toBe(975);
    expect(sec('forty five seconds')).toBe(45);
    expect(sec('seven oh five')).toBe(425); // 7×60 + 5
    expect(sec('seven nought five')).toBe(425);
    expect(sec('twenty‑one zero five')).toBe(1265); // non-breaking hyphen
    expect(sec('one oh two thirty three')).toBe(3753); // three bare numbers = h mm ss
    expect(sec('an hour and five minutes')).toBe(3900); // 3600 + 5×60
    expect(sec('a minute ten')).toBe(70);
    expect(sec('sixteen min 15')).toBe(975); // words and digits mixed
    expect(sec('seven fifty five seconds')).toBe(475); // a unit on the last number only
  });

  it('tolerates dictation capitals and a closing full stop', () => {
    expect(parseTime('Seven Fifty Five.')).toMatchObject({ ok: true, sec: 475, warnings: [] });
    expect(parseTime('16:15.')).toMatchObject({ ok: true, sec: 975 });
  });

  it('defaults to DEFAULT_CONFIG and honours a custom config', () => {
    // DEFAULT_CONFIG.input.minTimeSec = 20, so 45 s is fine
    expect(parseTime('45s').ok).toBe(true);
    const strict = cloneConfig(DEFAULT_CONFIG);
    strict.input.minTimeSec = 60;
    const r = parseTime('45s', { config: strict });
    expect(r).toMatchObject({ ok: false, error: 'Implausible time 0:45 (shorter than 1:00)' });
  });
});

describe('parseTime: rejected, never silently', () => {
  it.each([
    ['16:75', 'Seconds must be below 60 in "16:75"'],
    ['1:65:00', 'Minutes must be below 60 in "1:65:00"'],
    ['1:02:75', 'Seconds must be below 60 in "1:02:75"'],
    ['16:155', 'Seconds need two digits in "16:155"'],
    ['abc', '"abc" is not a time (try 16:15, 1:02:33 or 16m15s)'],
    ['Aiko Testfield 16:15', '"Aiko Testfield 16:15" is not a time (try 16:15, 1:02:33 or 16m15s)'],
    ['', 'No time entered'],
    ['   ', 'No time entered'],
    // config.input.minTimeSec = 20: 0:05 = 5 s
    ['0:05', 'Implausible time 0:05 (shorter than 0:20)'],
    ['0:00', 'Implausible time 0:00 (shorter than 0:20)'],
    // config.input.maxTimeSec = 48 h = 172 800 s; 49:00:00 = 176 400 s (h:mm:00 with h >= 10 also gets the Excel hint)
    ['49:00:00', 'Implausible time 49:00:00 (longer than 48:00:00); if it came from Excel it may mean 49:00 (minutes:seconds)'],
    ['3000 min', 'Implausible time 50:00:00 (longer than 48:00:00)'], // 3000×60 = 180 000 s
    ['16.75', 'Seconds must be below 60 in "16.75" (for decimal minutes write 16.75 min)'],
    // 16.5: 16:05, or 16.5 decimal minutes = 16×60 + 30 = 16:30, or 16:50
    ['16.5', '"16.5" is ambiguous (16:05, 16:30 or 16:50?): write it with a colon'],
    ['975', '"975" has no units: write it as m:ss (16:15) or with units (975s, 16 min)'],
    ['1615', '"1615" has no units: did you mean 16:15? (for seconds write 1615s)'],
    ['seven', '"seven" has no units: write it as m:ss (16:15) or with units (975s, 16 min)'],
    ['15 s 16 min', 'Units out of order in "15 s 16 min"'],
    ['16 min 75 s', 'Seconds must be below 60 in "16 min 75 s"'],
    ['1 h 75 min', 'Minutes must be below 60 in "1 h 75 min"'],
    ['seven seventy', 'Seconds must be below 60 in "seven seventy"'],
    ['1.5 h 10 min', 'Only the last number in "1.5 h 10 min" can have a decimal point'],
    ['1 2 3 4', 'Too many numbers in "1 2 3 4" to read as a time'],
    ['-16:15', '"-16:15" is not a time (try 16:15, 1:02:33 or 16m15s)'],
  ])('%j', (input, error) => {
    expect(parseTime(input)).toMatchObject({ ok: false, error });
  });

  it('treats non-strings as empty', () => {
    expect(parseTime(undefined as unknown as string)).toMatchObject({ ok: false, error: 'No time entered' });
  });
});

describe('parseTime: accepted with a warning when ambiguous', () => {
  it.each([
    // [input, seconds, warning]
    ['16:5', 965, 'Read "16:5" as 16:05 (seconds should have two digits)'], // 16×60 + 5
    ['1:2:33', 3753, 'Read "1:2:33" as 1:02:33'],
    ['75:30', 4530, 'Read "75:30" as 75 min 30 s (1:15:30)'], // 75×60 + 30
    // Excel shows a typed 16:15 as 16:15:00 (16 h 15 min = 58 500 s)
    ['16:15:00', 58500, 'Read "16:15:00" as 16 h 15 min; if it came from Excel it may mean 16:15 (minutes:seconds)'],
    ['seven five', 425, 'Read "seven five" as 7:05'], // could be 7:50
    ['16 15', 975, 'Read "16 15" as 16:15 (minutes then seconds)'],
    ['one two thirty three', 3753, 'Read "one two thirty three" as 1:02:33 (hours, minutes and seconds)'],
    ['seventy five ten', 4510, 'Read "seventy five ten" as 75 min 10 s (1:15:10)'], // 75×60 + 10
  ] as const)('%s', (input, expected, warning) => {
    expect(parseTime(input)).toMatchObject({ ok: true, sec: expected, warnings: [warning] });
  });

  it('does not warn on clean input', () => {
    for (const s of ['16:15', '9:45:00', '16m15s', 'seven fifty five', 'twenty one oh five', '16分15秒']) {
      expect(parseTime(s).warnings).toEqual([]);
    }
  });
});

describe('findTimeInText', () => {
  /** Expect a match whose raw text is `raw`, located where it sits in `text`. */
  function expectFound(text: string, raw: string, expectedSec: number) {
    const m = findTimeInText(text);
    expect(m).not.toBeNull();
    expect(m!.raw).toBe(raw);
    expect(m!.sec).toBe(expectedSec);
    expect(m!.start).toBe(text.indexOf(raw));
    expect(m!.end).toBe(text.indexOf(raw) + raw.length);
    expect(text.slice(m!.start, m!.end)).toBe(raw);
  }

  it('reads the Tasuki line format (spec 4.3)', () => {
    expectFound('Aiko Testfield, 8:10, leg 2, team Peregrine', '8:10', 490);
    expectFound('Ben Sampleton, 7:55, leg 4, team Golden Eagle, raced earlier', '7:55', 475);
    expectFound('Ben Sampleton 4:52', '4:52', 292);
    expectFound('Aiko Testfield 16:15', '16:15', 975);
    expectFound('Coach Example 9:45:00', '9:45:00', 35100);
    // "Aiko Testfield, " is 16 characters, so 8:10 spans [16, 20)
    expect(findTimeInText('Aiko Testfield, 8:10, leg 2, team Peregrine')).toMatchObject({ start: 16, end: 20 });
  });

  it.each([
    '# event: Hachimantai Ekiden | 2026-11-01 | relay_leg | 2.0 km | climb 20 m',
    '# event: Campus Circuit | 2026-11-04 | circuit',
    '# event: Higashi-Matsushima XC | 2026-11-29 | race | 4.0 km | place 7/23',
    '# test: bleep | 2026-11-10',
    '# participation: saturday_run | 2026-11-07',
    '# event: Chiang Mai Trail 64K | 2026-12-20 | race | 64 km | climb 2800 m',
    'Ben Sampleton 64 laps',
    'Aiko Testfield ankle 11 calf 18 stork 22 hop yes',
    'Aiko Testfield, Ben Sampleton',
    'Hana Mockridge Y9 aged 14 place 7 leg 2',
    'Hana Mockridge year nine leg two place seven',
    'climb 20 m, 2.0km, 4.0 km, 64 km',
    'Ben Sampleton 800 m 15 laps', // metres, not minutes
    'stork 22 s',
    '"Aiko Testfield","42"', // a closing CSV quote is not a seconds mark
    'Ben Sampleton 7 55', // bare digit pairs are not times in free text
    'Aiko Testfield 8:10 am', // clock time
    'Aiko Testfield 8:10am',
    'leg 2 of 7',
    'Aiko Testfield 16.15', // a dot is not a time outside a time column
    'Ben Sampleton ran a minute behind',
    '',
  ])('finds no time in %j', (text) => {
    expect(findTimeInText(text)).toBeNull();
  });

  it('skips places, dates, legs and distances before the time', () => {
    expectFound('place 7/23 Aiko Testfield 16:15', '16:15', 975);
    expectFound('2026-11-29 Aiko Testfield 4.0 km 16:15', '16:15', 975);
    expectFound('Hana Mockridge Y9 leg 2 1500m 4:52', '4:52', 292);
    // A Forms timestamp is a clock time: "10:15:30" right after a date is skipped
    expectFound('2026-11-07 10:15:30, Aiko Testfield, 5 km, 24:10', '24:10', 1450); // 24×60 + 10
    // Paces are not times
    expectFound('Aiko Testfield 3:15/km 16:15', '16:15', 975);
    expectFound('Aiko Testfield 4 min/km, 16 min 15 s', '16 min 15 s', 975);
    expect(findTimeInText('Ben Sampleton 5:30 per mile')).toBeNull();
  });

  it('reads unit, prime-mark, Japanese and full-width times inside text', () => {
    expectFound('Aiko Testfield 16m15s leg 2', '16m15s', 975);
    expectFound('Ben Sampleton 16 min 15', '16 min 15', 975);
    expectFound('Ben Sampleton 16m15', '16m15', 975);
    expectFound('Hana Mockridge 7′45″', '7′45″', 465);
    expectFound("Hana Mockridge 7'45", "7'45", 465);
    expectFound('"Aiko Testfield","7:55"', '7:55', 475);
    expectFound('テスト 16分15秒', '16分15秒', 975);
    expectFound('7位 テスト 1時間2分33秒', '1時間2分33秒', 3753);
    // Normalised positions map back to the original full-width characters: アイコ + full-width space = 4
    expectFound('アイコ　１６：１５', '１６：１５', 975);
    expectFound('Ben Sampleton 1h 5m', '1h 5m', 3900); // 3600 + 5×60
  });

  it('reads spoken times inside dictated text (spec 4.4)', () => {
    expectFound('Aiko Testfield seven fifty five leg two', 'seven fifty five', 475);
    expectFound('Ben Sampleton leg two eight minutes ten', 'eight minutes ten', 490);
    expectFound('Hana Mockridge sixteen minutes and fifteen seconds', 'sixteen minutes and fifteen seconds', 975);
    expectFound('Ben Sampleton, forty five seconds', 'forty five seconds', 45);
    expectFound('Coach Example nine hours forty five', 'nine hours forty five', 35100);
    expectFound('Aiko Testfield twenty one oh five', 'twenty one oh five', 1265);
    expectFound('Ben Sampleton team Seven four fifty-two', 'four fifty-two', 292);
    expectFound('Ben Sampleton an hour and two minutes', 'an hour and two minutes', 3720);
  });

  it('prefers a clear time over an earlier bare spoken pair', () => {
    // "one two" alone would be 1:02, but 16:15 is a clearer time
    expectFound('Ben Sampleton one two, 16:15', '16:15', 975);
    expect(findTimeInText('Ben Sampleton one two')).toMatchObject({ raw: 'one two', sec: 62 });
  });

  it('reads "16.15" in text when told it is a time column', () => {
    const m = findTimeInText('Aiko Testfield 16.15', { context: 'time' });
    expect(m).toMatchObject({ sec: 975, raw: '16.15', warnings: ['Read "16.15" as 16:15 (minutes.seconds)'] });
    expect(findTimeInText('Aiko Testfield 21.10 km', { context: 'time' })).toBeNull();
  });

  it('skips rejected times and explains them', () => {
    expect(findTimeInText('Aiko Testfield 16:75')).toBeNull();
    expect(findTimeProblemInText('Aiko Testfield 16:75')).toEqual({ start: 15, end: 20, raw: '16:75', error: 'Seconds must be below 60 in "16:75"' });
    expect(findTimeProblemInText('Ben Sampleton 0:05')).toMatchObject({ raw: '0:05', error: 'Implausible time 0:05 (shorter than 0:20)' });
    expect(findTimeProblemInText('Ben Sampleton 16:5')).toMatchObject({ error: 'Seconds need two digits in "16:5"' });
    // an implausible token is passed over for a good one
    expectFound('Ben Sampleton 0:05 16:15', '16:15', 975);
    expect(findTimeProblemInText('Aiko Testfield 16:15')).toBeNull();
    expect(findTimeProblemInText('Ben Sampleton 64 laps')).toBeNull();
  });
});

describe('paceWarning (spec 4.2)', () => {
  const cfg = DEFAULT_CONFIG; // 2:30/km (150 s) to 12:00/km (720 s)

  it('flags implausibly fast and slow paces', () => {
    // 4:20 over 2.0 km: 260 / 2 = 130 s/km = 2:10/km
    expect(paceWarning(260, 2.0, cfg)).toBe('Implausible pace 2:10/km (faster than 2:30/km)');
    // 1:00:00 over 4 km: 3600 / 4 = 900 s/km = 15:00/km
    expect(paceWarning(3600, 4, cfg)).toBe('Implausible pace 15:00/km (slower than 12:00/km)');
    // 4:52 over 0.3 km (Circuit typed as 0.3 by mistake): 292 / 0.3 = 973.3 → shown as 16:14/km (rounded up)
    expect(paceWarning(292, 0.3, cfg)).toBe('Implausible pace 16:14/km (slower than 12:00/km)');
  });

  it('accepts plausible paces, including the limits themselves', () => {
    expect(paceWarning(975, 4.0, cfg)).toBeNull(); // 243.75 s/km = 4:04/km
    expect(paceWarning(35100, 64, cfg)).toBeNull(); // 9:45:00 over 64 km = 548.4 s/km
    expect(paceWarning(300, 2, cfg)).toBeNull(); // exactly 150 s/km
    expect(paceWarning(1440, 2, cfg)).toBeNull(); // exactly 720 s/km
  });

  it('shows a pace just past the limit on the far side of it', () => {
    // 299 / 2 = 149.5 s/km: floor → 2:29/km, never "2:30/km (faster than 2:30/km)"
    expect(paceWarning(299, 2, cfg)).toBe('Implausible pace 2:29/km (faster than 2:30/km)');
  });

  it('ignores missing distances and uses the given config', () => {
    expect(paceWarning(975, 0, cfg)).toBeNull();
    expect(paceWarning(975, Number.NaN, cfg)).toBeNull();
    const c = cloneConfig(cfg);
    c.input.slowestPaceSecPerKm = 900; // 15:00/km
    expect(paceWarning(3600, 4, c)).toBeNull();
  });
});

describe('re-exports', () => {
  it('re-exports the shared formatters', () => {
    expect(formatTime).toBe(format.formatTime);
    expect(formatPace).toBe(format.formatPace);
    expect(formatDelta).toBe(format.formatDelta);
  });
});

// ---------------------------------------------------------------------------------------------
// Adversarial verification against spec 3.1, 4.2–4.4 and 11 (each block names the rule it checks).

describe('spec 4.3: the whole example block, line by line (invented names)', () => {
  // [line, seconds or null]. Times: 8×60+10 = 490, 7×60+55 = 475, 4×60+52 = 292, 16×60+15 = 975, 9×3600+45×60 = 35 100
  const block: [string, number | null][] = [
    ['# event: Hachimantai Ekiden | 2026-11-01 | relay_leg | 2.0 km | climb 20 m', null],
    ['Aiko Testfield, 8:10, leg 2, team Peregrine', 490],
    ['Ben S, 7:55, leg 4, team Golden Eagle, raced earlier', 475],
    ['# event: Campus Circuit | 2026-11-04 | circuit', null],
    ['Ben Sampleton 4:52', 292],
    ['# event: Higashi-Matsushima XC | 2026-11-29 | race | 4.0 km | place 7/23', null],
    ['Aiko Testfield 16:15', 975],
    ['# test: bleep | 2026-11-10', null],
    ['Ben Sampleton 64 laps', null],
    ['# test: arm | 2026-11-10', null],
    ['Aiko Testfield ankle 11 calf 18 stork 22 hop yes', null],
    ['# participation: saturday_run | 2026-11-07', null],
    ['Aiko Testfield, Ben Sampleton', null],
    ['# event: Chiang Mai Trail 64K | 2026-12-20 | race | 64 km | climb 2800 m', null],
    ['Coach Example 9:45:00', 35100],
  ];

  it.each(block)('%s', (line, expected) => {
    const m = findTimeInText(line);
    if (expected === null) expect(m).toBeNull();
    else expect(m).toMatchObject({ sec: expected, warnings: [] });
    // no line in the block raises a false "rejected time" either
    expect(findTimeProblemInText(line)).toBeNull();
  });

  it('parses each time token on its own, cleanly', () => {
    for (const [token, s] of [['8:10', 490], ['7:55', 475], ['4:52', 292], ['16:15', 975], ['9:45:00', 35100]] as const) {
      expect(parseTime(token)).toEqual({ ok: true, sec: s, normalized: token, warnings: [] });
    }
  });
});

describe('spec 3.1: limits are inclusive and come from config', () => {
  it.each([
    // config.input.minTimeSec = 20, maxTimeSec = 172 800 (48 h)
    ['0:20', true],
    ['20s', true],
    ['0:19', false],
    ['0:19.9', false], // 19.9 < 20
    ['19.99s', false],
    ['172800s', true],
    ['2880 min', true], // 2880 × 60 = 172 800
    ['48 h', true],
    ['172801s', false],
    ['48:00:01', false],
  ] as const)('%s → ok %s', (input, ok) => {
    expect(parseTime(input).ok).toBe(ok);
  });

  it('applies the same limits inside text', () => {
    expect(findTimeInText('Hana Mockridge 0:20')).toMatchObject({ sec: 20 });
    expect(findTimeProblemInText('Hana Mockridge 0:19')).toMatchObject({ error: 'Implausible time 0:19 (shorter than 0:20)' });
  });
});

describe('spec 3.1 "never silently": rejected spoken times in text are reported', () => {
  it('reports a spoken pair that cannot be a time', () => {
    expect(findTimeInText('Aiko Testfield seven seventy')).toBeNull();
    // "Aiko Testfield " is 15 characters
    expect(findTimeProblemInText('Aiko Testfield seven seventy')).toEqual({ start: 15, end: 28, raw: 'seven seventy', error: 'Seconds must be below 60 in "seven seventy"' });
    // zero ten = 10 s < 20 s
    expect(findTimeProblemInText('Hana Mockridge zero ten')).toMatchObject({ raw: 'zero ten', error: 'Implausible time 0:10 (shorter than 0:20)' });
  });

  it('raises no problem on lines without times', () => {
    for (const line of [
      'Hana Mockridge year nine leg two place seven',
      'Hana Mockridge Y9 aged 14 place 7 leg 2',
      'Ben Sampleton ran a minute behind',
      'leg 2 of 7',
      'Ben Sampleton 7 55',
      '順位\t氏名\t所属\t記録\tタイム', // a Japanese results header (spec 4.2)
      'Place,Name,Club,Time',
    ]) {
      expect(findTimeInText(line), line).toBeNull();
      expect(findTimeProblemInText(line), line).toBeNull();
    }
  });

  it('gives every rejection a reason', () => {
    for (const input of ['16:75', '4.5', '16.5', '1615', 'abc', 'DNF', '-', '16:15 s', '1:02:33 min', 'seven seventy', '1:02:33:44', '16;15']) {
      const r = parseTime(input);
      expect(r.ok, input).toBe(false);
      expect(!r.ok && r.error.length > 0, input).toBe(true);
    }
  });
});

describe('time column dots (spec 3.1 "16.15 when context is a time column")', () => {
  it('reads "16.0" as 16:00, which is not ambiguous', () => {
    // 16:00, 16.0 decimal minutes and 16:00 again are all 16 × 60 = 960 s
    expect(parseTime('16.0')).toEqual({ ok: true, sec: 960, normalized: '16:00', warnings: ['Read "16.0" as 16:00 (minutes.seconds)'] });
    expect(parseTime('4.0')).toMatchObject({ ok: true, sec: 240 });
    // still refused outside a time column
    expect(parseTime('16.0', { context: 'any' }).ok).toBe(false);
  });
});

describe('Japanese results: hundredths after the seconds mark (spec 4.2 記録 / タイム columns)', () => {
  it.each([
    // 4×60 + 5 + 0.32 = 245.32
    ["4'05\"32", 245.32, '4:05.32'],
    ['4′05″32', 245.32, '4:05.32'],
    // 16×60 + 15 + 0.3 = 975.3
    ['16分15秒3', 975.3, '16:15.3'],
    ['１６分１５秒３', 975.3, '16:15.3'],
    // 1:02:33 + 0.05
    ['1時間2分33秒05', 3753.05, '1:02:33.05'],
  ] as const)('%s → %s s', (input, s, normalized) => {
    const r = parseTime(input);
    expect(r.ok && r.sec).toBeCloseTo(s, 9);
    expect(r.ok && r.normalized).toBe(normalized);
  });

  it('reads them inside text too, keeping the hundredths in the raw match', () => {
    const m = findTimeInText('7 テスト 安比 4\'05"32 2位');
    expect(m).toMatchObject({ raw: '4\'05"32' });
    expect(m!.sec).toBeCloseTo(245.32, 9);
  });

  it('refuses digits that are not hundredths', () => {
    expect(parseTime("4'05\"1234").ok).toBe(false); // four digits after the mark
    expect(parseTime("4'05\" 32").ok).toBe(false); // a separate number, not glued
  });
});

describe('typed variants a coach might use', () => {
  it.each([
    ['16∶15', 975], // ratio sign from a PDF font
    ['16꞉15', 975], // modifier letter colon
    ['16:15 min', 975], // a unit that agrees with m:ss
    ['16:15mins', 975],
    ['1:02:33 hrs', 3753], // a unit that agrees with h:mm:ss
    ['7ʹ45ʺ', 465], // modifier letter primes
  ] as const)('%s → %i s', (input, s) => {
    expect(parseTime(input)).toMatchObject({ ok: true, sec: s });
  });

  it('refuses a unit that disagrees with the colon form', () => {
    // "16:15 h" is hours and minutes (see "h:mm h" below), never 16:15 as m:ss
    expect(parseTime('16:15 h')).toMatchObject({ ok: true, sec: 58500, warnings: ['Read "16:15 h" as 16 h 15 min'] });
    expect(parseTime('1:02:33 min').ok).toBe(false);
    expect(parseTime('16:15 s').ok).toBe(false);
    expect(parseTime('16:15 pb')).toMatchObject({ ok: false, error: '"16:15 pb" is not a time (try 16:15, 1:02:33 or 16m15s)' });
  });
});

describe('Excel hints (h:mm:00 that was typed as mm:ss)', () => {
  it('adds the hint to a range error as well as to an accepted reading', () => {
    // 49 h 30 min > 48 h: refused, but the likely meaning (49:30, a 10K) is suggested
    expect(parseTime('49:30:00')).toMatchObject({
      ok: false,
      error: 'Implausible time 49:30:00 (longer than 48:00:00); if it came from Excel it may mean 49:30 (minutes:seconds)',
    });
    expect(findTimeProblemInText('Hana Mockridge 49:30:00')).toMatchObject({
      raw: '49:30:00',
      error: 'Implausible time 49:30:00 (longer than 48:00:00); if it came from Excel it may mean 49:30 (minutes:seconds)',
    });
    // 24:10:00 = 87 000 s is within 48 h: accepted with the warning
    expect(parseTime('24:10:00')).toMatchObject({ ok: true, sec: 87000, warnings: ['Read "24:10:00" as 24 h 10 min; if it came from Excel it may mean 24:10 (minutes:seconds)'] });
    // no hint for short h:mm:00 or non-zero seconds
    expect(parseTime('9:45:00').warnings).toEqual([]);
    expect(parseTime('49:30:01')).toMatchObject({ ok: false, error: 'Implausible time 49:30:01 (longer than 48:00:00)' });
  });
});

describe('paceWarning: degenerate inputs', () => {
  it('ignores zero, negative and non-finite times', () => {
    expect(paceWarning(0, 2, DEFAULT_CONFIG)).toBeNull();
    expect(paceWarning(-300, 2, DEFAULT_CONFIG)).toBeNull();
    expect(paceWarning(Number.POSITIVE_INFINITY, 2, DEFAULT_CONFIG)).toBeNull();
    expect(paceWarning(975, -4, DEFAULT_CONFIG)).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// Adversarial verification, round 2: each block is a deviation that was found and fixed.

describe('time column dots inside text (spec 3.1 "16.15 when context is a time column")', () => {
  it('reads h.mm.ss whole, never just its first two fields', () => {
    // 1.02.33 = 3600 + 2×60 + 33 = 3753 s (it used to be read as "1.02" = 1:02 = 62 s)
    const m = findTimeInText('Aiko Testfield 1.02.33', { context: 'time' });
    expect(m).toMatchObject({ sec: 3753, raw: '1.02.33', warnings: ['Read "1.02.33" as 1:02:33 (hours.minutes.seconds)'] });
    // "16.15.3" is not h.mm.ss (one-digit seconds): reported, not read as 16:15
    expect(findTimeInText('Aiko Testfield 16.15.3', { context: 'time' })).toBeNull();
    expect(findTimeProblemInText('Aiko Testfield 16.15.3', { context: 'time' })).toMatchObject({
      raw: '16.15.3',
      error: '"16.15.3" is not a time (try 16:15, 1:02:33 or 16m15s)',
    });
  });

  it('reports a dotted value it cannot read instead of dropping it silently', () => {
    // parseTime refuses these with a reason; findTimeInText in a time column must say the same
    expect(findTimeInText('Aiko Testfield 16.5', { context: 'time' })).toBeNull();
    expect(findTimeProblemInText('Aiko Testfield 16.5', { context: 'time' })).toMatchObject({
      raw: '16.5',
      error: '"16.5" is ambiguous (16:05, 16:30 or 16:50?): write it with a colon',
    });
    expect(findTimeProblemInText('Aiko Testfield 16.75', { context: 'time' })).toMatchObject({
      raw: '16.75',
      error: 'Seconds must be below 60 in "16.75" (for decimal minutes write 16.75 min)',
    });
    // a clear time later in the line still wins
    expect(findTimeInText('Aiko Testfield 16.5 16:15', { context: 'time' })).toMatchObject({ sec: 975, raw: '16:15' });
    // distances are still not times, and "4.0" (most likely a distance) is passed over quietly
    expect(findTimeProblemInText('Aiko Testfield 21.75 km', { context: 'time' })).toBeNull();
    expect(findTimeInText('Aiko Testfield 4.0', { context: 'time' })).toBeNull();
    expect(findTimeProblemInText('Aiko Testfield 4.0', { context: 'time' })).toBeNull();
    // outside a time column nothing changes: a dotted number is not a time and not a problem
    expect(findTimeProblemInText('Aiko Testfield 16.5')).toBeNull();
    expect(findTimeInText('Aiko Testfield 1.02.33')).toBeNull();
  });
});

describe('a unit word after a colon time (spec 3.1 "never silently")', () => {
  it('reads a glued unit that agrees, as parseTime does', () => {
    // 16×60 + 15 = 975 (it used to find no time at all in "16:15min")
    expect(findTimeInText('Aiko Testfield 16:15min')).toMatchObject({ sec: 975, raw: '16:15min', start: 15, end: 23 });
    expect(findTimeInText('Aiko Testfield 16:15mins, leg 2')).toMatchObject({ sec: 975, raw: '16:15mins' });
    expect(findTimeInText('Ben Sampleton 1:02:33hrs')).toMatchObject({ sec: 3753, raw: '1:02:33hrs' });
    // with a space the unit is part of the match too
    expect(findTimeInText('Aiko Testfield 16:15 min')).toMatchObject({ sec: 975, raw: '16:15 min' });
  });

  it('reads "h:mm h" as hours and minutes, with a warning', () => {
    // European results: "9:45 h" = 9 h 45 min = 9×3600 + 45×60 = 35 100 s (in text it used to be read as 9:45 = 585 s)
    expect(parseTime('9:45 h')).toEqual({ ok: true, sec: 35100, normalized: '9:45:00', warnings: ['Read "9:45 h" as 9 h 45 min'] });
    expect(parseTime('16:15 hrs')).toMatchObject({ ok: true, sec: 58500 }); // 16×3600 + 15×60
    expect(parseTime('9:45h')).toMatchObject({ ok: true, sec: 35100 });
    expect(findTimeInText('Coach Example 9:45 h')).toMatchObject({ sec: 35100, raw: '9:45 h', warnings: ['Read "9:45 h" as 9 h 45 min'] });
    // the h:mm rules still apply: minutes below 60, two digits, no fraction
    expect(parseTime('9:75 h')).toMatchObject({ ok: false, error: 'Minutes must be below 60 in "9:75 h"' });
    expect(parseTime('9:5 h')).toMatchObject({ ok: false, error: 'Minutes need two digits in "9:5 h"' });
    expect(parseTime('9:45.5 h')).toMatchObject({ ok: false, error: 'Units do not fit the colon time in "9:45.5 h"' });
  });

  it('refuses a unit that cannot fit, in a field and in text', () => {
    const error = 'Units do not fit the colon time in "16:15 s"';
    expect(parseTime('16:15 s')).toMatchObject({ ok: false, error });
    expect(parseTime('1:02:33 min')).toMatchObject({ ok: false, error: 'Units do not fit the colon time in "1:02:33 min"' });
    // in text it used to be read as 16:15, ignoring the "s"
    expect(findTimeInText('Aiko Testfield 16:15 s')).toBeNull();
    expect(findTimeProblemInText('Aiko Testfield 16:15 s')).toMatchObject({ raw: '16:15 s', error });
    expect(findTimeProblemInText('Aiko Testfield 16:15s')).toMatchObject({ raw: '16:15s', error: 'Units do not fit the colon time in "16:15s"' });
  });

  it('never takes the start of a name after the time for a unit', () => {
    // time-first rows: a spaced unit must end the cell (end, punctuation, a tab or a number), not start a name
    expect(findTimeInText('16:15 H. Mockridge')).toMatchObject({ sec: 975, raw: '16:15', warnings: [] });
    expect(findTimeInText('16:15 H Mockridge')).toMatchObject({ sec: 975, raw: '16:15' });
    expect(findTimeInText('16:15 Min Testfield')).toMatchObject({ sec: 975, raw: '16:15' });
    expect(findTimeInText('16:15 S Testfield')).toMatchObject({ sec: 975, raw: '16:15' });
    expect(findTimeProblemInText('16:15 S Testfield')).toBeNull();
    // a unit that ends its cell still counts
    expect(findTimeInText('9:45 h, Coach Example')).toMatchObject({ sec: 35100, raw: '9:45 h' });
    expect(findTimeInText('9:45 h\tCoach Example')).toMatchObject({ sec: 35100, raw: '9:45 h' });
    expect(findTimeInText('Aiko Testfield 16:15 min. leg 2')).toMatchObject({ sec: 975, raw: '16:15 min' });
    expect(findTimeInText('Aiko Testfield 16:15 min 2nd')).toMatchObject({ sec: 975, raw: '16:15 min' });
  });

  it('still skips clock times and other glued letters', () => {
    expect(findTimeInText('Aiko Testfield 8:10am')).toBeNull();
    expect(findTimeProblemInText('Aiko Testfield 8:10am')).toBeNull();
    expect(findTimeInText('Aiko Testfield 4:05 min/km')).toBeNull(); // a pace
    expect(findTimeInText('Aiko Testfield 16:15 PB')).toMatchObject({ sec: 975, raw: '16:15' });
    expect(findTimeInText('Aiko Testfield 16:15 hop yes')).toMatchObject({ sec: 975, raw: '16:15' }); // "hop" is not "h"
  });
});

describe('a date before a time (spec 4.2: Forms CSV exports)', () => {
  it.each([
    // [line, raw, seconds]: a date column straight before the time column is not a timestamp
    ['Aiko Testfield,2026-11-05,24:10', '24:10', 1450], // 24×60 + 10
    ['Aiko Testfield,2026-11-05,16:15', '16:15', 975],
    ['Aiko Testfield 05/11/2026, 24:10', '24:10', 1450],
    // 24 cannot be a clock hour, so 24:10 after a date is a result
    ['Aiko Testfield 2026-11-05 24:10', '24:10', 1450],
  ] as const)('%s → %s', (line, raw, s) => {
    expect(findTimeInText(line)).toMatchObject({ raw, sec: s });
  });

  it.each([
    // each line starts with a clock timestamp, so the result is the later 24:10 (24×60 + 10 = 1450)
    '2026-11-07 10:15:30, Aiko Testfield, 24:10',
    '2026-11-07T10:15:30,Aiko Testfield,24:10',
    '11/7/26 10:15:30\tAiko Testfield\t24:10', // Microsoft Forms, pasted from Excel
    '7 Nov 2026 10:15, Aiko Testfield, 24:10',
    '07-Nov-26 10:15 Aiko Testfield 24:10',
    'Nov 7, 2026 10:15:30, Aiko Testfield, 24:10',
    '2026年11月7日 10:15:30 テスト アイコ 24:10',
  ])('skips the timestamp in %j', (line) => {
    expect(findTimeInText(line)).toMatchObject({ raw: '24:10', sec: 1450 });
  });
});

describe('dictated initials before a spoken time (spec 4.4)', () => {
  it('does not read an initial "O" as a leading zero', () => {
    // "Hana O " is 7 characters: the time starts at 7, not at the "O"
    expect(findTimeInText('Hana O seven fifty five')).toMatchObject({ raw: 'seven fifty five', sec: 475, start: 7, end: 23 });
    expect(findTimeInText('Hana Oh seven fifty five')).toMatchObject({ raw: 'seven fifty five', sec: 475 });
    // "oh" after a number is still a leading zero: 7×60 + 5 = 425
    expect(findTimeInText('Hana Mockridge seven oh five')).toMatchObject({ raw: 'seven oh five', sec: 425 });
    expect(parseTime('seven o five')).toMatchObject({ ok: true, sec: 425 });
  });
});

describe('Japanese dictation with kanji numerals inside text (spec 4.4, ja-JP)', () => {
  it.each([
    ['アイコ 七分五十五秒', '七分五十五秒', 475], // 7×60 + 55
    ['アイコ 十六分十五秒', '十六分十五秒', 975], // 16×60 + 15
    ['アイコ 七分五十五', '七分五十五', 475], // seconds mark left off
    ['一郎 一時間二分三十三秒', '一時間二分三十三秒', 3753], // 3600 + 120 + 33
    ['健一 7分55秒', '7分55秒', 475], // the 一 of the name is not a number
  ] as const)('%s → %s', (line, raw, s) => {
    expect(findTimeInText(line)).toMatchObject({ raw, sec: s });
  });

  it('leaves kanji numerals in names alone', () => {
    expect(findTimeInText('三上 一郎')).toBeNull();
    expect(findTimeProblemInText('三上 一郎 十五')).toBeNull();
  });
});

describe('Excel hint with a zero fraction', () => {
  it('warns on h:mm:00.0 as on h:mm:00', () => {
    // 16 h 15 min = 58 500 s; ".0" adds nothing, so Excel may still have turned 16:15 into 16:15:00.0
    expect(parseTime('16:15:00.0')).toMatchObject({
      ok: true,
      sec: 58500,
      warnings: ['Read "16:15:00.0" as 16 h 15 min; if it came from Excel it may mean 16:15 (minutes:seconds)'],
    });
    expect(parseTime('16:15:00.5').warnings).toEqual([]); // a real fraction: not an Excel artefact
    const over = parseTime('49:30:00.00');
    expect(over.ok).toBe(false);
    expect(!over.ok && over.error).toBe('Implausible time 49:30:00 (longer than 48:00:00); if it came from Excel it may mean 49:30 (minutes:seconds)');
  });
});
