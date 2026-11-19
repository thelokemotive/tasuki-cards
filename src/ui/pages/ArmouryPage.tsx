// The Armoury (coach): enter an ARM session straight from the paper Armour Cards, and see the spread of levels.
// Saving goes through the Paste & Match path (armGridPlan → planToChanges), so the checks are the same.
import { useMemo, useState } from 'react';
import { useData } from '../data/DataContext';
import { useToast } from '../components/Toast';
import { Field, PageHeader, Panel, Seg, newId } from '../components/common';
import { AthletePicker } from '../components/AthletePicker';
import { Link } from '../router';
import type { ArmMeasures, YearGroup } from '../../types';
import { YEAR_GROUPS } from '../../types';
import { ARM_DOMAINS, armTestDetail, plateLine, plateName, weakerSide, type ArmDomain } from '../../engine/arm';
import { armComplete, armScoreClamped } from '../../engine/scoring';
import { armGridPlan, type ArmGridRow } from '../../engine/parse/armGrid';
import { planToChanges } from '../../engine/parse/plan';
import { fullName } from '../../engine/display';
import type { Config } from '../../engine/config';
import type { AthleteDerived } from '../../engine/derive';
import { monthsBetween } from '../../engine/dates';

type Tab = 'enter' | 'spread';

const num = (v?: string) => {
  const t = (v ?? '').trim().replace(',', '.');
  if (!t || t === '-') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
};

/** The row as ArmMeasures, for the live preview (the saved record comes from the parser). */
function preview(r: ArmGridRow): ArmMeasures {
  const leg = (s: 'L' | 'R') => ({
    ankleCm: num(s === 'L' ? r.ankleL : r.ankleR),
    calfReps: num(s === 'L' ? r.calfL : r.calfR),
    throne: num(s === 'L' ? r.throneL : r.throneR),
    hopCm: (() => {
      const h = num(s === 'L' ? r.hopL : r.hopR);
      return h != null && h > 0 && h < 5 ? Math.round(h * 100) : h;
    })(),
  });
  return { left: leg('L'), right: leg('R') };
}

function PreviewCell({ r, config }: { r: ArmGridRow; config: Config }) {
  const det = armTestDetail(preview(r), config);
  const lv = det.levels;
  if (!ARM_DOMAINS.some((d) => lv[d] != null)) return <span className="muted">—</span>;
  const line = plateLine(lv, config) + (det.interim ? '*' : '');
  if (!armComplete(lv)) {
    const missing = ARM_DOMAINS.filter((d) => !((lv[d] ?? 0) >= 1)).map((d) => `${plateName(d, config)}${lv[d] === 0 ? ' <L1' : ''}`);
    return (
      <span title={`Locked: ${missing.join(', ')}`}>
        {line} · <span className="muted">🔒 {missing.join(', ')}</span>
      </span>
    );
  }
  return (
    <span>
      {line} → <strong>{armScoreClamped(lv, config)}</strong>
    </span>
  );
}

function EnterSession() {
  const { snapshot, derived, today, commit } = useData();
  const toast = useToast();
  const config = derived.config;
  const roster = useMemo(() => snapshot.athletes.filter((a) => a.active).sort((a, b) => fullName(a).localeCompare(fullName(b))), [snapshot.athletes]);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [rows, setRows] = useState<ArmGridRow[]>([]);
  const [year, setYear] = useState<YearGroup>('Y12');
  const [pick, setPick] = useState<string | null>(null);
  const [extra, setExtra] = useState(false);
  const add = (ids: string[]) => setRows((xs) => [...xs, ...ids.filter((id) => !xs.some((x) => x.athleteId === id)).map((athleteId) => ({ athleteId }))]);
  const set = (i: number, patch: Partial<ArmGridRow>) => setRows((xs) => xs.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const built = useMemo(() => (rows.length ? armGridPlan(rows, date, note, { snapshot, config, today }) : undefined), [rows, date, note, snapshot, config, today]);
  const problems = built ? built.plan.rows.filter((r) => r.raw.errors.length || r.duplicateOfPerfId).map((r) => `${r.raw.name}: ${r.duplicateOfPerfId ? 'already has an ARM test on this date' : r.raw.errors.join('; ')}`) : [];
  const warnings = built ? built.plan.rows.flatMap((r) => r.raw.warnings.map((w) => `${r.raw.name}: ${w}`)) : [];
  const ready = built ? Object.values(built.decisions).filter((d) => d.status === 'ready').length : 0;

  const save = async () => {
    if (!built || !ready) return;
    const { changes, summary } = planToChanges(built.plan, built.decisions, snapshot, { now: new Date().toISOString(), by: snapshot.meta.coachName || 'Coach', newId });
    await commit(changes);
    toast(`Saved ${summary.performances} ARM result${summary.performances === 1 ? '' : 's'}${summary.newEvents ? ' as a new ARM tests event' : ''}.`, 'ok');
    setRows([]);
    setNote('');
  };

  const inp = (i: number, k: keyof ArmGridRow, label: string, step = 'any') => (
    <input className="input" type="number" inputMode="decimal" step={step} min={0} aria-label={label} value={(rows[i][k] as string | undefined) ?? ''} onChange={(e) => set(i, { [k]: e.target.value })} />
  );
  const throne = (i: number, k: 'throneL' | 'throneR', label: string) => (
    <select className="select" aria-label={label} value={rows[i][k] ?? ''} onChange={(e) => set(i, { [k]: e.target.value })}>
      <option value="">–</option>
      {[0, 1, 2, 3, 4, 5].map((n) => (
        <option key={n} value={String(n)}>
          {n === 0 ? '0 (not T1 yet)' : `T${n} · ${config.arm.throneSeatsCm[n - 1]} cm`}
        </option>
      ))}
    </select>
  );

  return (
    <Panel title="Enter a session">
      <p className="small" style={{ marginTop: 0 }}>
        Copy each pupil's Armour Card: <strong>Lunge</strong> (cm), <strong>Wall</strong> (reps, not seconds) and <strong>Throne</strong> (number passed), left and right. Leave a box empty if it was not tested. The levels and ARM appear as you type; nothing is saved until you press Save.
      </p>
      <div className="row" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
        <Field label="Date">
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Note (optional)">
          <input className="input" value={note} placeholder="e.g. Season 0, L6 trio sheets" onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Field label="Add a year group">
          <span className="row" style={{ gap: 6 }}>
            <select className="select" value={year} onChange={(e) => setYear(e.target.value as YearGroup)}>
              {YEAR_GROUPS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button className="btn" onClick={() => add(roster.filter((a) => a.yearGroup === year && a.squad !== false).map((a) => a.id))}>
              Add
            </button>
          </span>
        </Field>
        <Field label="Add one pupil">
          <span className="row" style={{ gap: 6 }}>
            <AthletePicker roster={roster} value={pick} onChange={setPick} />
            <button className="btn" disabled={!pick} onClick={() => (pick && add([pick]), setPick(null))}>
              Add
            </button>
          </span>
        </Field>
        <label className="small">
          <input type="checkbox" checked={extra} onChange={(e) => setExtra(e.target.checked)} /> Also hop, pistol, height
        </label>
      </div>

      {rows.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="table arm-grid">
            <thead>
              <tr>
                <th rowSpan={2}>Pupil</th>
                <th colSpan={2}>Lunge cm</th>
                <th colSpan={2}>Wall reps</th>
                <th colSpan={2}>Throne</th>
                {extra && (
                  <>
                    <th colSpan={2}>Hop cm</th>
                    <th colSpan={2}>Pistol</th>
                    <th rowSpan={2}>Height</th>
                  </>
                )}
                <th rowSpan={2}>This test</th>
                <th rowSpan={2} />
              </tr>
              <tr>
                {['L', 'R', 'L', 'R', 'L', 'R', ...(extra ? ['L', 'R', 'L', 'R'] : [])].map((s, i) => (
                  <th key={i} className="tiny">
                    {s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const a = roster.find((x) => x.id === r.athleteId) ?? snapshot.athletes.find((x) => x.id === r.athleteId);
                const name = a ? fullName(a) : r.athleteId;
                return (
                  <tr key={r.athleteId}>
                    <td>{name}</td>
                    <td>{inp(i, 'ankleL', `${name} lunge left`, '0.5')}</td>
                    <td>{inp(i, 'ankleR', `${name} lunge right`, '0.5')}</td>
                    <td>{inp(i, 'calfL', `${name} wall left`, '1')}</td>
                    <td>{inp(i, 'calfR', `${name} wall right`, '1')}</td>
                    <td>{throne(i, 'throneL', `${name} throne left`)}</td>
                    <td>{throne(i, 'throneR', `${name} throne right`)}</td>
                    {extra && (
                      <>
                        <td>{inp(i, 'hopL', `${name} hop left`)}</td>
                        <td>{inp(i, 'hopR', `${name} hop right`)}</td>
                        <td>
                          <input type="checkbox" aria-label={`${name} pistol left`} checked={!!r.pistolL} onChange={(e) => set(i, { pistolL: e.target.checked })} />
                        </td>
                        <td>
                          <input type="checkbox" aria-label={`${name} pistol right`} checked={!!r.pistolR} onChange={(e) => set(i, { pistolR: e.target.checked })} />
                        </td>
                        <td>{inp(i, 'height', `${name} height`, '1')}</td>
                      </>
                    )}
                    <td className="small">
                      <PreviewCell r={r} config={config} />
                    </td>
                    <td>
                      <button className="btn btn-sm btn-ghost" aria-label={`Remove ${name}`} onClick={() => setRows((xs) => xs.filter((_, k) => k !== i))}>
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {problems.length > 0 && (
        <ul className="small" style={{ color: 'var(--err)' }}>
          {problems.map((p) => (
            <li key={p}>{p} (not saved)</li>
          ))}
        </ul>
      )}
      {warnings.length > 0 && (
        <ul className="small muted">
          {warnings.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <button className="btn btn-primary" disabled={!ready} onClick={save}>
          Save {ready} result{ready === 1 ? '' : 's'}
        </button>
        {rows.length > 0 && (
          <button className="btn btn-ghost" onClick={() => setRows([])}>
            Clear
          </button>
        )}
        <span className="tiny muted">* = interim control level from the hop (no Throne result yet).</span>
      </div>
    </Panel>
  );
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return undefined;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Weaker-side raw values from each pupil's latest verified test in the ARM window. */
function latestRaw(d: AthleteDerived, dom: ArmDomain | 'hop', config: Config, asOf: string): number | undefined {
  const tests = d.perfs.filter((p) => p.kind === 'arm' && !p.deleted && p.verified && p.date <= asOf && monthsBetween(p.date, asOf) < config.arm.windowMonths).sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const p of tests) {
    if (dom === 'hop') {
      const v = weakerSide(p.arm, 'hopCm').value;
      if (v != null) return v;
      continue;
    }
    const det = armTestDetail(p.arm, config, { interim: false });
    const v = dom === 'ankle' ? det.ankle.value : dom === 'calf' ? det.calf.counted : det.control.value;
    if (v != null) return v;
  }
  return undefined;
}

function Spread() {
  const { derived } = useData();
  const config = derived.config;
  const [year, setYear] = useState<YearGroup | 'all'>('all');
  const pupils = [...derived.athletes.values()].filter((d) => d.athlete.active && d.athlete.squad !== false && (year === 'all' || d.athlete.yearGroup === year));
  const tested = pupils.filter((d) => ARM_DOMAINS.some((k) => d.ratings.arm[k] != null));
  const unit: Record<ArmDomain | 'hop', string> = { ankle: ' cm', calf: ' reps', control: '', hop: ' cm' };
  const arms = tested.map((d) => d.ratings.stats.ARM).filter((s) => !s.locked).map((s) => s.value!);
  const scatter = tested.map((d) => ({ h: d.athlete.heightCm, t: d.ratings.arm.controlInterim ? undefined : d.ratings.arm.control })).filter((p): p is { h: number; t: number } => p.h != null && p.t != null);
  return (
    <Panel title="ARM spread" actions={<Seg value={year} onChange={setYear} options={[{ value: 'all', label: 'All' }, ...YEAR_GROUPS.filter((y) => y !== 'Staff').map((y) => ({ value: y, label: y }))]} />}>
      <p className="small" style={{ marginTop: 0 }}>
        {tested.length} of {pupils.length} squad pupils tested in the last {config.arm.windowMonths} months · ARM unlocked for {arms.length}
        {arms.length ? ` (median ${median(arms)})` : ''}. Levels are each pupil's best in the window; raw values are from their latest test (weaker leg).
      </p>
      <div className="arm-plates">
        {ARM_DOMAINS.map((dom) => {
          const counts = [0, 1, 2, 3, 4, 5].map((l) => tested.filter((d) => d.ratings.arm[dom] === l).length);
          const none = tested.filter((d) => d.ratings.arm[dom] == null).length;
          const interim = dom === 'control' ? tested.filter((d) => d.ratings.arm.controlInterim).length : 0;
          const raw = tested.map((d) => latestRaw(d, dom, config, derived.asOf)).filter((x): x is number => x != null);
          const max = Math.max(1, none, ...counts);
          return (
            <div key={dom} className="arm-plate">
              <div className="arm-plate-top">
                <strong>{plateName(dom, config).toUpperCase()}</strong>
              </div>
              <div className="arm-bars" style={{ marginTop: 6 }}>
                {counts.map((c, l) => (
                  <FragmentRow key={l} label={l === 0 ? 'below L1' : `L${l}`} count={c} max={max} cls={l === 0 ? 'is-zero' : ''} />
                ))}
                <FragmentRow label="not tested" count={none} max={max} cls="is-none" />
              </div>
              {interim > 0 && <p className="tiny muted">{interim} interim (from the hop, no Throne yet)</p>}
              <p className="tiny muted" style={{ marginBottom: 0 }}>
                {raw.length ? `Raw: min ${Math.min(...raw)} · median ${median(raw)} · max ${Math.max(...raw)}${unit[dom]} (n = ${raw.length})` : dom === 'control' ? 'No Throne results yet.' : 'No raw values yet.'}
              </p>
            </div>
          );
        })}
        {(() => {
          const hops = tested.map((d) => latestRaw(d, 'hop', config, derived.asOf)).filter((x): x is number => x != null);
          return hops.length ? (
            <div className="arm-plate">
              <div className="arm-plate-top">
                <strong>HOP</strong> <span className="tiny muted">not scored</span>
              </div>
              <p className="tiny muted">
                Weaker leg: min {Math.min(...hops)} · median {median(hops)} · max {Math.max(...hops)} cm (n = {hops.length}). Both legs ≥ {config.arm.interim.hopCm} cm gives the interim control level until the Throne is tested.
              </p>
            </div>
          ) : null;
        })()}
      </div>
      <h3 className="small" style={{ marginBottom: 4 }}>Throne level against height (coach only)</h3>
      {scatter.length < 2 ? (
        <p className="tiny muted">Needs at least two pupils with a Throne result and a height (add “height 172” to an ARM line, or the Height box in the grid).</p>
      ) : (
        <Scatter points={scatter} />
      )}
    </Panel>
  );
}

function FragmentRow({ label, count, max, cls }: { label: string; count: number; max: number; cls: string }) {
  return (
    <>
      <span className="tiny">{label}</span>
      <span>
        <span className={`arm-bar ${cls}`} style={{ display: 'block', width: `${(count / max) * 100}%` }} />
      </span>
      <span className="tiny num">{count}</span>
    </>
  );
}

function Scatter({ points }: { points: { h: number; t: number }[] }) {
  const W = 320;
  const H = 170;
  const pad = 30;
  const hs = points.map((p) => p.h);
  const lo = Math.floor(Math.min(...hs) / 5) * 5 - 5;
  const hi = Math.ceil(Math.max(...hs) / 5) * 5 + 5;
  const x = (h: number) => pad + ((h - lo) / (hi - lo)) * (W - pad - 10);
  const y = (t: number) => H - pad - (t / 5) * (H - pad - 10);
  return (
    <svg width={W} height={H} role="img" aria-label="Throne level against height">
      <line x1={pad} y1={H - pad} x2={W - 10} y2={H - pad} stroke="currentColor" opacity={0.3} />
      <line x1={pad} y1={10} x2={pad} y2={H - pad} stroke="currentColor" opacity={0.3} />
      {[0, 1, 2, 3, 4, 5].map((t) => (
        <text key={t} x={pad - 6} y={y(t) + 4} fontSize={10} textAnchor="end" fill="currentColor">
          T{t}
        </text>
      ))}
      <text x={pad} y={H - 8} fontSize={10} fill="currentColor">
        {lo} cm
      </text>
      <text x={W - 10} y={H - 8} fontSize={10} textAnchor="end" fill="currentColor">
        {hi} cm
      </text>
      {points.map((p, i) => (
        <circle key={i} cx={x(p.h)} cy={y(p.t) + ((i % 3) - 1) * 3} r={4} fill="var(--moss)" opacity={0.75} />
      ))}
    </svg>
  );
}

export function ArmouryPage() {
  const [tab, setTab] = useState<Tab>('enter');
  return (
    <div className="stack">
      <PageHeader
        title="Armoury"
        subtitle="Enter ARM results and see the spread of levels"
        actions={
          <>
            <Seg value={tab} onChange={setTab} options={[{ value: 'enter', label: 'Enter results' }, { value: 'spread', label: 'Spread' }]} />
            <Link className="btn" to="/armour">
              What is ARM?
            </Link>
          </>
        }
      />
      {tab === 'enter' ? <EnterSession /> : <Spread />}
      <p className="tiny muted">
        Prefer typing? Paste & Match takes the same thing as text: <code>Name ankle 12/9 calf 22/25 throne 3/2 height 172</code> under <code># test: arm | date</code>.
      </p>
    </div>
  );
}
