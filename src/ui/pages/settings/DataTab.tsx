// Settings → Data: export everything, import (replace or merge), demo data, as-of date, coach name.
import { useRef, useState } from 'react';
import { Field, Modal, Panel } from '../../components/common';
import { useToast } from '../../components/Toast';
import { useData } from '../../data/DataContext';
import { exportEverything } from '../../data/backup';
import { mergeSnapshots, parseExport, ImportError } from '../../../store/exportImport';
import { buildDemoData, mergeDemoCalendar, withoutDemoData } from '../../../demo/demoData';
import { emptySnapshot } from '../../../store/Store';
import { formatLongDate, isISODate } from '../../../engine/dates';
import type { DataSnapshot } from '../../../types';

export function DataTab() {
  const { snapshot, commit, replaceAll, today, asOf, setAsOf, persistent } = useData();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ snap: DataSnapshot; name: string } | null>(null);
  const [confirm, setConfirm] = useState<null | 'demo' | 'clearDemo' | 'clearAll'>(null);
  const realAthletes = snapshot.athletes.filter((a) => !a.demo).length;
  const demoAthletes = snapshot.athletes.filter((a) => a.demo).length;

  const onFile = async (f: File) => {
    try {
      const parsed = parseExport(await f.text());
      setPending({ snap: parsed.snapshot, name: f.name });
    } catch (e) {
      toast(e instanceof ImportError ? e.message : `Could not read the file: ${String(e)}`, 'err');
    }
  };

  const loadDemo = async () => {
    const demo = buildDemoData(today);
    await commit({
      put: { athletes: demo.athletes, courses: demo.courses, events: demo.events, performances: demo.performances, participation: demo.participation, achievements: demo.achievements },
      calendar: mergeDemoCalendar(snapshot.calendar, demo.calendar),
      meta: { ...snapshot.meta, demoLoaded: true },
    });
    setConfirm(null);
    toast(`Demo data loaded: ${demo.athletes.length} invented athletes`, 'ok');
  };

  const clearDemo = async () => {
    const cleaned = withoutDemoData(snapshot);
    await replaceAll({ ...cleaned, meta: { ...cleaned.meta, demoLoaded: false } });
    setConfirm(null);
    toast('Demo data cleared', 'ok');
  };

  return (
    <div className="stack">
      <Panel title="Backup">
        <p>
          <strong>Export everything</strong> saves the roster, aliases, results (with their correction history), events, courses, calendar, every config version, achievements and avatars as one .json file. It includes dates of birth: keep it private and never print it.
        </p>
        <div className="row">
          <button
            className="btn btn-primary"
            data-testid="export"
            onClick={() => commit(exportEverything(snapshot)).then(() => toast('Backup downloaded', 'ok'))}
          >
            Export everything (.json)
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()} data-testid="import">
            Import a backup…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = '';
            }}
          />
          <span className="muted small">
            Last backup: {snapshot.meta.lastBackupAt ? formatLongDate(snapshot.meta.lastBackupAt.slice(0, 10)) : 'never'}
          </span>
        </div>
        {!persistent && <p className="small" style={{ color: 'var(--err)', marginTop: 8 }}>Browser storage is unavailable: export before closing this tab.</p>}
      </Panel>

      <Panel title="Demo data">
        <p>
          Demo data adds {buildDemoData(today).athletes.length} invented athletes with a season of results, so you can try every screen. Each demo record is tagged, so clearing it removes exactly those records and nothing you imported.
        </p>
        <div className="row">
          <button className="btn" data-testid="load-demo" onClick={() => setConfirm('demo')} disabled={snapshot.meta.demoLoaded}>
            Load demo data
          </button>
          <button className="btn btn-danger" data-testid="clear-demo" onClick={() => setConfirm('clearDemo')} disabled={!demoAthletes && !snapshot.meta.demoLoaded}>
            Clear all demo data
          </button>
          <span className="muted small">
            {demoAthletes} demo athletes · {realAthletes} real athletes
          </span>
        </div>
      </Panel>

      <Panel title="Ratings date and coach name">
        <div className="grid-2">
          <Field label="Compute ratings as of" hint="Normally today. Set a past date to see the cards and boards as they were then.">
            <div className="row">
              <input className="input" type="date" value={asOf} max="2100-12-31" onChange={(e) => isISODate(e.target.value) && setAsOf(e.target.value === today ? null : e.target.value)} style={{ maxWidth: 200 }} />
              {asOf !== today && (
                <button className="btn btn-sm" onClick={() => setAsOf(null)}>
                  Back to today
                </button>
              )}
            </div>
          </Field>
          <Field label="Name recorded in correction history">
            <input
              className="input"
              defaultValue={snapshot.meta.coachName ?? ''}
              placeholder="Coach"
              onBlur={(e) => e.target.value !== (snapshot.meta.coachName ?? '') && commit({ meta: { ...snapshot.meta, coachName: e.target.value.trim() || undefined } })}
            />
          </Field>
        </div>
      </Panel>

      <Panel title="Danger zone">
        <div className="row">
          <button className="btn btn-danger" onClick={() => setConfirm('clearAll')}>
            Delete everything…
          </button>
          <span className="muted small">Removes every athlete, result and setting from this browser. Export first.</span>
        </div>
      </Panel>

      {pending && (
        <Modal
          title={`Import ${pending.name}`}
          onClose={() => setPending(null)}
          actions={
            <>
              <button className="btn" onClick={() => setPending(null)}>
                Cancel
              </button>
              <button
                className="btn"
                onClick={async () => {
                  const { merged, summary } = mergeSnapshots(snapshot, pending.snap);
                  await replaceAll(merged);
                  setPending(null);
                  toast(`Merged: ${summary.added.athletes} athletes and ${summary.added.performances} results added, ${summary.updated.performances} results updated`, 'ok');
                }}
              >
                Merge into current data
              </button>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  await replaceAll(pending.snap);
                  setPending(null);
                  toast('Backup restored', 'ok');
                }}
              >
                Replace everything
              </button>
            </>
          }
        >
          <p>
            The backup holds {pending.snap.athletes.length} athletes, {pending.snap.performances.length} results, {pending.snap.events.length} events and {pending.snap.configs.length} config versions.
          </p>
          <ul className="small">
            <li><strong>Replace everything</strong>: this browser ends up exactly like the backup.</li>
            <li><strong>Merge</strong>: adds anything new; where the same record exists in both, the backup's copy wins.</li>
          </ul>
        </Modal>
      )}

      {confirm === 'demo' && (
        <Modal
          title="Load demo data?"
          onClose={() => setConfirm(null)}
          actions={
            <>
              <button className="btn" onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" data-testid="confirm-load-demo" onClick={loadDemo}>
                Load demo data
              </button>
            </>
          }
        >
          <p>This adds invented athletes, events and results. Clear them before importing your real roster.</p>
        </Modal>
      )}
      {confirm === 'clearDemo' && (
        <Modal
          title="Clear all demo data?"
          onClose={() => setConfirm(null)}
          actions={
            <>
              <button className="btn" onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" data-testid="confirm-clear-demo" onClick={clearDemo}>
                Clear demo data
              </button>
            </>
          }
        >
          <p>Removes every demo athlete, event, result and demo calendar entry. Your own data stays.</p>
        </Modal>
      )}
      {confirm === 'clearAll' && (
        <Modal
          title="Delete everything?"
          onClose={() => setConfirm(null)}
          actions={
            <>
              <button className="btn" onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={async () => {
                  await replaceAll(emptySnapshot());
                  setConfirm(null);
                  toast('Everything deleted', 'ok');
                }}
              >
                Delete everything
              </button>
            </>
          }
        >
          <p>This cannot be undone, except by importing a backup.</p>
        </Modal>
      )}
    </div>
  );
}
