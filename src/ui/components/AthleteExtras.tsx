// Coach tools on the athlete page: apply a streak freeze (one per half-term, spec 3.11) and add a
// manual achievement such as an expedition badge (spec 2), optionally for several athletes at once.
import { useState } from 'react';
import type { Athlete, ManualAchievement, Participation } from '../../types';
import { Field, Modal, newId } from './common';
import { useToast } from './Toast';
import { useData } from '../data/DataContext';
import { formatLongDate, isISODate, isoWeek, weekMonday } from '../../engine/dates';
import { halfTermOfWeek } from '../../engine/streak';
import { fullName } from '../../engine/display';

export function FreezeModal({ athlete, onClose }: { athlete: Athlete; onClose: () => void }) {
  const { snapshot, commit, today } = useData();
  const toast = useToast();
  const [date, setDate] = useState(today);
  const week = isISODate(date) ? isoWeek(date) : '';
  const term = week ? halfTermOfWeek(week, snapshot.calendar.halfTerms) : undefined;
  const mine = snapshot.participation.filter((p) => p.athleteId === athlete.id && p.type === 'freeze');
  const usedInTerm = term ? mine.filter((p) => halfTermOfWeek(p.isoWeek, snapshot.calendar.halfTerms)?.id === term.id) : [];
  const already = mine.some((p) => p.isoWeek === week);
  return (
    <Modal
      title={`Streak freeze for ${fullName(athlete)}`}
      onClose={onClose}
      actions={
        <>
          {mine.length > 0 && (
            <span className="small muted" style={{ marginRight: 'auto' }}>
              Freezes so far: {mine.map((p) => formatLongDate(weekMonday(p.isoWeek))).join(', ')}
            </span>
          )}
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!week || already || !term}
            onClick={async () => {
              const p: Participation = { id: newId('part'), athleteId: athlete.id, isoWeek: week, type: 'freeze', date };
              await commit({ put: { participation: [p] } });
              toast('Freeze applied', 'ok');
              onClose();
            }}
          >
            Apply freeze
          </button>
        </>
      }
    >
      <p className="small">A freeze holds a week so a missed week does not break the streak. One freeze per half-term.</p>
      <Field label="Any date in the week to freeze">
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <p className="small" style={{ marginTop: 8 }}>
        {!term ? (
          <span style={{ color: 'var(--err)' }}>This week is not inside a half-term. Add half-terms in Settings → Calendar first.</span>
        ) : already ? (
          <span style={{ color: 'var(--warn)' }}>This week is already frozen.</span>
        ) : usedInTerm.length ? (
          <span style={{ color: 'var(--warn)' }}>
            {term.name} already has a freeze ({formatLongDate(weekMonday(usedInTerm[0].isoWeek))}); a second one would be ignored.
          </span>
        ) : (
          <span className="muted">Uses the {term.name} freeze.</span>
        )}
      </p>
    </Modal>
  );
}

const ICONS = ['🏔️', '🧭', '⛺', '🌊', '🏅', '⭐', '🎌', '🦅'];

export function AchievementModal({ athlete, onClose }: { athlete: Athlete; onClose: () => void }) {
  const { snapshot, commit, today } = useData();
  const toast = useToast();
  const [a, setA] = useState({ name: '', type: 'expedition' as ManualAchievement['type'], date: today, icon: '🏔️' });
  const [others, setOthers] = useState<Set<string>>(new Set());
  const roster = snapshot.athletes.filter((x) => x.active && x.id !== athlete.id).sort((x, y) => fullName(x).localeCompare(fullName(y)));
  const ok = a.name.trim() && isISODate(a.date);
  return (
    <Modal
      title="Add an achievement"
      onClose={onClose}
      wide
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!ok}
            onClick={async () => {
              const ids = [athlete.id, ...others];
              const rows: ManualAchievement[] = ids.map((id) => ({ id: newId('ach'), athleteId: id, type: a.type, name: a.name.trim(), date: a.date, icon: a.icon }));
              await commit({ put: { achievements: rows } });
              toast(`Added “${a.name.trim()}” for ${ids.length} athlete${ids.length > 1 ? 's' : ''}`, 'ok');
              onClose();
            }}
          >
            Add for {1 + others.size} athlete{others.size ? 's' : ''}
          </button>
        </>
      }
    >
      <div className="grid-3">
        <Field label="Name">
          <input className="input" value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} placeholder="Matsushima Escape 2026" autoFocus />
        </Field>
        <Field label="Type">
          <select className="select" value={a.type} onChange={(e) => setA({ ...a, type: e.target.value as ManualAchievement['type'] })}>
            <option value="expedition">Expedition</option>
            <option value="custom">Other achievement</option>
          </select>
        </Field>
        <Field label="Date">
          <input className="input" type="date" value={a.date} onChange={(e) => setA({ ...a, date: e.target.value })} />
        </Field>
      </div>
      <Field label="Icon">
        <div className="seg">
          {ICONS.map((i) => (
            <button key={i} type="button" className={a.icon === i ? 'on' : ''} onClick={() => setA({ ...a, icon: i })} style={{ fontSize: '1.1rem' }}>
              {i}
            </button>
          ))}
        </div>
      </Field>
      <div style={{ marginTop: 12 }}>
        <div className="small" style={{ fontWeight: 600, marginBottom: 6 }}>
          Also give it to (e.g. everyone on the expedition):
        </div>
        <div className="row" style={{ maxHeight: 180, overflowY: 'auto' }}>
          {roster.map((x) => (
            <label key={x.id} className="check small" style={{ minWidth: 170 }}>
              <input
                type="checkbox"
                checked={others.has(x.id)}
                onChange={(e) => {
                  const n = new Set(others);
                  if (e.target.checked) n.add(x.id);
                  else n.delete(x.id);
                  setOthers(n);
                }}
              />
              {fullName(x)}
            </label>
          ))}
        </div>
      </div>
    </Modal>
  );
}
