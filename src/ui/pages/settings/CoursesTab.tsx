// Settings → Courses: create and edit courses, set fixed-mode benchmarks (spec 2 Course, 3.6, 8).
import { useState } from 'react';
import type { BenchmarkMode, Course, CourseKind } from '../../../types';
import { Field, Modal, Panel, newId } from '../../components/common';
import { useToast } from '../../components/Toast';
import { useData } from '../../data/DataContext';
import { formatKm, formatTime } from '../../../engine/format';
import { parseTime } from '../../../engine/time';
import { effectiveDistance } from '../../../engine/perf';

const KINDS: { value: CourseKind; label: string }[] = [
  { value: 'circuit', label: 'Circuit (SPD)' },
  { value: 'climb', label: 'Climb (CLB)' },
  { value: 'descent', label: 'Descent (DSC)' },
  { value: 'nav', label: 'Navigation (NAV)' },
  { value: 'race_course', label: 'Race course' },
  { value: 'other', label: 'Other' },
];

function blank(): Course {
  return { id: '', name: '', kind: 'circuit', distanceKm: 1, climbM: 0, terrainFactor: 1, benchmarkMode: 'age_grade', version: 1 };
}

export function CourseEditor({ course, onClose }: { course: Course; onClose: () => void }) {
  const { commit, snapshot } = useData();
  const toast = useToast();
  const [c, setC] = useState<Course>(course);
  const [t99M, setT99M] = useState(course.t99OpenM ? formatTime(course.t99OpenM) : '');
  const [t99F, setT99F] = useState(course.t99OpenF ? formatTime(course.t99OpenF) : '');
  const parseOpt = (s: string) => (s.trim() ? parseTime(s, { context: 'time' }) : null);
  const pm = parseOpt(t99M);
  const pf = parseOpt(t99F);
  const err = !c.name.trim() ? 'Name the course' : !(c.distanceKm > 0) ? 'Distance must be above 0' : !(c.terrainFactor > 0) ? 'Terrain factor must be above 0' : (pm && !pm.ok) || (pf && !pf.ok) ? 'Benchmark times not understood' : null;
  const used = snapshot.performances.filter((p) => !p.deleted && p.courseId === course.id).length;
  const save = async () => {
    if (err) return;
    const next: Course = {
      ...c,
      id: c.id || newId('course'),
      name: c.name.trim(),
      version: course.id ? course.version + 1 : 1,
      t99OpenM: pm && pm.ok ? Math.round(pm.sec) : undefined,
      t99OpenF: pf && pf.ok ? Math.round(pf.sec) : undefined,
    };
    for (const k of Object.keys(next) as (keyof Course)[]) if (next[k] === undefined) delete next[k];
    await commit({ put: { courses: [next] } });
    toast(course.id ? `Saved ${next.name} (version ${next.version})` : `Added ${next.name}`, 'ok');
    onClose();
  };
  return (
    <Modal
      title={course.id ? `Edit course: ${course.name}` : 'New course'}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!!err}>
            Save course
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="grid-2">
          <Field label="Name">
            <input className="input" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} autoFocus />
          </Field>
          <Field label="Kind">
            <select className="select" value={c.kind} onChange={(e) => setC({ ...c, kind: e.target.value as CourseKind, benchmarkMode: e.target.value === 'descent' ? 'fixed' : c.benchmarkMode })}>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Distance (km)">
            <input className="input" type="number" step="0.01" min="0" value={c.distanceKm} onChange={(e) => setC({ ...c, distanceKm: Number(e.target.value) })} />
          </Field>
          <Field label="Climb (m)">
            <input className="input" type="number" step="1" min="0" value={c.climbM} onChange={(e) => setC({ ...c, climbM: Number(e.target.value) })} />
          </Field>
          <Field label="Terrain factor" hint="1.00 = road. Raise it for rough trail so runs score fairly.">
            <input className="input" type="number" step="0.01" min="0.5" max="3" value={c.terrainFactor} onChange={(e) => setC({ ...c, terrainFactor: Number(e.target.value) })} />
          </Field>
          <Field label="Effective distance" hint="(distance + climb ÷ 100) × terrain factor">
            <div className="input" style={{ background: 'var(--surface-2)' }}>{c.distanceKm > 0 ? formatKm(effectiveDistance(c.distanceKm, c.climbM, c.terrainFactor)) : '—'}</div>
          </Field>
        </div>
        <Field label="Scoring mode">
          <select className="select" value={c.benchmarkMode} onChange={(e) => setC({ ...c, benchmarkMode: e.target.value as BenchmarkMode })}>
            <option value="age_grade">Age-graded (world standards for age and sex)</option>
            <option value="fixed">Fixed benchmark (set the 99-point open times below)</option>
          </select>
        </Field>
        {c.benchmarkMode === 'fixed' && (
          <div className="grid-2">
            <Field label="99-point time, open men (18–30)" hint={pm && !pm.ok ? pm.error : 'e.g. 4:10'}>
              <input className={`input ${pm && !pm.ok ? 'invalid' : ''}`} value={t99M} onChange={(e) => setT99M(e.target.value)} placeholder="m:ss" />
            </Field>
            <Field label="99-point time, open women (18–30)" hint={pf && !pf.ok ? pf.error : 'Juniors and older staff get an age adjustment automatically.'}>
              <input className={`input ${pf && !pf.ok ? 'invalid' : ''}`} value={t99F} onChange={(e) => setT99F(e.target.value)} placeholder="m:ss" />
            </Field>
          </div>
        )}
        <Field label="Notes">
          <input className="input" value={c.notes ?? ''} onChange={(e) => setC({ ...c, notes: e.target.value || undefined })} />
        </Field>
        {course.id && used > 0 && <p className="small muted">{used} results use this course; saving recalculates all of them.</p>}
        {err && <p className="small" style={{ color: 'var(--err)' }}>{err}</p>}
      </div>
    </Modal>
  );
}

export function CoursesTab() {
  const { snapshot } = useData();
  const [editing, setEditing] = useState<Course | null>(null);
  const counts = new Map<string, number>();
  for (const p of snapshot.performances) if (!p.deleted && p.courseId) counts.set(p.courseId, (counts.get(p.courseId) ?? 0) + 1);
  return (
    <Panel title="Courses" actions={<button className="btn btn-primary" onClick={() => setEditing(blank())}>Add course</button>}>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Course</th>
              <th>Kind</th>
              <th className="num">Distance</th>
              <th className="num">Climb</th>
              <th className="num">Terrain</th>
              <th>Scoring</th>
              <th className="num">Results</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {snapshot.courses.map((c) => {
              const missing = c.benchmarkMode === 'fixed' && (!c.t99OpenM || !c.t99OpenF);
              return (
                <tr key={c.id}>
                  <td>
                    <strong>{c.name}</strong> {c.demo && <span className="pill">demo</span>}
                  </td>
                  <td>{KINDS.find((k) => k.value === c.kind)?.label}</td>
                  <td className="num">{formatKm(c.distanceKm)}</td>
                  <td className="num">{c.climbM} m</td>
                  <td className="num">{c.terrainFactor.toFixed(2)}</td>
                  <td>
                    {c.benchmarkMode === 'age_grade' ? 'Age-graded' : 'Fixed'}
                    {missing && <span className="pill pill-warn" style={{ marginLeft: 6 }}>benchmark not set</span>}
                  </td>
                  <td className="num">{counts.get(c.id) ?? 0}</td>
                  <td className="right">
                    <button className="btn btn-sm" onClick={() => setEditing(c)}>
                      Edit
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editing && <CourseEditor course={editing} onClose={() => setEditing(null)} />}
    </Panel>
  );
}
