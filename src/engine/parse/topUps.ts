// Winter top-ups from a Microsoft Forms export (Excel, copied and pasted; or CSV). One row per session.
// Columns are found by their question text, so the form can be worded freely as long as each question
// contains a keyword: name, date, what/activity, minutes, km/distance, surge/stride, photo/screen, sore.
// The photo itself stays in the school's OneDrive; only "a photo came with it" is recorded here.
import type { Athlete, ISODate, Participation, TopUp, TopUpActivity } from '../../types';
import type { Config } from '../config';
import { isoWeek } from '../dates';
import { matchName, type NameMatch } from '../names';
import { detectDelimiter, joinQuotedLines, splitLine } from './split';
import { parseDateCell } from './table';

export interface TopUpRow {
  line: number;
  name: string;
  match: NameMatch;
  date?: ISODate;
  topUp?: TopUp;
  /** The Forms response ID, used to make re-pasting the same export harmless. */
  responseId?: string;
  problems: string[];
}

type Col = 'id' | 'name' | 'date' | 'activity' | 'minutes' | 'km' | 'sharp' | 'photo' | 'sore' | 'completed' | 'note';

const HEADERS: [Col, RegExp][] = [
  ['id', /^id$/i],
  ['completed', /completion time|completed|timestamp|送信/i],
  ['sore', /sore|pain|痛/i],
  ['sharp', /surge|stride|race[-\s]?pace|pick-?up|ダッシュ/i],
  ['photo', /photo|picture|screen|screenshot|写真/i],
  ['minutes', /minute|mins|time spent|分/i],
  ['km', /\bkm\b|kilomet|distance|距離/i],
  ['activity', /what did you|activity|session type|type of|種類/i],
  ['date', /date|day|日付/i],
  ['name', /name|名前/i],
  ['note', /note|comment|anything else|メモ/i],
];

function columnsOf(header: string[]): Map<Col, number> {
  const out = new Map<Col, number>();
  header.forEach((h, i) => {
    const text = h.trim();
    if (/^(start time|email|メール)/i.test(text)) return;
    for (const [col, re] of HEADERS) {
      if (!out.has(col) && re.test(text)) {
        out.set(col, i);
        return;
      }
    }
  });
  return out;
}

export function activityFrom(text: string): TopUpActivity | undefined {
  const t = text.toLowerCase();
  if (/treadmill|トレッドミル|ランニングマシン/.test(t)) return 'treadmill';
  if (/ski|snowboard|スキー|スノボ/.test(t)) return 'ski';
  if (/armou?r|calf|pogo|ankle|mobility|strength|補強|カーフ/.test(t)) return 'armour';
  if (/gym|ジム/.test(t)) return 'gym';
  if (/run|jog|parkrun|ラン|走/.test(t)) return 'run';
  return undefined;
}

function numberFrom(text: string): number | undefined {
  const m = /(\d+(?:[.,]\d+)?)/.exec(text);
  return m ? Number(m[1].replace(',', '.')) : undefined;
}

/** Minutes from "25", "25 min", "0:25:00", "25:30" (mm:ss) or "1h 5". */
function minutesFrom(text: string): number | undefined {
  const t = text.trim();
  let m: RegExpExecArray | null;
  if ((m = /^(\d+):(\d{2}):(\d{2})$/.exec(t))) return +m[1] * 60 + +m[2] + +m[3] / 60;
  if ((m = /^(\d+):(\d{2})$/.exec(t))) return +m[1] + +m[2] / 60;
  if ((m = /(\d+)\s*h(?:ours?|r)?\s*(\d+)?/i.exec(t))) return +m[1] * 60 + (m[2] ? +m[2] : 0);
  return numberFrom(t);
}

const yes = (t: string) => /^(y|yes|true|はい|✓|x)\b/i.test(t.trim());

export function parseTopUps(text: string, roster: Athlete[], config: Config, today: ISODate): { rows: TopUpRow[]; problems: string[] } {
  const lines = joinQuotedLines(text.split(/\r?\n/)).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], problems: ['Paste the header row and at least one response.'] };
  const delim = detectDelimiter(lines);
  const header = splitLine(lines[0], delim);
  const cols = columnsOf(header);
  const missing = (['name', 'activity', 'minutes'] as Col[]).filter((c) => !cols.has(c));
  if (missing.length) return { rows: [], problems: [`No column for ${missing.join(', ')}. The first row must be the form's questions.`] };
  const cell = (cells: string[], c: Col) => (cols.has(c) ? (cells[cols.get(c)!] ?? '').trim() : '');

  const rows: TopUpRow[] = lines.slice(1).map((line, i) => {
    const cells = splitLine(line, delim);
    const problems: string[] = [];
    const name = cell(cells, 'name');
    const match = matchName(name, roster, config);
    if (!match.athleteId) problems.push(match.type === 'ambiguous' ? 'Name matches more than one runner' : 'Name not recognised');
    const date = parseDateCell(cell(cells, 'date')) ?? parseDateCell(cell(cells, 'completed'));
    if (!date) problems.push('No date');
    else if (date > today) problems.push('Date is in the future');
    const activity = activityFrom(cell(cells, 'activity'));
    if (!activity) problems.push(`Activity “${cell(cells, 'activity')}” not recognised`);
    const minutes = minutesFrom(cell(cells, 'minutes'));
    if (minutes == null || !(minutes > 0)) problems.push('No minutes');
    else if (minutes > 300) problems.push('More than 5 hours: check the minutes');
    const kmText = cell(cells, 'km');
    const km = kmText ? numberFrom(kmText) : undefined;
    const soreText = cell(cells, 'sore');
    const soreness = soreText ? numberFrom(soreText) : undefined;
    if (soreness != null && (soreness < 0 || soreness > 10)) problems.push('Soreness must be 0–10');
    const photo = cell(cells, 'photo');
    const note = cell(cells, 'note');
    const topUp: TopUp | undefined =
      activity && minutes && minutes > 0
        ? {
            activity,
            minutes: Math.round(minutes),
            ...(km && km > 0 ? { km } : {}),
            ...(yes(cell(cells, 'sharp')) ? { sharp: true } : {}),
            proof: photo && !/^(no|none|-)$/i.test(photo) ? 'photo' : 'none',
            ...(soreness != null && soreness >= 0 && soreness <= 10 ? { soreness } : {}),
            ...(note ? { note } : {}),
          }
        : undefined;
    if (topUp?.km && topUp.minutes && (topUp.activity === 'run' || topUp.activity === 'treadmill')) {
      const pace = (topUp.minutes * 60) / topUp.km;
      if (pace < 150) problems.push('Faster than 2:30/km: check the minutes and km');
    }
    const id = cell(cells, 'id');
    return { line: i + 2, name, match, date, topUp, responseId: id || undefined, problems };
  });
  return { rows, problems: [] };
}

/** Participation records for the rows with no problems. Ids come from the response ID when there is one. */
export function topUpParticipation(rows: TopUpRow[], newId: () => string): Participation[] {
  return rows
    .filter((r) => !r.problems.length && r.match.athleteId && r.date && r.topUp)
    .map((r) => ({
      id: r.responseId ? `topup-form-${r.responseId}` : newId(),
      athleteId: r.match.athleteId!,
      isoWeek: isoWeek(r.date!),
      type: 'top_up' as const,
      date: r.date!,
      topUp: r.topUp!,
    }));
}
