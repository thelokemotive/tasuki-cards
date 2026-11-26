// Review table for White Season imports (the Gym Log sheet paste block and the holiday Form CSV): every name
// matched with the usual matcher, every warning shown, nothing saved before Approve.
import { useMemo, useState } from 'react';
import type { GymImport, GymImportRow } from '../../engine/parse/gymLine';
import { evaluateGymImport, gymImportChanges } from '../../engine/parse/gymLine';
import { MATCH_LABEL } from '../../engine/parse/plan';
import { fullName } from '../../engine/display';
import { formatShortDate } from '../../engine/dates';
import { useData } from '../data/DataContext';
import { useToast } from './Toast';
import { Panel } from './common';

const ACTION_LABEL = { gym: 'gym', summit: 'Summit pass', freeze: 'freeze' } as const;

export function GymReview({ imp, onDone, onUnmatched }: { imp: GymImport; onDone: () => void; onUnmatched?: (rows: GymImportRow[]) => Record<string, unknown> | undefined }) {
  const { fullSnapshot: snapshot, config, commit } = useData();
  const toast = useToast();
  const [picked, setPicked] = useState<Record<string, string>>({});
  const roster = useMemo(() => [...snapshot.athletes].filter((a) => a.active).sort((a, b) => fullName(a).localeCompare(fullName(b))), [snapshot.athletes]);
  const nameOf = (id: string) => {
    const a = snapshot.athletes.find((x) => x.id === id);
    return a ? fullName(a) : id;
  };
  /** Confident matches are chosen; a fuzzy suggestion or a clash waits for the coach. */
  const chosen = useMemo(() => Object.fromEntries(imp.rows.map((r) => [r.key, picked[r.key] !== undefined ? picked[r.key] || undefined : r.match.athleteId])), [imp, picked]);
  const evals = useMemo(() => evaluateGymImport(imp, chosen, snapshot, config), [imp, chosen, snapshot, config]);

  const toImport = imp.rows.reduce((a, r) => a + (evals.get(r.key)?.entries.filter((e) => e.action === 'import').length ?? 0) + (evals.get(r.key)?.rf?.action === 'import' ? 1 : 0) + (evals.get(r.key)?.other?.action === 'import' ? 1 : 0), 0);
  const waiting = imp.rows.filter((r) => !chosen[r.key]).length;
  const amber = imp.rows.reduce((a, r) => a + (evals.get(r.key)?.entries.filter((e) => e.amber).length ?? 0), 0);

  const approve = async () => {
    const { changes, summary } = gymImportChanges(imp, chosen, snapshot, config, new Date().toISOString());
    const extra = onUnmatched?.(imp.rows.filter((r) => !chosen[r.key]));
    await commit(extra ? { ...changes, ...extra } : changes);
    toast(
      `Saved ${summary.sessions} gym session${summary.sessions === 1 ? '' : 's'} (${summary.credited} credited)` +
        (summary.rfs ? `, ${summary.rfs} recovery week${summary.rfs === 1 ? '' : 's'}` : '') +
        (summary.summitPasses ? `, ${summary.summitPasses} Summit pass${summary.summitPasses === 1 ? '' : 'es'}` : '') +
        (summary.freezes ? `, ${summary.freezes} freeze${summary.freezes === 1 ? '' : 's'}` : '') +
        (summary.aliases ? `, learned ${summary.aliases} alias${summary.aliases === 1 ? '' : 'es'}` : '') +
        '. Ratings are not affected.',
      'ok',
    );
    onDone();
  };

  return (
    <Panel
      title={`3 · Review (${imp.format === 'form' ? 'holiday Form' : 'Gym Log sheet'})`}
      actions={
        <span className="small">
          <span className="pill pill-ok">{toImport} to import</span> {waiting > 0 && <span className="pill pill-warn">{waiting} to choose</span>} {amber > 0 && <span className="pill pill-amber">{amber} “!”</span>}
        </span>
      }
    >
      {imp.warnings.map((w) => (
        <p key={w} className="small" style={{ color: 'var(--warn)', margin: '0 0 6px' }}>
          {w}
        </p>
      ))}
      <div className="table-wrap">
        <table className="table paste-table" data-testid="gym-review">
          <thead>
            <tr>
              <th>Line</th>
              <th>Written</th>
              <th>Athlete</th>
              <th>Match</th>
              <th>Entries</th>
              <th>Warnings</th>
            </tr>
          </thead>
          <tbody>
            {imp.rows.map((r) => {
              const ev = evals.get(r.key)!;
              const value = chosen[r.key] ?? '';
              const cands = r.match.candidates.map((c) => c.athleteId);
              const rowWarnings = [...ev.warnings, ...(ev.rf?.warnings ?? []), ...(ev.other?.warnings ?? []), ...r.match.warnings];
              const entryWarnings = r.entries.flatMap((e) => {
                const ee = ev.entries.find((x) => x.key === e.key);
                return ee?.warnings.length ? [`${formatShortDate(e.date)} ${e.code}: ${ee.warnings.join(', ')}`] : [];
              });
              return (
                <tr key={r.key} className={!value ? 'row-dim' : undefined}>
                  <td className="num">{r.line}</td>
                  <td>
                    {r.name || <span className="muted">—</span>}
                    {r.email && <div className="tiny muted">{r.email}</div>}
                  </td>
                  <td>
                    <select className="select paste-athlete" value={value} onChange={(e) => setPicked((x) => ({ ...x, [r.key]: e.target.value }))} aria-label={`Athlete for ${r.name}`}>
                      <option value="">{cands.length ? '— check the suggestion —' : '— skip (no match) —'}</option>
                      {cands.map((id) => (
                        <option key={`c${id}`} value={id}>
                          {nameOf(id)} {r.match.athleteId === id ? '' : '(suggested)'}
                        </option>
                      ))}
                      <option disabled>──────────</option>
                      {roster
                        .filter((a) => !cands.includes(a.id))
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {fullName(a)} · {a.yearGroup}
                          </option>
                        ))}
                    </select>
                  </td>
                  <td>
                    <span className={`pill ${r.match.athleteId ? 'pill-ok' : r.match.type === 'fuzzy' ? 'pill-warn' : r.match.type === 'ambiguous' ? 'pill-err' : ''}`}>{MATCH_LABEL[r.match.type]}</span>
                  </td>
                  <td>
                    {r.action !== 'gym' ? (
                      <span className="pill">{ACTION_LABEL[r.action]}{r.freezeKind ? `: ${r.freezeKind}` : ''} · {formatShortDate(r.date)}</span>
                    ) : (
                      <span className="gym-chips">
                        {r.entries.map((e) => {
                          const ee = ev.entries.find((x) => x.key === e.key);
                          const cls = !ee || ee.action === 'skip' ? 'gym-chip-skip' : ee.credited ? 'gym-chip-ok' : 'gym-chip-extra';
                          return (
                            <span key={e.key} className={`gym-chip ${cls}${e.hurt ? ' gym-chip-amber' : ''}`} title={ee?.warnings.join(' · ') || (ee?.credited ? 'credited' : '')}>
                              {formatShortDate(e.date).split(' ')[0]} {e.code}
                            </span>
                          );
                        })}
                        {r.rf && <span className={`gym-chip ${ev.rf?.action === 'skip' ? 'gym-chip-skip' : 'gym-chip-rf'}`}>RF</span>}
                      </span>
                    )}
                  </td>
                  <td className={`small ${r.entries.some((e) => e.hurt) ? 'paste-amber' : 'paste-warn'}`}>{[...rowWarnings, ...entryWarnings].join(' · ')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="row-between" style={{ marginTop: 14 }}>
        <span className="small muted">
          Green: credited. Grey: stored, earns nothing (same date or over the weekly cap). Struck out: not imported. Amber: “!” something hurt (also on the coach radar). Choose a runner for every suggestion; a confirmed spelling is remembered. Gym sessions never change a rating.
        </span>
        <button className="btn btn-accent btn-lg" disabled={toImport === 0} onClick={approve} data-testid="approve-gym">
          Approve {toImport} item{toImport === 1 ? '' : 's'}
        </button>
      </div>
    </Panel>
  );
}
