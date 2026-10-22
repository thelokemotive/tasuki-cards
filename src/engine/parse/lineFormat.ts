// Tasuki line format v1 (spec 4.3; documented in docs/LINE-FORMAT.md, shown on the Help page).
import type { ArmMeasures, PerfKind, PerfSource } from '../../types';
import type { Config } from '../config';
import { isISODate } from '../dates';
import { findTimeInText, findTimeProblemInText } from '../time';
import { normaliseSeparators } from './split';
import type { RawParse, RawRow, RawSection, SectionDefaults } from './types';

const HEADER = /^#\s*(event|test|participation)\s*[:：]\s*(.*)$/i;

export function looksLikeLineFormat(text: string): boolean {
  return text.split(/\r?\n/).some((l) => HEADER.test(normaliseSeparators(l).trim()));
}

const EVENT_KINDS: Record<string, PerfKind> = {
  race: 'race',
  relay_leg: 'relay_leg',
  relay: 'relay_leg',
  'relay leg': 'relay_leg',
  parkrun: 'parkrun',
  long_run: 'long_run',
  'long run': 'long_run',
  circuit: 'circuit',
  climb: 'climb',
  descent: 'descent',
  nav: 'nav',
};
const TEST_KINDS: Record<string, PerfKind> = { bleep: 'bleep', arm: 'arm', nav: 'nav' };
const TEST_NAMES: Record<string, string> = { bleep: 'Bleep test', arm: 'ARM tests', nav: 'Navigation test' };

const num = (s: string) => Number(s.replace(/,/g, '.'));

/** Parse the optional header fields shared by event and test headers. */
function headerField(f: string, sec: RawSection): boolean {
  const t = f.trim();
  let m: RegExpExecArray | null;
  if (isISODate(t)) sec.date = t;
  else if ((m = /^climb\s+(\d+(?:\.\d+)?)\s*m$/i.exec(t))) sec.climbM = num(m[1]);
  else if ((m = /^(\d+(?:[.,]\d+)?)\s*km$/i.exec(t))) sec.distanceKm = num(m[1]);
  else if ((m = /^place\s+(\d+)\s*(?:\/\s*(\d+))?$/i.exec(t))) {
    sec.place = Number(m[1]);
    if (m[2]) sec.fieldSize = Number(m[2]);
  } else if ((m = /^field\s+(\d+)$/i.exec(t))) sec.fieldSize = Number(m[1]);
  else if ((m = /^course\s+(.+)$/i.exec(t))) sec.courseName = m[1].trim();
  else if (/^unofficial$/i.test(t)) sec.official = false;
  else if (/^official$/i.test(t)) sec.official = true;
  else return false;
  return true;
}

export function parseHeader(line: string, lineNo: number, today: string): RawSection | null {
  const m = HEADER.exec(line.trim());
  if (!m) return null;
  const type = m[1].toLowerCase() as RawSection['type'];
  const fields = m[2].split('|').map((f) => f.trim());
  const sec: RawSection = { key: `s${lineNo}`, type, name: '', official: true, line: lineNo, warnings: [] };
  const first = fields.shift() ?? '';
  if (type === 'event') {
    sec.name = first;
    for (const f of fields) {
      const kind = EVENT_KINDS[f.toLowerCase()];
      if (kind) sec.perfKind = kind;
      else if (!headerField(f, sec) && f) sec.warnings.push(`Header field not understood: “${f}”`);
    }
    if (!sec.perfKind) {
      sec.perfKind = /parkrun/i.test(sec.name) ? 'parkrun' : 'race';
      sec.warnings.push(`No kind given; using “${sec.perfKind}”`);
    }
    if (!sec.name) sec.warnings.push('Event header has no name');
  } else if (type === 'test') {
    const kind = TEST_KINDS[first.toLowerCase()];
    if (!kind) sec.warnings.push(`Unknown test “${first}” (use bleep, arm or nav)`);
    sec.perfKind = kind ?? 'bleep';
    sec.name = TEST_NAMES[first.toLowerCase()] ?? first;
    for (const f of fields) {
      if (kind === 'nav' && /^(\d+(?:[.,]\d+)?)\s*km$/i.test(f)) sec.routeKmEff = num(/^(\d+(?:[.,]\d+)?)/.exec(f)![1]);
      else if (!headerField(f, sec) && f) sec.warnings.push(`Header field not understood: “${f}”`);
    }
  } else {
    const t = first.toLowerCase().replace(/\s+/g, '_');
    if (t === 'saturday_run' || t === 'freeze') sec.participationType = t;
    else {
      sec.participationType = 'saturday_run';
      sec.warnings.push(`Unknown participation “${first}” (use saturday_run or freeze); using saturday_run`);
    }
    sec.name = sec.participationType === 'freeze' ? 'Streak freeze' : 'Saturday run';
    for (const f of fields) if (!headerField(f, sec) && f) sec.warnings.push(`Header field not understood: “${f}”`);
  }
  if (!sec.date) {
    sec.date = today;
    sec.warnings.push('No date in header; using today');
  }
  return sec;
}

/** Options after the time: ", leg 2, team Peregrine, raced earlier, place 7/23, unverified, not clean, errors 1". */
function parseOptions(rest: string, row: RawRow): void {
  for (const part of rest.split(',').map((p) => p.trim()).filter(Boolean)) {
    let m: RegExpExecArray | null;
    const low = part.toLowerCase();
    if ((m = /^leg\s+(\d+)$/i.exec(part))) row.legNumber = Number(m[1]);
    else if ((m = /^team\s+(.+)$/i.exec(part))) row.teamName = m[1].trim();
    else if (/^raced\s+earlier(\s+(the\s+)?same\s+day)?$/i.test(part)) row.racedEarlierSameDay = true;
    else if ((m = /^place\s+(\d+)\s*(?:\/\s*(\d+))?$/i.exec(part)) || (m = /^(\d+)\s*\/\s*(\d+)$/.exec(part))) {
      row.place = Number(m[1]);
      if (m[2]) row.fieldSize = Number(m[2]);
    } else if (low === 'unverified') row.unverified = true;
    else if (low === 'verified') row.unverified = false;
    else if (/^not\s+clean(\s+run)?$/i.test(part)) row.cleanRun = false;
    else if (/^clean(\s+run)?$/i.test(part)) row.cleanRun = true;
    else if ((m = /^(\d+)\s+errors?$/i.exec(part)) || (m = /^errors?\s+(\d+)$/i.exec(part))) row.navErrors = Number(m[1]);
    else if ((m = /^variant\s+(.+)$/i.exec(part))) row.navVariant = m[1].trim();
    else if ((m = /^route\s+(\d+(?:[.,]\d+)?)\s*km$/i.exec(part))) row.routeKmEff = num(m[1]);
    else row.warnings.push(`Not understood: “${part}”`);
  }
}

/** Space-separated options are also accepted ("Ken S 7:55 leg 4 team Golden Eagle"): normalise to commas. */
function commaise(rest: string): string {
  return rest
    .replace(/\s+(leg\s+\d+|team\s+|raced\s+earlier|place\s+\d|unverified|not\s+clean|errors?\s+\d|variant\s+|route\s+\d)/gi, ', $1')
    .replace(/^\s*,/, '');
}

function nameBefore(text: string): string {
  return text.replace(/[,，:;\-–]+\s*$/, '').trim();
}

function parseArm(body: string, row: RawRow): void {
  const arm: ArmMeasures = {};
  const re = /\b(ankle|calf|stork|hop)\s*[:=]?\s*(\d+(?:\.\d+)?|yes|no|y|n|pass|fail)\b/gi;
  let m: RegExpExecArray | null;
  let first = -1;
  while ((m = re.exec(body))) {
    if (first < 0) first = m.index;
    const v = m[2].toLowerCase();
    switch (m[1].toLowerCase()) {
      case 'ankle':
        arm.ankleCm = Number(v);
        break;
      case 'calf':
        arm.calfReps = Number(v);
        break;
      case 'stork':
        arm.storkSec = Number(v);
        break;
      case 'hop':
        arm.hopStickBothLegs = ['yes', 'y', 'pass'].includes(v);
        break;
    }
  }
  row.name = nameBefore(first >= 0 ? body.slice(0, first) : body);
  if (first < 0) row.errors.push('No ARM measures (ankle, calf, stork, hop)');
  else {
    row.arm = arm;
    for (const k of ['ankleCm', 'calfReps', 'storkSec'] as const) {
      const v = arm[k];
      if (v != null && (!Number.isFinite(v) || v < 0 || v > 300)) row.errors.push(`Implausible ${k}: ${v}`);
    }
  }
}

function parseBleep(body: string, row: RawRow): void {
  const m = /^(.*?)[,\s]+(\d+)\s*(?:laps?|shuttles?)?\s*(?:,(.*))?$/i.exec(body);
  if (!m) {
    row.name = nameBefore(body);
    row.errors.push('No lap count');
    return;
  }
  row.name = nameBefore(m[1]);
  row.laps = Number(m[2]);
  if (row.laps > 250) row.errors.push(`Implausible lap count ${row.laps}`);
  if (m[3]) parseOptions(m[3], row);
}

function parseTimed(body: string, row: RawRow, config: Config): void {
  const t = findTimeInText(body, { context: 'time', config });
  if (!t) {
    const problem = findTimeProblemInText(body, { context: 'time', config });
    const comma = body.indexOf(',');
    row.name = nameBefore(problem ? body.slice(0, problem.start) : comma >= 0 ? body.slice(0, comma) : body);
    row.errors.push(problem ? problem.error : 'missing time');
    if (comma >= 0 && !problem) parseOptions(body.slice(comma + 1), row);
    return;
  }
  row.name = nameBefore(body.slice(0, t.start));
  row.timeSec = t.sec;
  row.timeRaw = t.raw;
  row.warnings.push(...t.warnings);
  const rest = body.slice(t.end);
  if (rest.trim()) parseOptions(commaise(rest), row);
}

/**
 * Parse Tasuki line format. Lines before the first header use `defaults` (the event picked in the UI).
 */
export function parseLineFormat(text: string, opts: { today: string; config: Config; source?: PerfSource; defaults?: SectionDefaults }): RawParse {
  const { today, config } = opts;
  const source = opts.source ?? 'paste';
  const sections: RawSection[] = [];
  const rows: RawRow[] = [];
  const warnings: string[] = [];
  let current: RawSection | null = null;
  const implicit = (): RawSection => {
    const d = opts.defaults ?? {};
    const s: RawSection = {
      key: 's0',
      type: d.perfKind === 'bleep' || d.perfKind === 'arm' ? 'test' : 'event',
      name: d.name ?? '',
      date: d.date ?? today,
      perfKind: d.perfKind ?? 'race',
      distanceKm: d.distanceKm,
      climbM: d.climbM,
      courseName: d.courseName,
      official: d.official ?? true,
      line: 0,
      warnings: d.name ? [] : ['Results before the first header use the event chosen above'],
    };
    sections.push(s);
    return s;
  };

  text.split(/\r?\n/).forEach((rawLine, i) => {
    const lineNo = i + 1;
    const line = normaliseSeparators(rawLine).trim();
    if (!line) return;
    if (line.startsWith('#')) {
      const h = parseHeader(line, lineNo, today);
      if (h) {
        sections.push(h);
        current = h;
      }
      return; // other # lines are comments
    }
    const sec: RawSection = current ?? implicit();
    current = sec;
    if (sec.type === 'participation') {
      for (const name of line.split(/[,，、;]/).map((n) => n.trim()).filter(Boolean)) {
        rows.push({ line: lineNo, raw: rawLine, sectionKey: sec.key, name, source, warnings: [], errors: [] });
      }
      return;
    }
    const row: RawRow = { line: lineNo, raw: rawLine, sectionKey: sec.key, name: '', source, warnings: [], errors: [] };
    if (sec.perfKind === 'arm') parseArm(line, row);
    else if (sec.perfKind === 'bleep') parseBleep(line, row);
    else parseTimed(line, row, config);
    if (!row.name) row.errors.push('No name before the result');
    rows.push(row);
  });

  // "place p/n" in a header applies to the single result that follows it.
  for (const s of sections) {
    if (s.place == null) continue;
    const mine = rows.filter((r) => r.sectionKey === s.key);
    if (mine.length === 1 && mine[0].place == null) mine[0].place = s.place;
    else if (mine.length > 1) s.warnings.push('“place” in the header is ignored when there are several results; give places on each line');
  }
  if (!rows.length) warnings.push('No result lines found');
  return { format: 'line', sections, rows, warnings };
}
