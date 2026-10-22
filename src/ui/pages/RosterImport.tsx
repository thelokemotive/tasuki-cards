// Roster import (spec 4.5): paste rows, map columns, review, approve. Nothing is saved until approval.
import { useMemo, useState } from 'react';
import type { Athlete } from '../../types';
import { Modal } from '../components/common';
import { useToast } from '../components/Toast';
import { useData } from '../data/DataContext';
import { newAthlete } from '../components/AthleteEditor';
import { newId } from '../components/common';
import { detectRosterLayout, parseRoster, ROSTER_FIELD_LABELS, type RosterField, type RosterLayout } from '../../engine/parse/roster';
import { splitLine } from '../../engine/parse/split';

const FIELDS = Object.keys(ROSTER_FIELD_LABELS) as RosterField[];

export function RosterImport({ onClose }: { onClose: () => void }) {
  const { snapshot, today, config, commit } = useData();
  const toast = useToast();
  const [text, setText] = useState('');
  const [override, setOverride] = useState<RosterLayout | null>(null);
  const [skipDup, setSkipDup] = useState(true);
  const detected = useMemo(() => (text.trim() ? detectRosterLayout(text) : null), [text]);
  const layout = override && detected && override.delimiter === detected.delimiter ? override : detected;
  const rows = useMemo(() => (layout ? parseRoster(text, layout, { roster: snapshot.athletes, asOf: today, config }) : []), [text, layout, snapshot.athletes, today, config]);
  const sample = layout ? text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 1).map((l) => splitLine(l, layout.delimiter))[0] ?? [] : [];
  const usable = rows.filter((r) => !r.errors.length && !(skipDup && r.duplicateOf));

  const approve = async () => {
    const athletes: Athlete[] = usable.map((r) => {
      const base = newAthlete(newId('ath'), today, config.age.academicYearStartMonth, config.age.academicYearStartDay);
      const a: Athlete = {
        ...base,
        givenName: r.givenName,
        familyName: r.familyName,
        preferredName: r.preferredName,
        sex: r.sex!,
        yearGroup: r.yearGroup!,
        aliases: r.aliases,
        ...(r.dob ? { dob: r.dob } : {}),
        ...(r.house ? { house: r.house } : {}),
        ...(r.notes ? { notes: r.notes } : {}),
      };
      return a;
    });
    await commit({ put: { athletes } });
    toast(`Imported ${athletes.length} athletes`, 'ok');
    onClose();
  };

  return (
    <Modal
      title="Import roster"
      wide
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!usable.length} onClick={approve} data-testid="approve-roster">
            Import {usable.length} athletes
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="small">
          Paste rows from the school spreadsheet (copy the cells straight from Excel), or simple lines: <code>Surname, Preferred name, Year, Sex[, DOB][, alias; alias]</code>. Dates of birth are optional and stay coach-only.
        </p>
        <textarea className="textarea" value={text} onChange={(e) => { setText(e.target.value); setOverride(null); }} placeholder={'Surname\tPreferred Name\tYear\tGender\nTestfield\tAiko\t9\tF'} style={{ minHeight: 140 }} autoFocus />
        {layout && (
          <>
            <div>
              <div className="label small" style={{ fontWeight: 600, marginBottom: 6 }}>
                Column mapping {layout.hasHeader ? '(from the header row)' : '(no header row found: guessed from position)'}
              </div>
              <div className="row">
                {layout.columns.map((f, j) => (
                  <label key={j} className="field" style={{ minWidth: 130 }}>
                    <span className="hint">{layout.hasHeader ? layout.headerCells[j] : `Column ${j + 1}: “${(sample[j] ?? '').slice(0, 14)}”`}</span>
                    <select
                      className="select"
                      value={f}
                      onChange={(e) => {
                        const columns = [...layout.columns];
                        columns[j] = e.target.value as RosterField;
                        setOverride({ ...layout, columns });
                      }}
                    >
                      {FIELDS.map((x) => (
                        <option key={x} value={x}>
                          {ROSTER_FIELD_LABELS[x]}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>
            <label className="check small">
              <input type="checkbox" checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} />
              Skip rows that look like athletes already on the roster (same name and year)
            </label>
            <div className="table-wrap" style={{ maxHeight: 340, overflowY: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Line</th>
                    <th>Preferred</th>
                    <th>Family</th>
                    <th>Year</th>
                    <th>Sex</th>
                    <th>DOB</th>
                    <th>Aliases</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const dup = r.duplicateOf ? snapshot.athletes.find((a) => a.id === r.duplicateOf) : undefined;
                    return (
                      <tr key={r.line} className={r.errors.length ? 'row-err' : dup || r.warnings.length ? 'row-warn' : ''}>
                        <td className="num">{r.line}</td>
                        <td>{r.preferredName}</td>
                        <td>{r.familyName}</td>
                        <td>{r.yearGroup ?? '—'}</td>
                        <td>{r.sex ?? '—'}</td>
                        <td>{r.dob ? '✓' : ''}</td>
                        <td className="small">{r.aliases.join('; ')}</td>
                        <td className="small">
                          {r.errors.length ? r.errors.join('; ') : dup ? `Duplicate of ${dup.preferredName} ${dup.familyName} (${dup.yearGroup})${skipDup ? ': skipped' : ''}` : r.warnings.join('; ') || 'Ready'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
