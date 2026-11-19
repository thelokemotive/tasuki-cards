// "Your armour": the three plates on one runner's page (coach and pupil views). Level, both legs, the next
// target and one thing to do, weakest plate first, with a link to what each plate means on the trail.
import type { AthleteDerived } from '../../engine/derive';
import type { Config } from '../../engine/config';
import { armTestDetail, type ArmDomain } from '../../engine/arm';
import { plateAdvice, plateGuides } from '../../engine/armGuide';
import { formatShortDate } from '../../engine/dates';
import { Link } from '../router';

const UNIT: Record<ArmDomain, string> = { ankle: ' cm', calf: ' reps', control: '' };

/** The latest verified ARM test that recorded a plate, with its left/right values. */
function lastMeasure(d: AthleteDerived, dom: ArmDomain, config: Config): { text: string; date: string } | undefined {
  const tests = d.perfs.filter((p) => p.kind === 'arm' && !p.deleted && p.verified).sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const p of tests) {
    const det = armTestDetail(p.arm, config);
    const ws = dom === 'ankle' ? det.ankle : dom === 'calf' ? det.calf : det.control;
    if (ws.value == null) {
      if (dom === 'control' && det.interim) return { text: `hop ${det.hop.left}/${det.hop.right} cm (no Throne yet)`, date: p.date };
      continue;
    }
    const pre = dom === 'control' && config.arm.plate3 === 'control' ? 'T' : '';
    const both = ws.left != null && ws.right != null ? `L ${pre}${ws.left} · R ${pre}${ws.right}` : `${pre}${ws.value}`;
    const capped = dom === 'calf' && det.calf.capped ? ` (counts as ${det.calf.counted})` : '';
    return { text: `${both}${UNIT[dom]}${capped}`, date: p.date };
  }
  return undefined;
}

export function ArmPanel({ d, config, coach = false }: { d: AthleteDerived; config: Config; coach?: boolean }) {
  const levels = d.ratings.arm;
  const arm = d.ratings.stats.ARM;
  const advice = plateAdvice(levels, config);
  const guides = plateGuides(config);
  const tested = levels.ankle != null || levels.calf != null || levels.control != null;
  return (
    <div className="arm-panel">
      <div className="arm-head">
        <div>
          <div className="arm-score num">{arm.locked ? '🔒' : arm.value}</div>
          <div className="tiny muted">ARM{levels.plates ? ` · ${levels.plates}` : ''}</div>
        </div>
        <p className="small" style={{ margin: 0 }}>
          {arm.locked ? arm.unlockHelp : `Built from three plates, each on your weaker leg.`} <Link to="/armour">What ARM is and why it matters →</Link>
        </p>
      </div>
      {!tested && <p className="small muted">No ARM test yet. The next screening tests the Lunge, the Wall and the Throne.</p>}
      <div className="arm-plates">
        {advice.map((a, i) => {
          const g = guides.find((x) => x.domain === a.domain)!;
          const last = lastMeasure(d, a.domain, config);
          return (
            <section key={a.domain} className={`arm-plate${i === 0 && tested ? ' is-focus' : ''}`} aria-label={`${a.plate} plate`}>
              <div className="arm-plate-top">
                <span aria-hidden>{g.icon}</span> <strong>{a.plate}</strong> <span className="muted tiny">{a.test}</span>
                {i === 0 && tested && <span className="pill pill-warn" style={{ marginLeft: 'auto' }}>start here</span>}
              </div>
              <div className="arm-level num">
                {a.level == null ? '—' : `L${a.level}`}
                {a.interim && (
                  <span className="pill" title="Interim level from the hop: your first Throne test replaces it" style={{ marginLeft: 6, fontSize: 11 }}>
                    interim*
                  </span>
                )}
              </div>
              {last && (
                <div className="tiny muted">
                  {last.text} · {formatShortDate(last.date)}
                </div>
              )}
              {a.next && <div className="small" style={{ marginTop: 4 }}><strong>{a.next}</strong></div>}
              <div className="small" style={{ marginTop: 4 }}>{a.doThis}</div>
              <div className="tiny muted" style={{ marginTop: 4 }}>{g.trail[0]}</div>
            </section>
          );
        })}
      </div>
      {coach && d.athlete.heightCm != null && (
        <p className="tiny muted">
          Height {d.athlete.heightCm} cm{d.athlete.heightMeasuredOn ? ` (${formatShortDate(d.athlete.heightMeasuredOn)})` : ''} · coach only
        </p>
      )}
    </div>
  );
}
