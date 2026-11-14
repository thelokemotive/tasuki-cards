// parkrun results pages, copied straight from the browser (Ctrl+A, Ctrl+C on the results page).
// parkrun offers no CSV, and the copied page puts each finisher across several lines:
//   1 ⏎ Name ⏎ 32 finishes | … ⏎ Male ⏎ 1/20 ⏎ VM40-44 ⏎ 79.32% age grade ⏎ 17:44 ⏎ Personal best: 17:25
// It works in English, in Japanese and through Chrome's page translation (which turns "21" into
// "twenty one"). The result is a tab-separated table with headers the table parser already reads.

const TIME_ONLY = /^\d{1,2}:\d{2}(:\d{2})?$/;
/** parkrun age categories: JM11-14, SW30-34, VM40-44, JW10, VW70+, MWC/WWC (wheelchair). */
const AGE_CAT = /^([JSV])([MW])(\d{2}(-\d{2}|\+)?|---)$|^[MW]WC$/;
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** "21", "twenty one", "twenty-one", "第21位" → 21. */
export function rankOf(line: string): number | undefined {
  const t = line.normalize('NFKC').trim().toLowerCase().replace(/[位.第]/g, '').trim();
  if (/^\d{1,4}$/.test(t)) return Number(t);
  const words = t.split(/[\s-]+/).filter((w) => w && w !== 'and');
  if (!words.length || words.length > 4) return undefined;
  let n = 0;
  for (const w of words) {
    if (w === 'hundred') n = (n || 1) * 100;
    else if (ONES.includes(w)) n += ONES.indexOf(w);
    else if (TENS.includes(w)) n += TENS.indexOf(w) * 10;
    else return undefined;
  }
  return n || undefined;
}

export function looksLikeParkrun(text: string): boolean {
  if (!/park\s*run|パークラン/i.test(text)) return false;
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  return lines.filter((l) => AGE_CAT.test(l)).length >= 2 && lines.filter((l) => TIME_ONLY.test(l)).length >= 2;
}

/** 11/14/26, 14/11/2026, 2026/11/14, 2026年11月14日 → the reading that is on or before today and nearest to it (parkruns are Saturdays). */
export function parkrunDate(s: string, today: string): string | undefined {
  const t = s.normalize('NFKC');
  const jp = /(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/.exec(t);
  const m = jp ? null : /(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})/.exec(t);
  const iso = (y: number, mo: number, d: number) => (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? `${y < 100 ? 2000 + y : y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` : undefined);
  const cands: string[] = [];
  if (jp) cands.push(iso(+jp[1], +jp[2], +jp[3])!);
  else if (m) {
    const [a, b, c] = [+m[1], +m[2], +m[3]];
    if (m[1].length === 4) cands.push(iso(a, b, c)!);
    else cands.push(iso(c, b, a)!, iso(c, a, b)!); // day/month/year, month/day/year
  }
  const valid = cands.filter((d): d is string => !!d && !Number.isNaN(Date.parse(d)) && d <= today);
  const sat = valid.filter((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 6);
  return (sat.length ? sat : valid).sort().pop();
}

export interface ParkrunRead {
  text: string;
  event: string;
  date?: string;
  finishers: number;
}

export function parkrunToTable(text: string, today: string): ParkrunRead | undefined {
  if (!looksLikeParkrun(text)) return undefined;
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\t+$/, '').trim());
  // Header: "Central Park parkrun" then "14/11/2026 | #177" (the line with the run number).
  let event = 'parkrun';
  let date: string | undefined;
  const runLine = lines.findIndex((l) => /\|\s*#\s*\d+/.test(l) || /第\s*\d+\s*回/.test(l));
  if (runLine >= 0) {
    date = parkrunDate(lines[runLine], today);
    const name = [...lines.slice(0, runLine)].reverse().find((l) => /park\s*run|パークラン/i.test(l) && l.length < 60);
    if (name) event = name.replace(/park\s*run/i, 'parkrun').replace(/^results\s*\|\s*/i, '').trim();
  }
  if (!/parkrun/i.test(event)) event = `${event} parkrun`;

  const out = ['Event\tDate\tPlace\tName\tSex\tCategory\tTime\tKind'];
  let place = 0;
  let start = 0;
  let finishers = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!TIME_ONLY.test(lines[i])) continue;
    const block = lines.slice(start, i).filter(Boolean);
    start = i + 1;
    const cat = block.find((l) => AGE_CAT.test(l));
    // The rank line is followed by the name; fall back to the line before "N finishes".
    let name: string | undefined;
    let rank: number | undefined;
    for (let j = block.length - 2; j >= 0; j--) {
      const r = rankOf(block[j]);
      if (r != null && !TIME_ONLY.test(block[j + 1]) && rankOf(block[j + 1]) == null && !AGE_CAT.test(block[j + 1])) {
        rank = r;
        name = block[j + 1];
        break;
      }
    }
    if (!name || !cat) continue;
    place = rank ?? place + 1;
    const sex = /^[JSV]W|^WWC/.test(cat) ? 'F' : 'M';
    out.push([event, date ?? '', String(place), name, sex, cat, lines[i], 'parkrun'].join('\t'));
    finishers++;
  }
  return finishers >= 2 ? { text: out.join('\n'), event, date, finishers } : undefined;
}
