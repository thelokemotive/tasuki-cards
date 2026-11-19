// The Armoury entry grid (one row per pupil, like the paper Armour Card) saved through the same path as Paste &
// Match: the grid is written as ARM line format, parsed, and each row is assigned to the pupil it was typed for.
// So the grid, a pasted block and the single-file build all validate and save results the same way.
import type { Athlete } from '../../types';
import { fullName } from '../display';
import { buildImportPlan, type ImportPlan, type PlanContext, type RowDecision } from './plan';

export interface ArmGridRow {
  athleteId: string;
  ankleL?: string;
  ankleR?: string;
  calfL?: string;
  calfR?: string;
  throneL?: string;
  throneR?: string;
  hopL?: string;
  hopR?: string;
  storkL?: string;
  storkR?: string;
  height?: string;
  pistolL?: boolean;
  pistolR?: boolean;
}

const clean = (v: string | undefined) => (v ?? '').trim().replace(',', '.');

function pair(word: string, l: string | undefined, r: string | undefined): string {
  const a = clean(l);
  const b = clean(r);
  if (!a && !b) return '';
  return ` ${word} ${a || '-'}/${b || '-'}`;
}

/** One ARM line for a grid row ('' when nothing was typed). */
export function armGridLine(row: ArmGridRow, athlete: Pick<Athlete, 'givenName' | 'familyName' | 'preferredName'>): string {
  const body =
    pair('ankle', row.ankleL, row.ankleR) +
    pair('calf', row.calfL, row.calfR) +
    pair('throne', row.throneL, row.throneR) +
    pair('hop', row.hopL, row.hopR) +
    pair('stork', row.storkL, row.storkR) +
    (row.pistolL || row.pistolR ? ` pistol ${row.pistolL ? 'yes' : 'no'}/${row.pistolR ? 'yes' : 'no'}` : '') +
    (clean(row.height) ? ` height ${clean(row.height)}` : '');
  return body ? `${fullName(athlete)}${body}` : '';
}

/** The whole grid as line format, with the header. Rows with nothing typed are left out. */
export function armGridText(rows: ArmGridRow[], roster: Athlete[], date: string, note?: string): { text: string; lineOf: Map<number, string> } {
  const lines = [`# test: arm | ${date}${note?.trim() ? ` | note ${note.trim().replace(/\|/g, '/')}` : ''}`];
  const lineOf = new Map<number, string>();
  for (const r of rows) {
    const a = roster.find((x) => x.id === r.athleteId);
    if (!a) continue;
    const l = armGridLine(r, a);
    if (!l) continue;
    lines.push(l);
    lineOf.set(lines.length, r.athleteId);
  }
  return { text: lines.join('\n'), lineOf };
}

/** Plan + decisions: every parsed row goes to the pupil it was typed for (no name guessing). */
export function armGridPlan(rows: ArmGridRow[], date: string, note: string | undefined, ctx: PlanContext): { plan: ImportPlan; decisions: Record<string, RowDecision>; text: string } {
  const { text, lineOf } = armGridText(rows, ctx.snapshot.athletes, date, note);
  const plan = buildImportPlan(text, { ...ctx, format: 'line' });
  const decisions: Record<string, RowDecision> = {};
  for (const r of plan.rows) {
    const id = lineOf.get(r.raw.line);
    if (!id) continue;
    const blocked = r.raw.errors.length > 0 || !!r.duplicateOfPerfId;
    decisions[r.id] = blocked ? { status: 'skip' } : { status: 'ready', athleteId: id };
  }
  return { plan, decisions, text };
}
