// Quick Entry (spec 4.1): one phone-friendly screen with a live preview before saving.
import './quickEntry.css';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { ArmMeasures, Performance, PerfKind, TasukiEvent } from '../../types';
import { PERF_KINDS } from '../../types';
import { Field, PageHeader, Panel, newId } from '../components/common';
import { useToast } from '../components/Toast';
import { useData } from '../data/DataContext';
import { useRoute, Link } from '../router';
import { AthletePicker } from '../components/AthletePicker';
import { KIND_LABEL } from '../components/PerformanceEditor';
import { makePerformance } from '../../engine/corrections';
import { parseTime, paceWarning } from '../../engine/time';
import { effectiveDistance } from '../../engine/perf';
import { formatKm } from '../../engine/format';
import { isISODate, isoWeek } from '../../engine/dates';
import { fullName } from '../../engine/display';
import { previewChanges } from '../data/preview';
import type { Changes } from '../../store/changes';

const TIMED: PerfKind[] = ['race', 'relay_leg', 'parkrun', 'long_run', 'circuit', 'climb', 'descent', 'nav'];
const COURSE_KIND: Partial<Record<PerfKind, string>> = { circuit: 'circuit', climb: 'climb', descent: 'descent', nav: 'nav' };
const EVENT_KIND: Record<PerfKind, TasukiEvent['kind']> = { race: 'race', relay_leg: 'relay', parkrun: 'parkrun', long_run: 'session', circuit: 'time_trial', climb: 'time_trial', descent: 'time_trial', nav: 'test', bleep: 'test', arm: 'test' };

interface Draft {
  athleteId: string | null;
  date: string;
  kind: PerfKind;
  courseId: string;
  eventId: string;
  newEventName: string;
  distanceKm: string;
  climbM: string;
  time: string;
  place: string;
  fieldSize: string;
  leg: string;
  team: string;
  racedEarlier: boolean;
  laps: string;
  arm: { ankle: string; calf: string; stork: string; hop: '' | 'yes' | 'no' };
  navErrors: string;
  routeKm: string;
  clean: boolean;
  verified: boolean;
  saturdayRun: boolean;
}

const n = (s: string) => (s.trim() === '' ? undefined : Number(s));

export function QuickEntryPage() {
  const { snapshot, derived, commit, today, asOf, config } = useData();
  const toast = useToast();
  const route = useRoute();
  const circuit = snapshot.courses.find((c) => c.kind === 'circuit');
  const [d, setD] = useState<Draft>(() => ({
    athleteId: route.query.get('athlete'),
    date: today,
    kind: 'circuit',
    courseId: circuit?.id ?? '',
    eventId: '',
    newEventName: '',
    distanceKm: '',
    climbM: '',
    time: '',
    place: '',
    fieldSize: '',
    leg: '',
    team: '',
    racedEarlier: false,
    laps: '',
    arm: { ankle: '', calf: '', stork: '', hop: '' },
    navErrors: '0',
    routeKm: '',
    clean: true,
    verified: true,
    saturdayRun: false,
  }));
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  useEffect(() => {
    const id = route.query.get('athlete');
    if (id) set('athleteId', id);
  }, [route.query]);

  const course = snapshot.courses.find((c) => c.id === d.courseId);
  const event = snapshot.events.find((e) => e.id === d.eventId);
  const courses = snapshot.courses.filter((c) => !COURSE_KIND[d.kind] || c.kind === COURSE_KIND[d.kind] || c.kind === 'other');
  const events = snapshot.events.filter((e) => e.kind === EVENT_KIND[d.kind]).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 30);
  const tp = d.time.trim() ? parseTime(d.time, { context: 'time', config }) : null;
  const dist = n(d.distanceKm) ?? course?.distanceKm ?? event?.distanceKm ?? (d.kind === 'parkrun' ? config.input.parkrunDefaultKm : undefined);
  const climb = n(d.climbM) ?? course?.climbM ?? event?.climbM ?? 0;
  const dEff = dist ? effectiveDistance(dist, climb, course?.terrainFactor ?? 1) : undefined;
  const pace = tp?.ok && dEff ? paceWarning(tp.sec, dEff, config) : null;

  const problem = (() => {
    if (!d.athleteId) return 'Choose an athlete';
    if (!isISODate(d.date)) return 'Choose a date';
    if (d.saturdayRun) return null;
    if (TIMED.includes(d.kind)) {
      if (!tp) return 'Enter the time';
      if (!tp.ok) return tp.error;
      if (!dist && !course) return 'Enter the distance (or choose a course)';
    }
    if (d.kind === 'bleep' && !(n(d.laps)! > 0)) return 'Enter the laps';
    if (d.kind === 'arm' && !d.arm.ankle && !d.arm.calf && !d.arm.stork) return 'Enter at least one ARM measure';
    return null;
  })();

  /** The change set Save would commit. */
  const changes = useMemo<Changes | null>(() => {
    if (problem || !d.athleteId) return null;
    const now = new Date().toISOString();
    if (d.saturdayRun) {
      return { put: { participation: [{ id: 'draft-part', athleteId: d.athleteId, isoWeek: isoWeek(d.date), type: 'saturday_run', date: d.date }] } };
    }
    let newEvent: TasukiEvent | undefined;
    if (!d.eventId && d.newEventName.trim()) {
      newEvent = { id: 'draft-event', name: d.newEventName.trim(), date: d.date, kind: EVENT_KIND[d.kind], official: true, ...(course ? { courseId: course.id } : {}), ...(dist && !course ? { distanceKm: dist } : {}), ...(climb && !course ? { climbM: climb } : {}) };
    }
    const arm: ArmMeasures | undefined =
      d.kind === 'arm' ? { ankleCm: n(d.arm.ankle), calfReps: n(d.arm.calf), storkSec: n(d.arm.stork), ...(d.arm.hop ? { hopStickBothLegs: d.arm.hop === 'yes' } : {}) } : undefined;
    if (arm) for (const k of Object.keys(arm) as (keyof ArmMeasures)[]) if (arm[k] === undefined) delete arm[k];
    const perf: Performance = makePerformance(
      {
        athleteId: d.athleteId,
        date: d.date,
        kind: d.kind,
        eventId: newEvent?.id ?? (d.eventId || undefined),
        courseId: course?.id,
        distanceKm: n(d.distanceKm) ?? (!course && !event && dist ? dist : undefined),
        climbM: n(d.climbM),
        timeSec: TIMED.includes(d.kind) && tp?.ok ? tp.sec : undefined,
        place: n(d.place),
        fieldSize: n(d.fieldSize),
        legNumber: d.kind === 'relay_leg' ? n(d.leg) : undefined,
        teamName: d.kind === 'relay_leg' ? d.team.trim() || undefined : undefined,
        racedEarlierSameDay: d.kind === 'relay_leg' && d.racedEarlier ? true : undefined,
        bleepLaps: d.kind === 'bleep' ? n(d.laps) : undefined,
        arm,
        navErrors: d.kind === 'nav' ? n(d.navErrors) ?? 0 : undefined,
        routeKmEff: d.kind === 'nav' ? n(d.routeKm) : undefined,
        cleanRun: d.kind === 'descent' ? d.clean : undefined,
        verified: d.verified,
        source: 'coach',
        rawInput: `Quick Entry: ${d.time || d.laps || ''}`.trim(),
      },
      'draft-perf',
      now,
    );
    return { put: { performances: [perf], ...(newEvent ? { events: [newEvent] } : {}) } };
  }, [d, problem, course, event, dist, climb, tp]);

  const deferred = useDeferredValue(changes);
  const preview = useMemo(() => (deferred && d.athleteId ? previewChanges(snapshot, derived, deferred, d.athleteId, asOf, config) : null), [deferred, snapshot, derived, d.athleteId, asOf, config]);

  const save = async () => {
    if (!changes || !d.athleteId) return;
    // give the draft records real ids
    const eventId = changes.put?.events?.[0] ? newId('event') : undefined;
    const real: Changes = {
      put: {
        ...(changes.put?.events ? { events: changes.put.events.map((e) => ({ ...e, id: eventId! })) } : {}),
        ...(changes.put?.performances ? { performances: changes.put.performances.map((p) => ({ ...p, id: newId('perf'), eventId: p.eventId === 'draft-event' ? eventId : p.eventId })) } : {}),
        ...(changes.put?.participation ? { participation: changes.put.participation.map((p) => ({ ...p, id: newId('part') })) } : {}),
      },
    };
    await commit(real);
    const a = snapshot.athletes.find((x) => x.id === d.athleteId);
    toast(`Saved for ${a ? fullName(a) : 'athlete'}${preview?.[0] ? `: ${preview[0].text}` : ''}`, 'ok');
    setD((x) => ({ ...x, athleteId: null, time: '', laps: '', place: '', arm: { ankle: '', calf: '', stork: '', hop: '' }, navErrors: '0', leg: '', racedEarlier: false, eventId: eventId ?? x.eventId, newEventName: '' }));
  };

  return (
    <div className="stack qe">
      <PageHeader title="Quick Entry" subtitle={<>One result at a time, with a preview of what it changes. For many results at once use <Link to="/paste">Paste &amp; Match</Link>.</>} />
      <div className="qe-grid">
        <Panel>
          <div className="stack">
            <Field label="Athlete">
              <AthletePicker roster={snapshot.athletes} value={d.athleteId} onChange={(id) => set('athleteId', id)} autoFocus />
            </Field>
            <div className="grid-2">
              <Field label="Date">
                <input className="input" type="date" value={d.date} onChange={(e) => set('date', e.target.value)} />
              </Field>
              <Field label="What">
                <select
                  className="select"
                  value={d.saturdayRun ? 'saturday_run' : d.kind}
                  onChange={(e) => {
                    if (e.target.value === 'saturday_run') return setD((x) => ({ ...x, saturdayRun: true }));
                    const k = e.target.value as PerfKind;
                    const ck = COURSE_KIND[k];
                    const c = ck ? snapshot.courses.find((x) => x.kind === ck) : undefined;
                    setD((x) => ({ ...x, saturdayRun: false, kind: k, courseId: c?.id ?? '', eventId: '' }));
                  }}
                >
                  {PERF_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ))}
                  <option value="saturday_run">Saturday run (attendance only)</option>
                </select>
              </Field>
            </div>
            {!d.saturdayRun && (
              <>
                <div className="grid-2">
                  <Field label="Course" hint={course ? `${formatKm(course.distanceKm)}${course.climbM ? ` · ${course.climbM} m climb` : ''}` : 'Optional'}>
                    <select className="select" value={d.courseId} onChange={(e) => set('courseId', e.target.value)}>
                      <option value="">(no course)</option>
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Event" hint="Optional: pick one, or type a new name">
                    <select className="select" value={d.eventId} onChange={(e) => set('eventId', e.target.value)}>
                      <option value="">(none / new)</option>
                      {events.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name} · {e.date}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                {!d.eventId && (d.kind === 'race' || d.kind === 'relay_leg' || d.kind === 'parkrun') && (
                  <Field label="New event name">
                    <input className="input" value={d.newEventName} onChange={(e) => set('newEventName', e.target.value)} placeholder="e.g. Hachimantai XC" />
                  </Field>
                )}
                {TIMED.includes(d.kind) && (
                  <>
                    <div className="grid-2">
                      <Field label="Time" hint={tp ? (tp.ok ? tp.warnings[0] ?? `= ${tp.normalized}` : tp.error) : '16:15, 1:02:33, 16m15s, “sixteen fifteen”…'}>
                        <input className={`input qe-time ${tp && !tp.ok ? 'invalid' : ''}`} value={d.time} onChange={(e) => set('time', e.target.value)} inputMode="text" placeholder="m:ss" />
                      </Field>
                      <div className="grid-2">
                        <Field label="Distance km">
                          <input className="input" type="number" step="0.01" value={d.distanceKm} placeholder={dist ? String(dist) : ''} onChange={(e) => set('distanceKm', e.target.value)} />
                        </Field>
                        <Field label="Climb m">
                          <input className="input" type="number" value={d.climbM} placeholder={climb ? String(climb) : '0'} onChange={(e) => set('climbM', e.target.value)} />
                        </Field>
                      </div>
                    </div>
                    {pace && <p className="small" style={{ color: 'var(--warn)', margin: 0 }}>{pace}</p>}
                  </>
                )}
                {(d.kind === 'race' || d.kind === 'parkrun') && (
                  <div className="grid-2">
                    <Field label="Place (optional)">
                      <input className="input" type="number" value={d.place} onChange={(e) => set('place', e.target.value)} />
                    </Field>
                    <Field label="Field size (optional)">
                      <input className="input" type="number" value={d.fieldSize} onChange={(e) => set('fieldSize', e.target.value)} />
                    </Field>
                  </div>
                )}
                {d.kind === 'relay_leg' && (
                  <div className="grid-3">
                    <Field label="Leg">
                      <input className="input" type="number" value={d.leg} onChange={(e) => set('leg', e.target.value)} />
                    </Field>
                    <Field label="Team">
                      <input className="input" value={d.team} onChange={(e) => set('team', e.target.value)} />
                    </Field>
                    <Field label="Raced earlier today">
                      <label className="check">
                        <input type="checkbox" checked={d.racedEarlier} onChange={(e) => set('racedEarlier', e.target.checked)} /> Yes
                      </label>
                    </Field>
                  </div>
                )}
                {d.kind === 'bleep' && (
                  <Field label="Laps (20 m shuttles)">
                    <input className="input qe-time" type="number" value={d.laps} onChange={(e) => set('laps', e.target.value)} />
                  </Field>
                )}
                {d.kind === 'arm' && (
                  <div className="grid-2">
                    <Field label="Ankle: knee-to-wall, weaker side (cm)">
                      <input className="input" type="number" step="0.5" value={d.arm.ankle} onChange={(e) => set('arm', { ...d.arm, ankle: e.target.value })} />
                    </Field>
                    <Field label="Calf: single-leg heel raises, weaker side">
                      <input className="input" type="number" value={d.arm.calf} onChange={(e) => set('arm', { ...d.arm, calf: e.target.value })} />
                    </Field>
                    <Field label="Balance: eyes-closed stork, weaker side (s)">
                      <input className="input" type="number" value={d.arm.stork} onChange={(e) => set('arm', { ...d.arm, stork: e.target.value })} />
                    </Field>
                    <Field label="Hop and stick, both legs">
                      <select className="select" value={d.arm.hop} onChange={(e) => set('arm', { ...d.arm, hop: e.target.value as Draft['arm']['hop'] })}>
                        <option value="">not tested</option>
                        <option value="yes">passed</option>
                        <option value="no">not passed</option>
                      </select>
                    </Field>
                  </div>
                )}
                {d.kind === 'nav' && (
                  <div className="grid-2">
                    <Field label="Control errors">
                      <input className="input" type="number" min="0" value={d.navErrors} onChange={(e) => set('navErrors', e.target.value)} />
                    </Field>
                    <Field label="Route km (effective)" hint="Blank = the course distance">
                      <input className="input" type="number" step="0.01" value={d.routeKm} onChange={(e) => set('routeKm', e.target.value)} />
                    </Field>
                  </div>
                )}
                {d.kind === 'descent' && (
                  <label className="check">
                    <input type="checkbox" checked={d.clean} onChange={(e) => set('clean', e.target.checked)} /> Clean run (no falls, no shortcuts). Runs that are not clean are kept but never scored.
                  </label>
                )}
                <label className="check">
                  <input type="checkbox" checked={d.verified} onChange={(e) => set('verified', e.target.checked)} /> Verified (untick for a student-reported result you have not checked)
                </label>
              </>
            )}
          </div>
        </Panel>

        <Panel title="Preview" className="qe-preview">
          {problem ? (
            <p className="muted">{problem}.</p>
          ) : (
            <ul className="qe-lines">
              {(preview ?? []).map((l, i) => (
                <li key={i} className={`qe-${l.tone}`}>
                  {l.text}
                </li>
              ))}
            </ul>
          )}
          <button className="btn btn-primary btn-lg qe-save" disabled={!!problem} onClick={save} data-testid="quick-save">
            Save result
          </button>
          <p className="tiny muted" style={{ marginTop: 8 }}>
            Raw values are stored exactly as entered; every rating is recalculated from them.
          </p>
        </Panel>
      </div>
    </div>
  );
}
