// Winter Mode: the holidays and the snow season. Set the winter weeks, paste the top-up form's responses,
// tick off the Tuesday gym, and see who has kept their week, who needs a nudge and who needs a word.
import { useMemo, useState } from 'react';
import type { Participation, WinterPhase } from '../../types';
import { Empty, Field, PageHeader, Panel, Seg, newId } from '../components/common';
import { useData } from '../data/DataContext';
import { useToast } from '../components/Toast';
import { Link } from '../router';
import { displayName, fullName } from '../../engine/display';
import { formatLongDate, isoWeek, isISODate } from '../../engine/dates';
import { parseTopUps, topUpParticipation } from '../../engine/parse/topUps';
import { YEAR_GROUPS } from '../../types';
import { PaceLine, WeekStrip } from '../components/WinterPanel';
import { pacePlan, winterHouseCup } from '../../engine/winter';
import { formatTime } from '../../engine/format';

const FORM_QUESTIONS = [
  'Date of the session (date)',
  'What did you do? (choice: Run outdoors / Treadmill / Gym session / Armour: calf raises, pogo hops, ankle work / Ski or snowboard day)',
  'How many minutes? (number)',
  'Kilometres, if the treadmill or watch shows them (number, optional)',
  'Did you finish with race-pace surges or strides? (Yes / No)',
  'Photo of the treadmill screen or watch: the screen only, no people (file upload, optional)',
  'How sore afterwards? 0 = fine, 10 = very sore (rating 0–10)',
];

export function WinterPage() {
  const { snapshot, derived, config, commit, asOf } = useData();
  const toast = useToast();
  const cal = snapshot.calendar;
  const phases = cal.winter ?? [];
  const [phase, setPhase] = useState<{ name: string; start: string; end: string; kind: WinterPhase['kind'] }>({ name: '', start: '', end: '', kind: 'holiday' });
  const [paste, setPaste] = useState('');
  const [names, setNames] = useState<'coach' | 'display'>('coach');
  const [view, setView] = useState<'week' | 'pace'>('week');
  const [gymDate, setGymDate] = useState(asOf);
  const [gymMinutes, setGymMinutes] = useState('45');
  const [gymSharp, setGymSharp] = useState(true);
  const [gymPicked, setGymPicked] = useState<Set<string>>(new Set());

  const active = useMemo(
    () => snapshot.athletes.filter((a) => a.active).sort((a, b) => YEAR_GROUPS.indexOf(a.yearGroup) - YEAR_GROUPS.indexOf(b.yearGroup) || fullName(a).localeCompare(fullName(b))),
    [snapshot.athletes],
  );
  const summaries = active.map((a) => derived.athletes.get(a.id)).filter((d) => d?.winter).map((d) => d!);
  const cup = winterHouseCup(summaries.map((d) => d.winter!), active);
  const parsed = useMemo(() => (paste.trim() ? parseTopUps(paste, active, config, asOf) : undefined), [paste, active, config, asOf]);
  const toImport = parsed ? topUpParticipation(parsed.rows, () => newId('part')) : [];
  const nameOf = (id: string) => {
    const a = snapshot.athletes.find((x) => x.id === id);
    return a ? (names === 'coach' ? fullName(a) : displayName(a)) : id;
  };

  const coachFlags = summaries.flatMap((d) => d.winter!.flags.filter((f) => f.coach).map((f) => ({ d, f })));
  const keptThisWeek = summaries.filter((d) => d.winter!.thisWeek?.state === 'kept').length;
  const pupils = summaries.filter((d) => d.athlete.yearGroup !== 'Staff');

  const savePhases = (list: WinterPhase[]) => commit({ calendar: { ...cal, winter: list.sort((a, b) => (a.start < b.start ? -1 : 1)) } });

  return (
    <div className="stack">
      <PageHeader
        title="Winter Mode"
        subtitle="Two sessions a week, one of them a run. Keep the flame lit over the holidays and the snow season, arrive in spring with your speed."
        actions={<Seg value={names} onChange={setNames} options={[{ value: 'coach', label: 'Full names' }, { value: 'display', label: 'Display names' }]} />}
      />

      <Panel title="Winter weeks">
        <p className="small muted">
          In these weeks a runner keeps their week with {config.winter.sessionsPerWeek} sessions ({config.winter.staffSessionsPerWeek} for staff), at least one a run of {config.winter.minRunMinutes}+ minutes
          (outdoors, treadmill, parkrun or the Circuit). One armour or gym session can stand in for the other. Ski days are logged but do not count: ski boots
          give the calves and Achilles no running impact, which is the point. Extra sessions earn nothing, so nobody crams. A kept week also counts in the
          main streak; a missed holiday week never breaks it. Each runner has {config.winter.restPasses} rest pass for the winter, used automatically; for
          illness or injury use "Apply freeze" on the athlete page.
        </p>
        <div className="table-wrap" style={{ marginBottom: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Phase</th>
                <th>Kind</th>
                <th>From</th>
                <th>To</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {phases.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No winter weeks yet. Add the Christmas holiday and the snow season to switch Winter Mode on.
                  </td>
                </tr>
              )}
              {phases.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.kind === 'holiday' ? 'Holiday' : 'Snow season'}</td>
                  <td>{formatLongDate(p.start)}</td>
                  <td>{formatLongDate(p.end)}</td>
                  <td className="right">
                    <button className="btn btn-sm btn-danger" onClick={() => savePhases(phases.filter((x) => x.id !== p.id))}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Field label="Name">
            <input className="input" value={phase.name} placeholder="Christmas holiday" onChange={(e) => setPhase({ ...phase, name: e.target.value })} />
          </Field>
          <Field label="Kind">
            <select className="input" value={phase.kind} onChange={(e) => setPhase({ ...phase, kind: e.target.value as WinterPhase['kind'] })}>
              <option value="holiday">Holiday (no school runs)</option>
              <option value="snow">Snow season (skiing, gym)</option>
            </select>
          </Field>
          <Field label="From">
            <input className="input" type="date" value={phase.start} onChange={(e) => setPhase({ ...phase, start: e.target.value })} />
          </Field>
          <Field label="To">
            <input className="input" type="date" value={phase.end} onChange={(e) => setPhase({ ...phase, end: e.target.value })} />
          </Field>
          <button
            className="btn btn-primary"
            disabled={!phase.name.trim() || !isISODate(phase.start) || !isISODate(phase.end) || phase.end < phase.start}
            onClick={() => {
              savePhases([...phases, { id: newId('winter'), name: phase.name.trim(), start: phase.start, end: phase.end, kind: phase.kind }]);
              setPhase({ name: '', start: '', end: '', kind: 'holiday' });
            }}
          >
            Add
          </button>
        </div>
      </Panel>

      {phases.length > 0 && (
        <>
          {coachFlags.length > 0 && (
            <Panel title={`For the coach (${coachFlags.length})`}>
              <ul className="small">
                {coachFlags.map(({ d, f }) => (
                  <li key={d.athlete.id + f.kind}>
                    <Link to={`/athlete/${d.athlete.id}`}>{nameOf(d.athlete.id)}</Link>: {f.message}
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel
            title={`The squad: ${keptThisWeek}/${summaries.length} kept this week`}
            actions={<Seg value={view} onChange={setView} options={[{ value: 'week', label: 'Weeks' }, { value: 'pace', label: 'Treadmill paces' }]} />}
          >
            {summaries.length === 0 ? (
              <Empty title="No runners yet" />
            ) : view === 'week' ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Runner</th>
                      <th className="num">🔥</th>
                      <th>Weeks</th>
                      <th className="num">This week</th>
                      <th>Next</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaries.map((d) => {
                      const w = d.winter!;
                      return (
                        <tr key={d.athlete.id}>
                          <td className="nowrap">
                            <Link to={`/athlete/${d.athlete.id}`}>{nameOf(d.athlete.id)}</Link> <span className="muted tiny">{d.athlete.yearGroup}</span>
                            {w.springReady && <span title="Spring ready"> 🌸</span>}
                          </td>
                          <td className="num">
                            <strong>{w.flame}</strong>
                          </td>
                          <td>
                            <WeekStrip weeks={w.weeks} />
                          </td>
                          <td className="num nowrap">
                            {w.thisWeek ? `${w.thisWeek.sessions}/${w.target}` : '—'}
                            {w.thisWeek?.sharp ? ' ⚡' : ''}
                          </td>
                          <td className="small">
                            {w.flags.length > 0 && <span title={w.flags.map((f) => f.message).join('\n')}>⚠ </span>}
                            {w.next}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="table-wrap">
                <p className="small muted">
                  From each runner's realistic next-5K target. Surges: 4–6 × 1 minute at the race speed with 1 minute easy between, at {config.winter.treadmillInclinePct}%
                  incline (a flat belt is easier than the road). Print this and pin it up in the gym.
                </p>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Runner</th>
                      <th className="num">Spring 5K</th>
                      <th className="num">Surges</th>
                      <th className="num">Easy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaries.map((d) => {
                      const p = pacePlan(d.prediction?.realisticSec, config);
                      return (
                        <tr key={d.athlete.id}>
                          <td className="nowrap">{nameOf(d.athlete.id)}</td>
                          <td className="num">{p ? formatTime(p.fiveKSec) : '—'}</td>
                          <td className="num">
                            <strong>{p ? `${p.raceKmh.toFixed(1)} km/h` : '—'}</strong>
                          </td>
                          <td className="num">{p ? `≤ ${p.easyKmh.toFixed(1)} km/h` : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          {cup.length > 0 && (
            <Panel title="House Frost Cup">
              <p className="small muted">The share of winter weeks kept across each house's pupils. Everyone's week helps the house; nobody is ranked last on their own.</p>
              <ol>
                {cup.map((h) => (
                  <li key={h.house}>
                    <strong>{h.house}</strong> {Math.round(h.share * 100)}% <span className="muted small">({h.kept}/{h.decided} weeks, {h.members} runners)</span>
                  </li>
                ))}
              </ol>
            </Panel>
          )}

          <Panel title="Tuesday gym">
            <p className="small muted">Tick who came. Each counts as a session for the week (and as a run when it included treadmill surges). The coach saw it, so no photo is needed.</p>
            <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <Field label="Date">
                <input className="input" type="date" value={gymDate} onChange={(e) => setGymDate(e.target.value)} />
              </Field>
              <Field label="Minutes">
                <input className="input" inputMode="numeric" value={gymMinutes} onChange={(e) => setGymMinutes(e.target.value)} style={{ width: 80 }} />
              </Field>
              <label className="small">
                <input type="checkbox" checked={gymSharp} onChange={(e) => setGymSharp(e.target.checked)} /> Treadmill race-pace surges (counts as a sharp run)
              </label>
            </div>
            <div className="winter-ticks">
              {pupils.map((d) => (
                <label key={d.athlete.id} className="small">
                  <input
                    type="checkbox"
                    checked={gymPicked.has(d.athlete.id)}
                    onChange={(e) => {
                      const next = new Set(gymPicked);
                      if (e.target.checked) next.add(d.athlete.id);
                      else next.delete(d.athlete.id);
                      setGymPicked(next);
                    }}
                  />{' '}
                  {nameOf(d.athlete.id)}
                </label>
              ))}
            </div>
            <button
              className="btn btn-primary"
              disabled={!gymPicked.size || !isISODate(gymDate) || !(Number(gymMinutes) > 0)}
              onClick={() => {
                const parts: Participation[] = [...gymPicked].map((athleteId) => ({
                  id: newId('part'),
                  athleteId,
                  isoWeek: isoWeek(gymDate),
                  type: 'top_up',
                  date: gymDate,
                  topUp: { activity: 'gym', minutes: Number(gymMinutes), proof: 'coach', ...(gymSharp ? { sharp: true } : {}) },
                }));
                commit({ put: { participation: parts } }).then(() => {
                  toast(`Gym recorded for ${parts.length}`, 'ok');
                  setGymPicked(new Set());
                });
              }}
            >
              Record gym for {gymPicked.size}
            </button>
          </Panel>

          <Panel title="Paste the top-up form">
            <p className="small muted">
              In Microsoft Forms: Responses → Open in Excel, select everything, copy, paste here. Pasting the same responses again changes nothing. Photos stay in
              the school's OneDrive; the app only records that one came.
            </p>
            <textarea className="input" rows={6} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste the Forms export here (with the header row)" />
            {parsed?.problems.map((p) => (
              <p key={p} className="small" style={{ color: 'var(--warn)' }}>
                {p}
              </p>
            ))}
            {parsed && parsed.rows.length > 0 && (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Name</th>
                      <th>Date</th>
                      <th>Session</th>
                      <th>Check</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.map((r) => (
                      <tr key={r.line}>
                        <td className="tiny muted">{r.line}</td>
                        <td>{r.match.athleteId ? nameOf(r.match.athleteId) : r.name}</td>
                        <td className="nowrap">{r.date ?? '—'}</td>
                        <td className="small">
                          {r.topUp
                            ? `${r.topUp.activity} ${r.topUp.minutes} min${r.topUp.km ? ` ${r.topUp.km} km` : ''}${r.topUp.sharp ? ' ⚡' : ''}${r.topUp.proof === 'photo' ? ' 📷' : ''}${r.topUp.soreness != null ? ` · sore ${r.topUp.soreness}/10` : ''}`
                            : '—'}
                        </td>
                        <td className="small">{r.problems.length ? <span style={{ color: 'var(--warn)' }}>{r.problems.join('; ')}</span> : '✓'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <button
              className="btn btn-primary"
              disabled={!toImport.length}
              onClick={() =>
                commit({ put: { participation: toImport } }).then(() => {
                  toast(`${toImport.length} session${toImport.length === 1 ? '' : 's'} added`, 'ok');
                  setPaste('');
                })
              }
            >
              Add {toImport.length} session{toImport.length === 1 ? '' : 's'}
            </button>
            <details className="small" style={{ marginTop: 12 }}>
              <summary>Setting up the form</summary>
              <p>
                Make a Microsoft Form, set to "Only people in my organisation can respond" with "Record name" on, so the name comes from the school sign-in.
                Questions (the wording can change, but keep the key word):
              </p>
              <ol>
                {FORM_QUESTIONS.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ol>
              <p>Pin the form's link or QR code in the gym and in the boarding houses. Pupils fill it in after each session: under a minute.</p>
            </details>
          </Panel>

          {summaries.some((d) => d.athlete.yearGroup === 'Staff') && (
            <Panel title="Staff">
              {summaries
                .filter((d) => d.athlete.yearGroup === 'Staff')
                .map((d) => (
                  <div key={d.athlete.id} className="stack">
                    <strong>{nameOf(d.athlete.id)}</strong>
                    <p className="small">{d.winter!.next}</p>
                    <PaceLine fiveKSec={d.prediction?.predictedSec} config={config} label="5K now" />
                  </div>
                ))}
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
