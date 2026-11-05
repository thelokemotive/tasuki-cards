// Confirm one or more new athletes found in pasted results (go-live plan 3). Prefilled from the name as
// written and the category column; the coach picks the year group (one picker for everyone, or per row).
import { useState } from 'react';
import type { Sex, YearGroup } from '../../types';
import { YEAR_GROUPS } from '../../types';
import { Modal } from './common';
import { draftProblem, type NewAthleteDraft } from '../../engine/parse/newAthletes';
import { findDuplicateAthlete } from '../../engine/names';
import { useData } from '../data/DataContext';

export function NewAthletesDialog({ drafts, onClose, onConfirm }: { drafts: NewAthleteDraft[]; onClose: () => void; onConfirm: (d: NewAthleteDraft[]) => void }) {
  const { snapshot, today, config } = useData();
  const [rows, setRows] = useState<NewAthleteDraft[]>(drafts);
  const set = (i: number, patch: Partial<NewAthleteDraft>) => setRows((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const problems = rows.map(draftProblem);
  const ready = problems.every((p) => !p);
  const many = rows.length > 1;
  return (
    <Modal
      title={many ? `Add ${rows.length} new athletes` : 'New athlete'}
      onClose={onClose}
      wide
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!ready} onClick={() => onConfirm(rows)} data-testid="confirm-new-athletes">
            {many ? `Add ${rows.length} athletes` : 'Add athlete'}
          </button>
        </>
      }
    >
      <p className="small muted" style={{ marginTop: 0 }}>
        They are added to the roster when you approve the results. The name as written in kanji or kana is kept as an alias, so the next results table matches it. Dates of birth and aliases can be added later on the athlete page.
      </p>
      {many && (
        <div className="row" style={{ marginBottom: 10 }}>
          <span className="small">Year group for everyone:</span>
          <select className="select" style={{ maxWidth: 140 }} value="" onChange={(e) => e.target.value && setRows((xs) => xs.map((x) => ({ ...x, yearGroup: e.target.value as YearGroup })))}>
            <option value="">choose…</option>
            {YEAR_GROUPS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>As written</th>
              <th>First name</th>
              <th>Family name</th>
              <th>Sex</th>
              <th>Year</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((d, i) => {
              const dup = d.yearGroup
                ? findDuplicateAthlete({ givenName: d.givenName || d.preferredName, familyName: d.familyName, preferredName: d.preferredName, yearGroup: d.yearGroup }, snapshot.athletes, { asOf: today, config })
                : undefined;
              return (
                <tr key={d.key}>
                  <td className="small">{d.asWritten}</td>
                  <td>
                    <input className="input" value={d.givenName} onChange={(e) => set(i, { givenName: e.target.value, preferredName: e.target.value })} aria-label="First name" />
                  </td>
                  <td>
                    <input className="input" value={d.familyName} onChange={(e) => set(i, { familyName: e.target.value })} aria-label="Family name" />
                  </td>
                  <td>
                    <select className="select" value={d.sex ?? ''} onChange={(e) => set(i, { sex: (e.target.value || undefined) as Sex | undefined })} aria-label="Sex">
                      <option value="">—</option>
                      <option value="F">F</option>
                      <option value="M">M</option>
                    </select>
                  </td>
                  <td>
                    <select className="select" value={d.yearGroup ?? ''} onChange={(e) => set(i, { yearGroup: (e.target.value || undefined) as YearGroup | undefined })} aria-label="Year group">
                      <option value="">—</option>
                      {YEAR_GROUPS.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="small" style={{ color: problems[i] ? 'var(--warn)' : dup ? 'var(--warn)' : undefined }}>
                    {problems[i] ?? (dup ? `already on the roster? ${dup.preferredName} ${dup.familyName} (${dup.yearGroup})` : '')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
