// Per-leg ARM entry (Season 0 protocol): the coach types each leg's raw result; the engine works out the
// weaker side and the levels, shown live underneath. Used by Quick entry and the correction editor.
import type { ArmMeasures, ArmSide } from '../../types';
import type { Config } from '../../engine/config';
import { armEffective, armHasSides, armLevelsFromTest, armPlates, HOP_LINES_CM } from '../../engine/arm';

const ROWS: { key: keyof ArmSide; label: string; step?: string }[] = [
  { key: 'ankleCm', label: 'Ankle: the Lunge (cm)', step: '0.5' },
  { key: 'calfReps', label: 'Calf: the Wall (reps)' },
  { key: 'storkSec', label: 'Balance: the Stork (s)' },
  { key: 'hopLineCm', label: 'Hop & Freeze (furthest line)' },
];

const numOrUndef = (s: string) => (s.trim() === '' ? undefined : Number(s));

/** Drop empty sides and undefined keys so stored records stay tidy. */
export function tidyArm(arm: ArmMeasures): ArmMeasures {
  const out: ArmMeasures = {};
  for (const [k, v] of Object.entries(arm) as [keyof ArmMeasures, unknown][]) {
    if (v === undefined) continue;
    if (k === 'left' || k === 'right') {
      const side = Object.fromEntries(Object.entries(v as ArmSide).filter(([, x]) => x !== undefined && Number.isFinite(x))) as ArmSide;
      if (Object.keys(side).length) out[k] = side;
    } else (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

export function ArmLegsInput({ value, onChange, config }: { value: ArmMeasures | undefined; onChange: (v: ArmMeasures) => void; config: Config }) {
  const arm = value ?? {};
  const setSide = (side: 'left' | 'right', key: keyof ArmSide, v: number | undefined) => onChange({ ...arm, [side]: { ...arm[side], [key]: v } });
  const legacy = arm.ankleCm != null || arm.calfReps != null || arm.storkSec != null || arm.hopStickBothLegs != null;
  const eff = armEffective(arm, config);
  const levels = armLevelsFromTest(arm, config);
  const weak = (k: keyof ArmSide) => eff.weakSide?.[k];
  const shown = (k: keyof ArmSide) => (k === 'hopLineCm' ? (eff.hopStickBothLegs == null ? '—' : eff.hopStickBothLegs ? 'yes' : 'no') : (eff[k] ?? '—'));
  return (
    <div className="table-wrap">
      <table className="table arm-legs">
        <thead>
          <tr>
            <th>Test</th>
            <th>Left</th>
            <th>Right</th>
            <th title="Worked out by the app">Weaker side</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.key}>
              <td>{r.label}</td>
              {(['left', 'right'] as const).map((side) => (
                <td key={side}>
                  {r.key === 'hopLineCm' ? (
                    <select className="select" aria-label={`${r.label}, ${side}`} value={arm[side]?.hopLineCm ?? ''} onChange={(e) => setSide(side, 'hopLineCm', numOrUndef(e.target.value))}>
                      <option value="">not tested</option>
                      <option value="0">none frozen</option>
                      {HOP_LINES_CM.map((cm) => (
                        <option key={cm} value={cm}>
                          {cm} cm
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input className="input" type="number" min="0" step={r.step} aria-label={`${r.label}, ${side}`} value={arm[side]?.[r.key] ?? ''} onChange={(e) => setSide(side, r.key, numOrUndef(e.target.value))} />
                  )}
                </td>
              ))}
              <td className="num">
                {shown(r.key)}
                {weak(r.key) && weak(r.key) !== '=' && <span className="muted small"> ({weak(r.key)})</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">
        Levels: <strong>{armPlates(levels)}</strong> · hop counts as yes at {config.arm.hopGateCm} cm frozen on both legs.
        {legacy && !armHasSides(arm) && ' Older record: one weaker-side value per test; per-leg results entered here replace it.'}
      </p>
    </div>
  );
}
