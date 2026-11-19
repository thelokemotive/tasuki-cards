// ARM spread (Season 0 threshold review): for each plate, how many pupils sit at each level and below L1.
// Shown under Settings → Scoring → ARM; with unsaved threshold changes it also shows the spread they would give.
import type { Derived } from '../../../engine/derive';
import { ARM_DOMAINS, armSpread, armSpreadSkewed, type ArmDomain, type ArmPlateSpread } from '../../../engine/arm';
import { Panel } from '../../components/common';
import { Link } from '../../router';

const plateLabel = (d: ArmDomain, plate3: 'control' | 'balance'): string =>
  d === 'ankle' ? 'Ankle (the Lunge)' : d === 'calf' ? 'Calf (the Wall)' : plate3 === 'balance' ? 'Balance (the Stork + Hop)' : 'Control (the Throne)';

/** Active pupils (staff left out): the group the thresholds are set for. */
export function pupilArmSpread(d: Derived): Record<ArmDomain, ArmPlateSpread> {
  return armSpread([...d.athletes.values()].filter((a) => a.athlete.active && a.athlete.yearGroup !== 'Staff').map((a) => a.ratings.arm));
}

function SpreadTable({ spread, label, plate3 }: { spread: Record<ArmDomain, ArmPlateSpread>; label?: string; plate3: 'control' | 'balance' }) {
  return (
    <div className="table-wrap">
      {label && <div className="small" style={{ fontWeight: 600, margin: '6px 0' }}>{label}</div>}
      <table className="table">
        <thead>
          <tr>
            <th>Plate</th>
            <th className="num">Below L1</th>
            {[1, 2, 3, 4, 5].map((l) => (
              <th key={l} className="num">
                L{l}
              </th>
            ))}
            <th className="num">Tested</th>
            <th className="num">Not tested</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {ARM_DOMAINS.map((d) => {
            const s = spread[d];
            const skew = armSpreadSkewed(s);
            const hi = (n: number) => (s.tested > 0 && n > s.tested / 3 ? { color: 'var(--err)', fontWeight: 700 } : undefined);
            return (
              <tr key={d}>
                <td>{plateLabel(d, plate3)}</td>
                <td className="num" style={hi(s.below)}>
                  {s.below}
                </td>
                {s.levels.map((n, i) => (
                  <td key={i} className="num" style={i === 4 ? hi(n) : undefined}>
                    {n}
                  </td>
                ))}
                <td className="num">{s.tested}</td>
                <td className="num muted">{s.untested}</td>
                <td className="small">{skew ? <span className="pill pill-warn">review thresholds</span> : s.tested > 0 ? <span className="muted">ok</span> : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ArmSpreadPanel({ now, after }: { now: Derived; after?: Derived }) {
  return (
    <Panel title="ARM spread · Season 0 review">
      <p className="small muted">
        Active pupils at each level of each plate (best level in the last {now.config.arm.windowMonths} months, weaker leg). Once every group is tested: if more than about a third of the tested pupils sit at L5 or
        below L1 on a plate, move that plate’s numbers once, here, reprint the thresholds card, then leave them for the year.
      </p>
      <SpreadTable spread={pupilArmSpread(now)} label={after ? 'Now' : undefined} plate3={now.config.arm.plate3} />
      {after && <SpreadTable spread={pupilArmSpread(after)} label="With the changes above (not applied yet)" plate3={after.config.arm.plate3} />}
      <p className="tiny muted">
        Raw values, hop distances and Throne against height: <Link to="/armoury">Armoury → Spread</Link>.
      </p>
    </Panel>
  );
}
