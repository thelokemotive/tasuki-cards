// Coach edits an athlete's avatar (spec 5). Components only; unlocks come from the data.
import { useState } from 'react';
import type { Accessory, Athlete, Avatar } from '../../types';
import { ACCESSORIES } from '../../types';
import { Field, Modal } from '../components/common';
import { useData } from '../data/DataContext';
import { useToast } from '../components/Toast';
import { AvatarSvg } from './AvatarSvg';
import { defaultAvatar, HAIR_COLOURS, HAIR_STYLES, KIT_COLOURS, SKIN_TONES } from '../../engine/avatarDefaults';
import type { AvatarUnlocks } from '../../engine/avatarUnlocks';

function Picker({ count, value, onChange, label }: { count: number; value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {Array.from({ length: count }, (_, i) => (
        <button key={i} type="button" className={value === i ? 'on' : ''} onClick={() => onChange(i)}>
          {i + 1}
        </button>
      ))}
    </div>
  );
}

export function AvatarEditor({ athlete, unlocks, onClose }: { athlete: Athlete; unlocks: AvatarUnlocks; onClose: () => void }) {
  const { commit } = useData();
  const toast = useToast();
  const [av, setAv] = useState<Avatar>(athlete.avatar);
  const set = <K extends keyof Avatar>(k: K, v: Avatar[K]) => setAv((x) => ({ ...x, [k]: v }));
  return (
    <Modal
      title="Edit avatar"
      onClose={onClose}
      wide
      actions={
        <>
          <button className="btn" onClick={() => setAv(defaultAvatar(athlete.id))}>
            Reset to default
          </button>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={async () => {
              await commit({ put: { athletes: [{ ...athlete, avatar: av }] } });
              toast('Avatar saved', 'ok');
              onClose();
            }}
          >
            Save avatar
          </button>
        </>
      }
    >
      <div className="row" style={{ alignItems: 'flex-start', gap: 24 }}>
        <div style={{ width: 180, background: 'var(--surface-2)', borderRadius: 12, padding: 10 }}>
          <AvatarSvg avatar={av} unlocks={unlocks} />
        </div>
        <div className="stack" style={{ flex: 1, minWidth: 260 }}>
          <Field label="Skin tone">
            <Picker count={SKIN_TONES} value={av.skinTone} onChange={(n) => set('skinTone', n)} label="Skin tone" />
          </Field>
          <Field label="Hair style">
            <Picker count={HAIR_STYLES} value={av.hairStyle} onChange={(n) => set('hairStyle', n)} label="Hair style" />
          </Field>
          <Field label="Hair colour">
            <Picker count={HAIR_COLOURS} value={av.hairColour} onChange={(n) => set('hairColour', n)} label="Hair colour" />
          </Field>
          <Field label="Kit colour">
            <select className="select" value={av.kitColour} onChange={(e) => set('kitColour', e.target.value)}>
              {KIT_COLOURS.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Accessory">
            <select className="select" value={av.accessory} onChange={(e) => set('accessory', e.target.value as Accessory)}>
              {ACCESSORIES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </Field>
          <p className="small muted">Extras such as the compass, ankle guards, motion lines, wings, sash and headband are earned from the data and appear automatically. Appearance never affects any rating.</p>
        </div>
      </div>
    </Modal>
  );
}
