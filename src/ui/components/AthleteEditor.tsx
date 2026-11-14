// Create or edit an athlete. DOB is coach-only and never shown on cards, boards or printouts.
import { useState } from 'react';
import type { Athlete, DisplayMode, Sex, YearGroup } from '../../types';
import { YEAR_GROUPS } from '../../types';
import { Field, Modal, newId } from './common';
import { useToast } from './Toast';
import { useData } from '../data/DataContext';
import { defaultAvatar } from '../../engine/avatarDefaults';
import { academicYearOf, isISODate } from '../../engine/dates';
import { displayName } from '../../engine/display';
import { findDuplicateAthlete } from '../../engine/names';

export function newAthlete(id: string, today: string, startMonth = 9, startDay = 1): Athlete {
  return {
    id,
    givenName: '',
    familyName: '',
    preferredName: '',
    aliases: [],
    sex: 'F',
    yearGroup: 'Y7',
    yearGroupYear: academicYearOf(today, startMonth, startDay),
    displayMode: 'first_initial',
    absoluteBoardOptOut: false,
    avatar: defaultAvatar(id),
    active: true,
    createdAt: new Date().toISOString(),
  };
}

export function AthleteEditor({ athlete, onClose, onSaved }: { athlete: Athlete; onClose: () => void; onSaved?: (a: Athlete) => void }) {
  const { commit, snapshot, today, config } = useData();
  const toast = useToast();
  const isNew = !snapshot.athletes.some((a) => a.id === athlete.id);
  const [a, setA] = useState<Athlete>(athlete);
  const [aliasText, setAliasText] = useState(athlete.aliases.join('; '));
  const set = <K extends keyof Athlete>(k: K, v: Athlete[K]) => setA((x) => ({ ...x, [k]: v }));
  const aliases = aliasText.split(/[;；\n]/).map((s) => s.trim()).filter(Boolean);
  const dup = isNew && a.yearGroup ? findDuplicateAthlete({ givenName: a.givenName || a.preferredName, familyName: a.familyName, preferredName: a.preferredName, yearGroup: a.yearGroup, yearGroupYear: a.yearGroupYear }, snapshot.athletes, { asOf: today, config }) : undefined;
  const err = !(a.preferredName || a.givenName).trim() ? 'A first or preferred name is needed' : a.dob && !isISODate(a.dob) ? 'Date of birth must be a real date' : a.displayMode === 'alias' && !a.publicAlias?.trim() ? 'Set the public alias, or choose another display mode' : null;

  const save = async () => {
    if (err) return;
    const next: Athlete = {
      ...a,
      givenName: (a.givenName || a.preferredName).trim(),
      preferredName: (a.preferredName || a.givenName).trim(),
      familyName: a.familyName.trim(),
      aliases,
      publicAlias: a.publicAlias?.trim() || undefined,
      dob: a.dob || undefined,
      house: a.house?.trim() || undefined,
      notes: a.notes?.trim() || undefined,
    };
    for (const k of Object.keys(next) as (keyof Athlete)[]) if (next[k] === undefined) delete next[k];
    await commit({ put: { athletes: [next] } });
    toast(isNew ? `Added ${displayName({ ...next, displayMode: 'full' })}` : 'Saved', 'ok');
    onSaved?.(next);
    onClose();
  };

  return (
    <Modal
      title={isNew ? 'Add athlete' : `Edit ${a.preferredName} ${a.familyName}`}
      onClose={onClose}
      wide
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!!err}>
            {isNew ? 'Add athlete' : 'Save'}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="grid-3">
          <Field label="Preferred name">
            <input className="input" value={a.preferredName} onChange={(e) => set('preferredName', e.target.value)} autoFocus />
          </Field>
          <Field label="Given (legal) name" hint="Leave blank if the same">
            <input className="input" value={a.givenName === a.preferredName ? '' : a.givenName} onChange={(e) => set('givenName', e.target.value)} />
          </Field>
          <Field label="Family name">
            <input className="input" value={a.familyName} onChange={(e) => set('familyName', e.target.value)} />
          </Field>
          <Field label="Sex">
            <select className="select" value={a.sex} onChange={(e) => set('sex', e.target.value as Sex)}>
              <option value="F">F</option>
              <option value="M">M</option>
            </select>
          </Field>
          <Field label="Year group">
            <select className="select" value={a.yearGroup} onChange={(e) => set('yearGroup', e.target.value as YearGroup)}>
              {YEAR_GROUPS.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </Field>
          <Field label="Date of birth (coach only)" hint="Optional. Never on cards, boards or printouts. Without it, age is estimated from the year group.">
            <input className="input" type="date" value={a.dob ?? ''} onChange={(e) => set('dob', e.target.value || undefined)} />
          </Field>
        </div>
        <Field label="Aliases" hint="Separate with ; — kanji, kana, romaji in either order, nicknames. Results are matched on all of these.">
          <textarea className="textarea" style={{ minHeight: 60, fontFamily: 'var(--font)' }} value={aliasText} onChange={(e) => setAliasText(e.target.value)} placeholder="テストフィールド アイコ; Ai" />
        </Field>
        <div className="grid-3">
          <Field label="Name on cards and boards">
            <select className="select" value={a.displayMode} onChange={(e) => set('displayMode', e.target.value as DisplayMode)}>
              <option value="full">Full name</option>
              <option value="first_initial">First name + initial</option>
              <option value="alias">Public alias</option>
            </select>
          </Field>
          <Field label="Public alias">
            <input className="input" value={a.publicAlias ?? ''} onChange={(e) => set('publicAlias', e.target.value)} disabled={a.displayMode !== 'alias'} placeholder="e.g. Ridge Runner" />
          </Field>
          <Field label="Shown as">
            <div className="input" style={{ background: 'var(--surface-2)' }}>{displayName(a) || '—'}</div>
          </Field>
          <Field label="House">
            <input className="input" value={a.house ?? ''} onChange={(e) => set('house', e.target.value)} />
          </Field>
          <Field label="Leaderboards">
            <label className="check">
              <input type="checkbox" checked={a.absoluteBoardOptOut} onChange={(e) => set('absoluteBoardOptOut', e.target.checked)} />
              Opt out of absolute boards
            </label>
            <label className="check">
              <input type="checkbox" checked={!!a.hiddenOnline} onChange={(e) => set('hiddenOnline', e.target.checked)} />
              Hide from the pupil view online (shown only as “Hidden runner”, no card)
            </label>
          </Field>
          <Field label="Status">
            <label className="check">
              <input type="checkbox" checked={a.active} onChange={(e) => set('active', e.target.checked)} />
              Active
            </label>
          </Field>
        </div>
        <Field label="Coach notes (private)">
          <input className="input" value={a.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        {dup && (
          <p className="small" style={{ color: 'var(--warn)' }}>
            Possible duplicate: {dup.preferredName} {dup.familyName} ({dup.yearGroup}) is already on the roster.
          </p>
        )}
        {err && <p className="small" style={{ color: 'var(--err)' }}>{err}</p>}
      </div>
    </Modal>
  );
}

export function useNewAthlete() {
  const { today, config } = useData();
  return () => newAthlete(newId('ath'), today, config.age.academicYearStartMonth, config.age.academicYearStartDay);
}
