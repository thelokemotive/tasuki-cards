// Holiday Microsoft Form CSV: map the columns once (remembered), then the same review table as the Gym Log
// sheet. Rows that cannot be matched go to the coach radar when the rest is approved.
import { useMemo, useState } from 'react';
import { FORM_FIELDS, guessMapping, parseGymForm, readFormTable, unmatchedEntries, type FormMapping } from '../../engine/parse/gymForm';
import type { GymImportRow } from '../../engine/parse/gymLine';
import { useData } from '../data/DataContext';
import { GymReview } from './GymReview';
import { Field, Panel } from './common';

export function GymFormImport({ text, onDone }: { text: string; onDone: () => void }) {
  const { fullSnapshot: snapshot, config, today } = useData();
  const header = useMemo(() => readFormTable(text).header, [text]);
  const [mapping, setMapping] = useState<FormMapping>(() => guessMapping(header, snapshot.meta.gymFormMapping));
  const imp = useMemo(() => parseGymForm(text, mapping, snapshot.athletes, config, today), [text, mapping, snapshot.athletes, config, today]);

  const onUnmatched = (rows: GymImportRow[]) => {
    const at = new Date().toISOString();
    const known = new Set((snapshot.meta.gymUnmatched ?? []).map((u) => u.key));
    const add = unmatchedEntries(rows, at).filter((u) => !known.has(u.key));
    return { meta: { ...snapshot.meta, gymFormMapping: mapping as Record<string, string>, gymUnmatched: [...(snapshot.meta.gymUnmatched ?? []), ...add] } };
  };

  return (
    <>
      <Panel title="2b · Holiday Form columns (remembered for next time)">
        <div className="grid-3">
          {FORM_FIELDS.map((f) => (
            <Field key={f.field} label={`${f.label}${f.required ? '' : ' (optional)'}`}>
              <select className="select" value={mapping[f.field] ?? ''} onChange={(e) => setMapping((m) => ({ ...m, [f.field]: e.target.value || undefined }))}>
                <option value="">—</option>
                {header.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </Field>
          ))}
          <Field label="Dates like 1/2/2027 mean" hint="Dates with a day above 12 are read either way.">
            <select className="select" value={mapping.dateOrder ?? 'dmy'} onChange={(e) => setMapping((m) => ({ ...m, dateOrder: e.target.value as 'dmy' | 'mdy' }))}>
              <option value="dmy">1 February (day first)</option>
              <option value="mdy">January 2 (month first)</option>
            </select>
          </Field>
        </div>
        <p className="small muted">
          Answers are matched to cards by their names in Settings → White Season. “Did anything hurt? Yes” marks the session “!” for the coach radar. Holiday weeks are set automatically from the date.
        </p>
      </Panel>
      <GymReview imp={imp} onDone={onDone} onUnmatched={onUnmatched} />
    </>
  );
}
