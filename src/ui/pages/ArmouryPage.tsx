// THE ARMOURY (ARM test day): one grid for the whole group. Type each leg as it is measured; the app picks the
// weaker leg, shows the level and the ARM it gives, and saves the lot as one test event. The draft survives a
// refresh, so the grid can stay open on a phone or iPad through the session. Print gives the same grid on paper.
import './armoury.css';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { ArmMeasures, Athlete, Performance, TasukiEvent, YearGroup } from '../../types';
import { YEAR_GROUPS } from '../../types';
import { PageHeader, Panel, newId } from '../components/common';
import { useToast } from '../components/Toast';
import { useData } from '../data/DataContext';
import { AthletePicker } from '../components/AthletePicker';
import { Link } from '../router';
import { ARM_DOMAINS, ARM_PLATE_NAME, ARM_TEST_NAME, armLevelsFromTest, armLookup, armScore, armWeaker, type ArmDomain } from '../../engine/arm';
import { makePerformance } from '../../engine/corrections';
import { deriveAll } from '../../engine/derive';
import { applyChanges, type Changes } from '../../store/changes';
import { fullName } from '../../engine/display';
import { isISODate } from '../../engine/dates';
import type { Config } from '../../engine/config';

type Side = 'L' | 'R';
type Cells = Record<ArmDomain, Record<Side, string>>;
interface Row {
  athleteId: string;
  cells: Cells;
}
interface Draft {
  date: string;
  by: string;
  rows: Row[];
}

const KEY = 'tasuki-armoury-draft';
const emptyCells = (): Cells => ({ ankle: { L: '', R: '' }, calf: { L: '', R: '' }, balance: { L: '', R: '' } });
const FIELD: Record<ArmDomain, 'ankleCm' | 'calfReps' | 'hopCm'> = { ankle: 'ankleCm', calf: 'calfReps', balance: 'hopCm' };
/** Plausible ranges: outside these the cell is flagged (still saved if the coach confirms by leaving it). */
const RANGE: Record<ArmDomain, [number, number]> = { ankle: [0, 20], calf: [0, 60], balance: [0, 200] };

function loadDraft(today: string): Draft {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw) as Draft;
      if (d && Array.isArray(d.rows)) return d;
    }
  } catch {
    /* private window or blocked storage: start fresh */
  }
  return { date: today, by: '', rows: [] };
}

const num = (s: string): number | undefined => {
  const t = s.trim().replace(',', '.');
  if (t === '') return undefined;
  const v = Number(t);
  return Number.isFinite(v) ? v : undefined;
};

/** The ArmMeasures one grid row gives (per leg; nothing for an empty row). */
function rowMeasures(r: Row, by: string): ArmMeasures | undefined {
  const arm: ArmMeasures = {};
  let any = false;
  for (const d of ARM_DOMAINS) {
    for (const s of ['L', 'R'] as Side[]) {
      const v = num(r.cells[d][s]);
      if (v != null) {
        arm[`${FIELD[d]}${s}` as const] = v;
        any = true;
      }
    }
  }
  if (!any) return undefined;
  if (by.trim()) arm.verifiedBy = by.trim().toUpperCase();
  return arm;
}

/** The paste line for a row (kept as the record's raw input, and shown for copying). */
function rowLine(name: string, arm: ArmMeasures): string {
  const pair = (l?: number, r?: number) => (l != null && r != null ? `${l}/${r}` : (l ?? r));
  const bits = [
    (arm.ankleCmL != null || arm.ankleCmR != null) && `lunge ${pair(arm.ankleCmL, arm.ankleCmR)}`,
    (arm.calfRepsL != null || arm.calfRepsR != null) && `wall ${pair(arm.calfRepsL, arm.calfRepsR)}`,
    (arm.hopCmL != null || arm.hopCmR != null) && `landing ${pair(arm.hopCmL, arm.hopCmR)}`,
    arm.verifiedBy && `by ${arm.verifiedBy}`,
  ].filter(Boolean);
  return `${name} ${bits.join(' ')}`;
}

interface RowResult {
  levels: Partial<Record<ArmDomain, number>>;
  weakerLeg: Partial<Record<ArmDomain, Side>>;
  arm?: number;
  notes: string[];
}

function rowResult(r: Row, config: Config): RowResult {
  const m = rowMeasures(r, '');
  const levels = armLevelsFromTest(m, config);
  const notes: string[] = [];
  for (const d of ARM_DOMAINS) {
    const l = num(r.cells[d].L);
    const rr = num(r.cells[d].R);
    if ((l == null) !== (rr == null)) notes.push(`${ARM_PLATE_NAME[d]}: other leg`);
    for (const v of [l, rr]) if (v != null && (v < RANGE[d][0] || v > RANGE[d][1])) notes.push(`${ARM_PLATE_NAME[d]}: check ${v}`);
  }
  const below = ARM_DOMAINS.filter((d) => levels[d] === 0);
  for (const d of below) notes.push(`${ARM_PLATE_NAME[d]} below L1: target ${firstThreshold(d, config)}`);
  const all = ARM_DOMAINS.every((d) => (levels[d] ?? 0) >= 1);
  return { levels, weakerLeg: armWeaker(m).weakerLeg, arm: all ? armScore(levels as Record<ArmDomain, number>) : undefined, notes };
}

function thresholds(d: ArmDomain, config: Config): readonly number[] {
  return d === 'ankle' ? config.arm.ankleCm : d === 'calf' ? config.arm.calfReps : config.arm.hopCm;
}
function firstThreshold(d: ArmDomain, config: Config): string {
  return `${thresholds(d, config)[0]}${d === 'calf' ? ' reps' : ' cm'}`;
}

export function ArmouryPage() {
  const { snapshot, derived, commit, today, asOf, config } = useData();
  const toast = useToast();
  const [d, setD] = useState<Draft>(() => loadDraft(today));
  const [pick, setPick] = useState<string | null>(null);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(d));
    } catch {
      /* storage unavailable: the grid still works, it just won't survive a refresh */
    }
  }, [d]);

  const byId = useMemo(() => new Map(snapshot.athletes.map((a) => [a.id, a])), [snapshot.athletes]);
  const rows = d.rows.filter((r) => byId.has(r.athleteId));
  const roster = snapshot.athletes.filter((a) => a.active && !d.rows.some((r) => r.athleteId === a.id));

  const addAthletes = (list: Athlete[]) =>
    setD((x) => ({ ...x, rows: [...x.rows, ...list.filter((a) => !x.rows.some((r) => r.athleteId === a.id)).map((a) => ({ athleteId: a.id, cells: emptyCells() }))] }));
  const setCell = (id: string, dom: ArmDomain, side: Side, v: string) =>
    setD((x) => ({ ...x, rows: x.rows.map((r) => (r.athleteId === id ? { ...r, cells: { ...r.cells, [dom]: { ...r.cells[dom], [side]: v } } } : r)) }));
  const remove = (id: string) => setD((x) => ({ ...x, rows: x.rows.filter((r) => r.athleteId !== id) }));

  const results = useMemo(() => new Map(rows.map((r) => [r.athleteId, rowResult(r, config)])), [rows, config]);

  /** The change set Save would commit: one test event, one ARM test per pupil with any number. */
  const changes = useMemo<Changes | null>(() => {
    if (!isISODate(d.date)) return null;
    const now = new Date().toISOString();
    const perfs: Performance[] = [];
    for (const r of rows) {
      const arm = rowMeasures(r, d.by);
      const a = byId.get(r.athleteId);
      if (!arm || !a) continue;
      perfs.push(makePerformance({ athleteId: r.athleteId, date: d.date, kind: 'arm', eventId: 'draft-event', arm, verified: true, source: 'coach', rawInput: `Armoury: ${rowLine(fullName(a), arm)}` }, `draft-${r.athleteId}`, now));
    }
    if (!perfs.length) return null;
    const event: TasukiEvent = { id: 'draft-event', name: 'The Armoury', date: d.date, kind: 'test', official: true };
    return { put: { events: [event], performances: perfs } };
  }, [rows, d.date, d.by, byId]);

  // What saving would do to each pupil's ARM (best level per plate in the window, so a weaker retest changes nothing).
  const deferred = useDeferredValue(changes);
  const after = useMemo(() => (deferred ? deriveAll(applyChanges(snapshot, deferred), asOf, config) : null), [deferred, snapshot, asOf, config]);

  const save = async () => {
    if (!changes) return;
    const eventId = newId('event');
    await commit({
      put: {
        events: changes.put!.events!.map((e) => ({ ...e, id: eventId })),
        performances: changes.put!.performances!.map((p) => ({ ...p, id: newId('perf'), eventId })),
      },
    });
    const n = changes.put!.performances!.length;
    toast(`Saved ${n} ARM test${n === 1 ? '' : 's'} (The Armoury, ${d.date}). The cards are updated.`, 'ok');
    setD((x) => ({ ...x, rows: [] }));
  };

  const years = YEAR_GROUPS.filter((y) => roster.some((a) => a.yearGroup === y && a.squad !== false));
  const filled = rows.filter((r) => rowMeasures(r, '')).length;
  const complete = rows.filter((r) => ARM_DOMAINS.every((dom) => r.cells[dom].L.trim() && r.cells[dom].R.trim())).length;

  return (
    <div className="stack armoury">
      <PageHeader
        title="The Armoury"
        subtitle={
          <>
            ARM test day. Type each leg as it is measured: the app takes the weaker leg, shows the level and the ARM, and saves the whole group as one test. The grid is kept if the page is closed. One pupil at a time also works in <Link to="/entry">Quick Entry</Link>; a typed sheet in <Link to="/paste">Paste &amp; Match</Link>.
          </>
        }
        actions={
          <button className="btn" onClick={() => window.print()} disabled={!rows.length}>
            Print score sheet
          </button>
        }
      />

      <Panel className="no-print">
        <div className="arm-toolbar">
          <label>
            Date <input className="input" type="date" value={d.date} onChange={(e) => setD((x) => ({ ...x, date: e.target.value }))} />
          </label>
          <label>
            Checked by (initials) <input className="input arm-init" value={d.by} maxLength={4} onChange={(e) => setD((x) => ({ ...x, by: e.target.value }))} />
          </label>
          <div className="arm-add">
            <AthletePicker
              roster={roster}
              value={pick}
              placeholder="Add a pupil…"
              onChange={(id) => {
                const a = id ? byId.get(id) : undefined;
                if (a) addAthletes([a]);
                setPick(null);
              }}
            />
          </div>
          {years.map((y: YearGroup) => (
            <button key={y} className="btn btn-sm" onClick={() => addAthletes(roster.filter((a) => a.yearGroup === y && a.squad !== false))}>
              + {y}
            </button>
          ))}
        </div>
      </Panel>

      {rows.length === 0 ? (
        <Panel className="no-print">
          <p className="muted">Add the pupils being tested (by name or a whole year group). Then type each number as the Squire calls it.</p>
          <Ladder config={config} />
        </Panel>
      ) : (
        <>
          <Panel className="no-print arm-grid-panel">
            <div className="arm-scroll">
              <table className="arm-grid">
                <thead>
                  <tr>
                    <th rowSpan={2}>Pupil</th>
                    {ARM_DOMAINS.map((dom) => (
                      <th key={dom} colSpan={3} className={`plate-${dom}`}>
                        {ARM_TEST_NAME[dom]} <span className="muted small">({dom === 'calf' ? 'reps' : 'cm'})</span>
                      </th>
                    ))}
                    <th rowSpan={2}>ARM on the card</th>
                    <th rowSpan={2} />
                  </tr>
                  <tr>
                    {ARM_DOMAINS.flatMap((dom) => [
                      <th key={`${dom}L`} className={`plate-${dom}`}>L</th>,
                      <th key={`${dom}R`} className={`plate-${dom}`}>R</th>,
                      <th key={`${dom}lv`} className={`plate-${dom}`}>Lv</th>,
                    ])}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const a = byId.get(r.athleteId)!;
                    const res = results.get(r.athleteId)!;
                    const before = derived.athletes.get(r.athleteId)?.ratings.stats.ARM;
                    const aft = after?.athletes.get(r.athleteId)?.ratings.stats.ARM;
                    return (
                      <tr key={r.athleteId}>
                        <th scope="row" className="arm-name">
                          {fullName(a)}
                          <span className="muted small"> {a.yearGroup}</span>
                        </th>
                        {ARM_DOMAINS.flatMap((dom) => [
                          ...(['L', 'R'] as Side[]).map((s) => (
                            <td key={`${dom}${s}`} className={`plate-${dom} ${res.weakerLeg[dom] === s ? 'weaker' : ''}`}>
                              {dom === 'balance' ? (
                                <select className="select arm-cell" value={r.cells[dom][s]} aria-label={`${fullName(a)} ${ARM_TEST_NAME[dom]} ${s}`} onChange={(e) => setCell(r.athleteId, dom, s, e.target.value)}>
                                  <option value="">—</option>
                                  <option value="0">&lt; {config.arm.hopCm[0]}</option>
                                  {config.arm.hopCm.map((c) => (
                                    <option key={c} value={c}>
                                      {c}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  className="input arm-cell"
                                  inputMode="decimal"
                                  value={r.cells[dom][s]}
                                  aria-label={`${fullName(a)} ${ARM_TEST_NAME[dom]} ${s}`}
                                  onChange={(e) => setCell(r.athleteId, dom, s, e.target.value)}
                                />
                              )}
                            </td>
                          )),
                          <td key={`${dom}lv`} className={`plate-${dom} arm-lv`}>
                            {res.levels[dom] == null ? '' : res.levels[dom] === 0 ? <span className="lv lv0">—</span> : <span className={`lv lv${res.levels[dom]}`}>L{res.levels[dom]}</span>}
                          </td>,
                        ])}
                        <td className="arm-total">
                          {aft && !aft.locked ? <strong>{aft.value}</strong> : res.arm != null ? <strong>{res.arm}</strong> : <span className="muted">—</span>}
                          <div className="small muted">
                            {res.arm != null ? `this test ${res.arm} · ` : ''}
                            {before?.locked === false ? `card now ${before.value}` : 'card locked'}
                          </div>
                          {res.notes.length > 0 && <div className="small arm-note">{res.notes.join(' · ')}</div>}
                        </td>
                        <td>
                          <button className="btn btn-sm btn-ghost" onClick={() => remove(r.athleteId)} aria-label={`Remove ${fullName(a)}`}>
                            ×
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="arm-save">
              <span className="muted small">
                {filled} of {rows.length} pupils have numbers; {complete} complete. A plate counts only when both legs are in. Saving keeps every number (both legs) and can be corrected later on the pupil's page.
              </span>
              <button className="btn btn-primary" disabled={!changes} onClick={save}>
                Save {filled || ''} ARM test{filled === 1 ? '' : 's'}
              </button>
            </div>
          </Panel>
          <Panel className="no-print">
            <Ladder config={config} />
          </Panel>
          <PrintSheet rows={rows} byId={byId} date={d.date} config={config} />
        </>
      )}
    </div>
  );
}

/** 'Armour Glow at 89 (13 levels)': the first ARM on the lookup that reaches an unlock. */
function unlockAt(score: number, what: string): string {
  const hit = armLookup().find((x) => x.arm >= score);
  return hit ? `${what} at ${hit.arm} (${hit.sum} levels)` : `${what}: out of reach`;
}

const PLATE_TEST: Record<ArmDomain, string> = { ankle: 'The Lunge, knee-to-wall (cm)', calf: 'The Wall, heel raises (reps)', balance: 'hop-and-stick rung (cm)' };

/** The level ladder and the lookup, from the current config (the posters must match this). */
function Ladder({ config }: { config: Config }) {
  return (
    <div className="arm-ladder">
      <table className="table small">
        <thead>
          <tr>
            <th>Plate (weaker leg)</th>
            {[1, 2, 3, 4, 5].map((l) => (
              <th key={l}>L{l}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ARM_DOMAINS.map((dom) => (
            <tr key={dom}>
              <th scope="row">
                {ARM_PLATE_NAME[dom]}: {dom === 'balance' ? `The Landing, ${PLATE_TEST[dom]}` : PLATE_TEST[dom]}
              </th>
              {thresholds(dom, config).map((t) => (
                <td key={t} className="num">
                  {t}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">
        Levels added up → ARM: {armLookup().map((x) => `${x.sum}→${x.arm}`).join(' · ')}. Below level 1 on any plate: ARM stays locked. {unlockAt(config.avatarUnlocks.armGuards, 'Ankle guards')}; {unlockAt(config.avatarUnlocks.armGlow, 'Armour Glow')}.
      </p>
    </div>
  );
}

/** The paper copy of the grid: same columns, names filled in, one A4 landscape page per ~14 pupils. */
function PrintSheet({ rows, byId, date, config }: { rows: Row[]; byId: Map<string, Athlete>; date: string; config: Config }) {
  return (
    <div className="arm-print print-only">
      <h2>The Armoury · score sheet · {date}</h2>
      <p className="small">
        Write both legs. Lunge: cm to 0.5. Wall: clean reps. Landing: furthest rung stuck 2 of 3 ({config.arm.hopCm.join(' / ')} cm; 0 = below {config.arm.hopCm[0]}). The app picks the weaker leg.
      </p>
      <table className="arm-print-table">
        <thead>
          <tr>
            <th>Pupil</th>
            <th>Lunge L</th>
            <th>Lunge R</th>
            <th>Wall L</th>
            <th>Wall R</th>
            <th>Landing L</th>
            <th>Landing R</th>
            <th>Checked</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const a = byId.get(r.athleteId)!;
            return (
              <tr key={r.athleteId}>
                <td>{fullName(a)}</td>
                {ARM_DOMAINS.flatMap((dom) => (['L', 'R'] as Side[]).map((s) => <td key={dom + s}>{r.cells[dom][s]}</td>))}
                <td />
              </tr>
            );
          })}
        </tbody>
      </table>
      <Ladder config={config} />
    </div>
  );
}
