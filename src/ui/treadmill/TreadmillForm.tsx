// Log a treadmill run: take a photo of the console, check the numbers it read, say how hard it felt, send.
// Used by pupils on the website (sent to the coach's inbox) and by coaches in Quick Entry (saved directly).
import './treadmill.css';
import { useEffect, useRef, useState } from 'react';
import { Field } from '../components/common';
import { useData } from '../data/DataContext';
import { parseTime } from '../../engine/time';
import { formatTime } from '../../engine/format';
import { addDays } from '../../engine/dates';
import { averageKmh, checkTreadmillRun, type TreadmillValues } from '../../engine/treadmill/session';
import type { TreadmillReading } from '../../engine/treadmill/read';
import { readPhoto } from './photo';

export interface TreadmillEntry {
  date: string;
  values: TreadmillValues & { distanceKm: number; timeSec: number };
  read: 'photo' | 'typed';
  edited: boolean;
  flags: string[];
  photo?: Uint8Array;
}

const EFFORT: { n: number; word: string }[] = [
  { n: 2, word: 'Easy' },
  { n: 4, word: 'Steady' },
  { n: 6, word: 'Comfortably hard' },
  { n: 8, word: 'Hard' },
  { n: 10, word: 'Flat out' },
];

const num = (s: string) => (s.trim() === '' ? undefined : Number(s.replace(',', '.')));
const fmt1 = (x?: number) => (x == null ? '' : x.toFixed(1));

export function TreadmillForm({ onSubmit, submitLabel, disabled }: { onSubmit: (e: TreadmillEntry) => Promise<void>; submitLabel: string; disabled?: string }) {
  const { today, config } = useData();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'' | 'reading' | 'sending'>('');
  const [reading, setReading] = useState<TreadmillReading | null>(null);
  const [preview, setPreview] = useState('');
  const [crop, setCrop] = useState<Uint8Array | undefined>();
  const [readError, setReadError] = useState('');
  const [f, setF] = useState({ distance: '', time: '', incline: '', speed: '', date: today, effort: 0 });
  const [fromPhoto, setFromPhoto] = useState<typeof f | null>(null);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy('reading');
    setReadError('');
    try {
      const r = await readPhoto(file);
      setReading(r.reading);
      setPreview(r.previewUrl);
      setCrop(r.crop);
      const next = {
        ...f,
        distance: r.reading.distanceKm != null ? r.reading.distanceKm.toFixed(3) : '',
        time: r.reading.timeSec != null ? formatTime(r.reading.timeSec) : '',
        incline: fmt1(r.reading.inclinePct),
        speed: fmt1(r.reading.speedKmh),
      };
      setF(next);
      setFromPhoto(r.crop ? next : null);
    } catch (e) {
      setReadError(`Could not open the photo (${e instanceof Error ? e.message : String(e)}). Type the numbers instead.`);
    } finally {
      setBusy('');
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const tp = f.time.trim() ? parseTime(f.time, { context: 'time', config }) : null;
  const values: TreadmillValues = { distanceKm: num(f.distance), timeSec: tp?.ok ? tp.sec : undefined, inclinePct: num(f.incline), speedKmh: num(f.speed), effort: f.effort || undefined };
  const check = checkTreadmillRun(values, f.date, today, config);
  if (!f.effort) check.errors.push('Say how hard it felt.');
  if (tp && !tp.ok) check.errors.unshift(tp.error);
  const edited = !!fromPhoto && (['distance', 'time', 'incline', 'speed'] as const).some((k) => fromPhoto[k] !== f[k]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const send = async () => {
    if (check.errors.length || disabled) return;
    setBusy('sending');
    try {
      await onSubmit({
        date: f.date,
        values: { ...values, distanceKm: values.distanceKm!, timeSec: values.timeSec! },
        read: fromPhoto && crop ? 'photo' : 'typed',
        edited,
        flags: check.flags,
        photo: fromPhoto ? crop : undefined,
      });
      setF({ distance: '', time: '', incline: '', speed: '', date: today, effort: 0 });
      setReading(null);
      setPreview('');
      setCrop(undefined);
      setFromPhoto(null);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="tm-form">
      <div className="tm-shoot">
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFile(e.target.files?.[0])} aria-label="Photo of the treadmill console" />
        <button className="btn btn-primary btn-lg" onClick={() => fileRef.current?.click()} disabled={busy !== ''}>
          {busy === 'reading' ? 'Reading the photo…' : reading ? '📷 Take another photo' : '📷 Photo of the console'}
        </button>
        <p className="tiny muted">Before you press Stop: hold the phone straight on, close enough that the green numbers fill most of the picture. The photo is read on your phone; only the numbers panel is sent to your coach.</p>
      </div>
      {readError && <p className="tm-warn">{readError}</p>}
      {reading && (
        <div className="tm-read">
          {preview && <img src={preview} alt="The treadmill display, as sent to your coach" className="tm-crop" />}
          <div>
            {reading.readouts.length ? (
              <p className="small" style={{ margin: 0 }}>
                <strong>Read from the photo.</strong> Check every number against the display and fix any that are wrong.
              </p>
            ) : null}
            {reading.warnings.map((w) => (
              <p key={w} className="tm-warn">
                {w}
              </p>
            ))}
          </div>
        </div>
      )}
      <div className="tm-fields">
        <Field label="Distance (km)" htmlFor="tm-d">
          <input id="tm-d" className="input tm-big" inputMode="decimal" value={f.distance} placeholder="3.000" onChange={(e) => set('distance', e.target.value)} />
        </Field>
        <Field label="Time" htmlFor="tm-t" hint={tp?.ok ? `= ${tp.normalized}` : 'min:sec, e.g. 18:30'}>
          <input id="tm-t" className={`input tm-big${tp && !tp.ok ? ' invalid' : ''}`} inputMode="numeric" value={f.time} placeholder="18:30" onChange={(e) => set('time', e.target.value)} />
        </Field>
        <Field label="Incline (%)" htmlFor="tm-i">
          <input id="tm-i" className="input" inputMode="decimal" value={f.incline} placeholder="1.0" onChange={(e) => set('incline', e.target.value)} />
        </Field>
        <Field label="Speed at the end (km/h)" htmlFor="tm-s">
          <input id="tm-s" className="input" inputMode="decimal" value={f.speed} placeholder="10.0" onChange={(e) => set('speed', e.target.value)} />
        </Field>
        <Field label="Date" htmlFor="tm-date">
          <input id="tm-date" className="input" type="date" value={f.date} max={today} min={addDays(today, -config.treadmill.maxDaysOld)} onChange={(e) => set('date', e.target.value)} />
        </Field>
      </div>
      {values.distanceKm && values.timeSec ? (
        <p className="small muted" style={{ margin: '4px 0 0' }}>
          Average {averageKmh(values.distanceKm, values.timeSec).toFixed(1)} km/h · {formatTime(Math.round(values.timeSec / values.distanceKm))} per km
        </p>
      ) : null}
      <div className="field" style={{ marginTop: 12 }}>
        <span className="label">How hard did it feel?</span>
        <div className="tm-effort" role="radiogroup" aria-label="How hard did it feel">
          {EFFORT.map((e) => (
            <button key={e.n} role="radio" aria-checked={f.effort === e.n} className={`btn btn-sm${f.effort === e.n ? ' btn-primary' : ''}`} onClick={() => set('effort', e.n)}>
              {e.word}
            </button>
          ))}
        </div>
      </div>
      {(check.errors.length > 0 || check.flags.length > 0) && (f.distance || f.time) ? (
        <ul className="tm-checks">
          {check.errors.map((e) => (
            <li key={e} className="tm-warn">
              {e}
            </li>
          ))}
          {check.flags.map((e) => (
            <li key={e} className="muted small">
              Your coach will check: {e}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn btn-accent btn-lg" onClick={send} disabled={!!check.errors.length || busy !== '' || !!disabled}>
          {busy === 'sending' ? 'Sending…' : submitLabel}
        </button>
        {disabled && <span className="small muted">{disabled}</span>}
      </div>
    </div>
  );
}
