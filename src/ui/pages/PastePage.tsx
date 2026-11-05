// Paste-and-Match (spec 4.2–4.4): paste or dictate → review table → approve. Nothing commits before approval.
import './paste.css';
import { useDeferredValue, useMemo, useState } from 'react';
import type { PerfKind } from '../../types';
import { PERF_KINDS } from '../../types';
import { Field, PageHeader, Panel, Seg, newId } from '../components/common';
import { useToast } from '../components/Toast';
import { useData } from '../data/DataContext';
import { Link } from '../router';
import { KIND_LABEL } from '../components/PerformanceEditor';
import { VoiceButton } from '../components/VoiceButton';
import { buildImportPlan, decisionFor, evaluateRow, MATCH_LABEL, planToChanges, willCommit, type PlanRow, type RowDecision, type RowStatus } from '../../engine/parse/plan';
import { ourSchoolNames, type NewAthleteDraft } from '../../engine/parse/newAthletes';
import { NewAthletesDialog } from '../components/NewAthletesDialog';
import { academicYearOf } from '../../engine/dates';
import type { ParseFormat } from '../../engine/parse/types';
import { formatKm, formatTime } from '../../engine/format';
import { fullName } from '../../engine/display';
import { formatLongDate } from '../../engine/dates';

const STATUS_LABEL: Record<RowStatus, string> = { ready: 'Import', review: 'Check', skip: 'Skip', outsider: 'Outsider' };

function resultCell(r: PlanRow): string {
  const raw = r.raw;
  if (raw.laps != null) return `${raw.laps} laps`;
  if (raw.arm) return Object.entries(raw.arm).map(([k, v]) => `${k.replace(/Cm|Reps|Sec|StickBothLegs/, '')} ${v === true ? '✓' : v === false ? '✗' : v}`).join(' · ');
  if (r.kind === 'participation') return 'attended';
  if (raw.timeSec != null) return formatTime(raw.timeSec) + (raw.timeSec % 1 ? `.${Math.round((raw.timeSec % 1) * 10)}` : '');
  return '—';
}

export function PastePage() {
  const { snapshot, config, today, commit } = useData();
  const toast = useToast();
  const [text, setText] = useState('');
  const [format, setFormat] = useState<'auto' | ParseFormat>('auto');
  const [eventId, setEventId] = useState('');
  const [ev, setEv] = useState({ name: '', date: today, kind: 'race' as PerfKind, distanceKm: '', climbM: '', courseName: '' });
  const [decisions, setDecisions] = useState<Record<string, RowDecision>>({});
  const [source, setSource] = useState<'paste' | 'voice'>('paste');
  /** Confirmed new athletes, by name key (created on approval). */
  const [newAthletes, setNewAthletes] = useState<Record<string, NewAthleteDraft>>({});
  const [editingDrafts, setEditingDrafts] = useState<NewAthleteDraft[] | null>(null);
  const deferredText = useDeferredValue(text);
  const existing = snapshot.events.find((e) => e.id === eventId);

  const plan = useMemo(() => {
    if (!deferredText.trim()) return null;
    return buildImportPlan(deferredText, {
      snapshot,
      config,
      today,
      source,
      format,
      ourSchool: ourSchoolNames(snapshot.meta),
      defaults: existing
        ? { eventId: existing.id, name: existing.name, date: existing.date, distanceKm: existing.distanceKm, climbM: existing.climbM, perfKind: ev.kind, courseName: snapshot.courses.find((c) => c.id === existing.courseId)?.name }
        : { name: ev.name.trim() || undefined, date: ev.date, perfKind: ev.kind, distanceKm: ev.distanceKm ? Number(ev.distanceKm) : undefined, climbM: ev.climbM ? Number(ev.climbM) : undefined, courseName: ev.courseName || undefined },
    });
    // decisions are keyed by row id; a new plan resets them
  }, [deferredText, snapshot, config, today, source, format, existing, ev]);

  const rows = plan?.rows ?? [];
  const dec = (r: PlanRow) => decisionFor(r, decisions);
  const setDec = (r: PlanRow, d: RowDecision) => setDecisions((x) => ({ ...x, [r.id]: d }));
  const counts = rows.reduce(
    (acc, r) => {
      const d = dec(r);
      const k = willCommit(d) ? 'ready' : d.status === 'ready' ? 'review' : d.status;
      acc[k]++;
      return acc;
    },
    { ready: 0, review: 0, skip: 0, outsider: 0 } as Record<RowStatus, number>,
  );
  /** Rows that could become a new athlete and have not been given one (or an athlete) yet. */
  const offerable = (r: PlanRow) => !!r.newAthlete && !r.match.athleteId && !willCommit(dec(r));
  const academyDrafts = (() => {
    const seen = new Map<string, NewAthleteDraft>();
    for (const r of rows) if (r.academy && offerable(r) && !seen.has(r.newAthlete!.key)) seen.set(r.newAthlete!.key, newAthletes[r.newAthlete!.key] ?? r.newAthlete!);
    return [...seen.values()];
  })();
  const openDrafts = (ds: NewAthleteDraft[]) => setEditingDrafts(ds.map((d) => newAthletes[d.key] ?? d));
  /** One action per runner: every row with the same name as written goes to the new athlete. */
  const confirmDrafts = (ds: NewAthleteDraft[]) => {
    setNewAthletes((x) => ({ ...x, ...Object.fromEntries(ds.map((d) => [d.key, d])) }));
    const keys = new Set(ds.map((d) => d.key));
    setDecisions((x) => {
      const out = { ...x };
      for (const r of rows) if (r.newAthlete && keys.has(r.newAthlete.key) && !r.match.athleteId) out[r.id] = { status: 'ready', newAthleteKey: r.newAthlete.key };
      return out;
    });
    setEditingDrafts(null);
  };
  const undoDraft = (key: string) => {
    setDecisions((x) => {
      const out = { ...x };
      for (const r of rows) if (out[r.id]?.newAthleteKey === key) delete out[r.id];
      return out;
    });
  };
  const sortedRoster = useMemo(() => [...snapshot.athletes].filter((a) => a.active).sort((a, b) => fullName(a).localeCompare(fullName(b))), [snapshot.athletes]);

  const approve = async () => {
    if (!plan) return;
    const { changes, summary } = planToChanges(plan, decisions, snapshot, {
      now: new Date().toISOString(),
      by: snapshot.meta.coachName || 'Coach',
      newId,
      newAthletes: Object.values(newAthletes),
      yearGroupYear: academicYearOf(today, config.age.academicYearStartMonth, config.age.academicYearStartDay),
    });
    await commit(changes);
    toast(
      `Saved ${summary.performances} results${summary.newAthletes ? ` for ${summary.newAthletes} new athlete${summary.newAthletes > 1 ? 's' : ''} and the roster` : ''}${summary.participation ? ` and ${summary.participation} attendances` : ''}${summary.newEvents ? `, ${summary.newEvents} new event${summary.newEvents > 1 ? 's' : ''}` : ''}${summary.aliasesLearned ? `, learned ${summary.aliasesLearned} alias${summary.aliasesLearned > 1 ? 'es' : ''}` : ''}${summary.outsiders ? ` (${summary.outsiders} outsiders counted for field size, not stored)` : ''}.`,
      'ok',
    );
    setText('');
    setDecisions({});
    setNewAthletes({});
  };

  return (
    <div className="stack paste">
      <PageHeader
        title="Paste & Match"
        subtitle={
          <>
            Paste a results table (website, PDF, Excel, Japanese headers welcome), the <Link to="/help">Tasuki line format</Link>, or a Microsoft/Google Forms CSV export. Review every match, then approve. Nothing is saved before you approve.
          </>
        }
      />
      <Panel title="1 · Event (for text without # headers)">
        <div className="grid-3">
          <Field label="Add to an existing event">
            <select className="select" value={eventId} onChange={(e) => setEventId(e.target.value)}>
              <option value="">(new event, or use # headers)</option>
              {[...snapshot.events].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 60).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} · {formatLongDate(e.date)}
                </option>
              ))}
            </select>
          </Field>
          {!existing && (
            <>
              <Field label="New event name">
                <input className="input" value={ev.name} onChange={(e) => setEv({ ...ev, name: e.target.value })} placeholder="Hachimantai XC" />
              </Field>
              <Field label="Date">
                <input className="input" type="date" value={ev.date} onChange={(e) => setEv({ ...ev, date: e.target.value })} />
              </Field>
            </>
          )}
          <Field label="Results are">
            <select className="select" value={ev.kind} onChange={(e) => setEv({ ...ev, kind: e.target.value as PerfKind })}>
              {PERF_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>
          {!existing && (
            <>
              <Field label="Distance km">
                <input className="input" type="number" step="0.01" value={ev.distanceKm} onChange={(e) => setEv({ ...ev, distanceKm: e.target.value })} />
              </Field>
              <Field label="Climb m">
                <input className="input" type="number" value={ev.climbM} onChange={(e) => setEv({ ...ev, climbM: e.target.value })} />
              </Field>
              <Field label="Course (optional)">
                <select className="select" value={ev.courseName} onChange={(e) => setEv({ ...ev, courseName: e.target.value })}>
                  <option value="">(none)</option>
                  {snapshot.courses.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}
        </div>
      </Panel>

      <Panel
        title="2 · Paste or dictate"
        actions={
          <>
            <VoiceButton
              onText={(t) => {
                setSource('voice');
                setText((x) => (x.trim() ? `${x.replace(/\s+$/, '')}\n${t}` : t));
              }}
            />
            <Seg
              value={format}
              onChange={setFormat}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'line', label: 'Line format' },
                { value: 'table', label: 'Table' },
                { value: 'forms', label: 'Forms CSV' },
              ]}
            />
          </>
        }
      >
        <textarea
          className="textarea paste-box"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (!e.target.value.trim()) setSource('paste');
          }}
          placeholder={'# event: Campus Circuit | 2026-11-04 | circuit\nAiko Testfield 4:52\nBen Sampleton 5:10\n\n…or paste a results table copied from a website, PDF or Excel'}
          spellCheck={false}
          data-testid="paste-box"
        />
        {plan?.warnings.map((w) => (
          <p key={w} className="small" style={{ color: 'var(--warn)', margin: '6px 0 0' }}>
            {w}
          </p>
        ))}
      </Panel>

      {plan && rows.length > 0 && (
        <Panel
          title={`3 · Review (${plan.format === 'line' ? 'line format' : plan.format === 'forms' ? 'Forms export' : 'results table'})`}
          actions={
            <span className="small">
              {academyDrafts.length > 0 && (
                <button className="btn btn-sm btn-primary" style={{ marginRight: 8 }} onClick={() => openDrafts(academyDrafts)} data-testid="add-academy">
                  Add all {academyDrafts.length} academy runner{academyDrafts.length === 1 ? '' : 's'}
                </button>
              )}
              <span className="pill pill-ok">{counts.ready} to import</span> <span className="pill pill-warn">{counts.review} to check</span> <span className="pill">{counts.skip} skipped</span> <span className="pill">{counts.outsider} outsiders</span>
            </span>
          }
        >
          {plan.sections.map((sec) => {
            const secRows = rows.filter((r) => r.sectionKey === sec.key);
            if (!secRows.length) return null;
            return (
              <div key={sec.key} className="paste-section">
                <div className="paste-section-head">
                  <strong>{sec.name || '(unnamed event)'}</strong> · {sec.date ? formatLongDate(sec.date) : ''} · {sec.type === 'participation' ? (sec.participationType === 'freeze' ? 'streak freeze' : 'Saturday run') : KIND_LABEL[sec.perfKind ?? 'race']}
                  {sec.resolvedDistanceKm != null && sec.type !== 'participation' && <> · {formatKm(sec.resolvedDistanceKm)}{sec.resolvedClimbM ? ` +${sec.resolvedClimbM} m` : ''}</>}
                  {sec.eventId ? <span className="pill pill-ai" style={{ marginLeft: 8 }}>adds to existing event</span> : sec.type !== 'participation' && <span className="pill" style={{ marginLeft: 8 }}>new event</span>}
                  {sec.courseId && <span className="pill" style={{ marginLeft: 4 }}>{snapshot.courses.find((c) => c.id === sec.courseId)?.name}</span>}
                  {sec.warnings.map((w) => (
                    <div key={w} className="small" style={{ color: 'var(--warn)' }}>
                      {w}
                    </div>
                  ))}
                </div>
                <div className="table-wrap">
                  <table className="table paste-table">
                    <thead>
                      <tr>
                        <th>Line</th>
                        <th>Parsed name</th>
                        <th>Athlete</th>
                        <th>Match</th>
                        <th className="num">Result</th>
                        <th>Warnings</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {secRows.map((r) => {
                        const d = dec(r);
                        const ev2 = d.athleteId !== r.athleteId ? evaluateRow(r, d.athleteId, plan, snapshot) : null;
                        const warnings = ev2 ? [...r.warnings.filter((w) => !/duplicate|same athlete|already recorded/.test(w)), ...ev2.warnings] : r.warnings;
                        const shown = d.newAthleteKey ? warnings.filter((w) => !/new athlete\?/.test(w)) : warnings;
                        const cls = willCommit(d) ? (shown.length ? 'row-warn' : '') : d.status === 'review' || d.status === 'ready' ? 'row-warn' : 'row-muted';
                        const candidateIds = new Set(r.match.candidates.map((c) => c.athleteId));
                        return (
                          <tr key={r.id} className={cls}>
                            <td className="num">{r.raw.line}</td>
                            <td>{r.raw.name || <span className="muted">—</span>}</td>
                            <td>
                              {d.newAthleteKey && newAthletes[d.newAthleteKey] ? (
                                <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                                  <span className="pill pill-ai">
                                    New: {newAthletes[d.newAthleteKey].preferredName || newAthletes[d.newAthleteKey].givenName} {newAthletes[d.newAthleteKey].familyName} ({newAthletes[d.newAthleteKey].yearGroup}, {newAthletes[d.newAthleteKey].sex})
                                  </span>
                                  <button className="btn btn-sm" onClick={() => openDrafts([newAthletes[d.newAthleteKey!]])}>
                                    Edit
                                  </button>
                                  <button className="btn btn-sm" title="Not a new athlete after all" onClick={() => undoDraft(d.newAthleteKey!)}>
                                    ✕
                                  </button>
                                </span>
                              ) : (
                              <select
                                className="select paste-athlete"
                                value={d.status === 'outsider' ? '__outsider' : d.athleteId ?? ''}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v === '__outsider') setDec(r, { status: 'outsider' });
                                  else if (!v) setDec(r, { status: 'skip' });
                                  else setDec(r, { status: 'ready', athleteId: v });
                                }}
                              >
                                <option value="">— choose —</option>
                                <option value="__outsider">Outsider (not stored)</option>
                                {r.match.candidates.length > 0 && (
                                  <optgroup label="Suggestions">
                                    {r.match.candidates.map((c) => {
                                      const a = snapshot.athletes.find((x) => x.id === c.athleteId);
                                      return a ? (
                                        <option key={c.athleteId} value={c.athleteId}>
                                          {fullName(a)} ({a.yearGroup}){c.type === 'fuzzy' ? ` · ${Math.round(c.score * 100)}%` : ''}
                                        </option>
                                      ) : null;
                                    })}
                                  </optgroup>
                                )}
                                <optgroup label="Roster">
                                  {sortedRoster.filter((a) => !candidateIds.has(a.id)).map((a) => (
                                    <option key={a.id} value={a.id}>
                                      {fullName(a)} ({a.yearGroup})
                                    </option>
                                  ))}
                                </optgroup>
                              </select>
                              )}
                            </td>
                            <td>
                              {d.newAthleteKey ? <span className="pill pill-ai">new athlete</span> : <span className={`pill ${r.match.athleteId ? 'pill-ok' : r.match.type === 'fuzzy' ? 'pill-warn' : r.match.type === 'ambiguous' ? 'pill-err' : ''}`}>{r.academy ? 'our school' : MATCH_LABEL[r.match.type]}</span>}
                            </td>
                            <td className="num nowrap">
                              {resultCell(r)}
                              {r.raw.place != null && <span className="muted tiny"> · {r.raw.place}{r.raw.fieldSize ? `/${r.raw.fieldSize}` : ''}</span>}
                              {r.raw.legNumber != null && <span className="muted tiny"> · leg {r.raw.legNumber}</span>}
                            </td>
                            <td className="small paste-warn">{shown.join(' · ')}</td>
                            <td>
                              {offerable(r) && (
                                <button className={`btn btn-sm ${r.academy ? 'btn-primary' : ''}`} style={{ marginBottom: 4 }} onClick={() => openDrafts([r.newAthlete!])}>
                                  {r.academy ? 'New athlete?' : 'New athlete'}
                                </button>
                              )}
                              {d.status === 'outsider' ? (
                                <div className="muted small">counted, not stored</div>
                              ) : (
                                <label className="check small">
                                  <input
                                    type="checkbox"
                                    checked={willCommit(d)}
                                    disabled={!d.athleteId && !d.newAthleteKey}
                                    onChange={(e) => setDec(r, { status: e.target.checked ? 'ready' : 'skip', athleteId: d.athleteId, newAthleteKey: d.newAthleteKey })}
                                  />
                                  {willCommit(d) ? STATUS_LABEL.ready : d.status === 'review' ? 'Confirm?' : STATUS_LABEL.skip}
                                </label>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
          <div className="row-between" style={{ marginTop: 14 }}>
            <span className="small muted">
              Fuzzy matches are suggestions: tick them to confirm. Confirmed spellings are remembered as aliases. A runner not on the roster can be added with <strong>New athlete</strong> (set “Our school” names in Settings → Data to spot your own runners). Outsiders count towards the field size; only the category winner’s time is kept.
            </span>
            <button className="btn btn-accent btn-lg" disabled={counts.ready === 0} onClick={approve} data-testid="approve-paste">
              Approve {counts.ready} result{counts.ready === 1 ? '' : 's'}
            </button>
          </div>
        </Panel>
      )}
      {editingDrafts && <NewAthletesDialog drafts={editingDrafts} onClose={() => setEditingDrafts(null)} onConfirm={confirmDrafts} />}
      {plan && rows.length === 0 && (
        <Panel>
          <p className="muted">No results found yet. Each line needs a name and a time (or laps / ARM measures).</p>
        </Panel>
      )}
    </div>
  );
}
