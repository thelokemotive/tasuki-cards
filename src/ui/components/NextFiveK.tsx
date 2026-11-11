// Next 5K: the prediction with its confidence interval, the realistic and stretch targets, and every result
// behind it (how it was converted, how much it counts, or why it was left out).
import type { AthleteDerived } from '../../engine/derive';
import type { Config } from '../../engine/config';
import { explainPrediction, DEFAULT_PREDICT, type PredictConfig } from '../../engine/predict';
import { formatTime } from '../../engine/format';
import { formatShortDate } from '../../engine/dates';
import { displayName } from '../../engine/display';

/** A horizontal scale: the interval as a band, the prediction as a dot, the targets as flags. */
function Range({ low, high, pred, realistic, stretch, best }: { low: number; high: number; pred: number; realistic: number; stretch: number; best?: number }) {
  const lo = Math.min(low, stretch, best ?? Infinity) * 0.985;
  const hi = Math.max(high, best ?? 0) * 1.015;
  const x = (t: number) => `${((hi - t) / (hi - lo)) * 100}%`; // faster to the right
  return (
    <div className="nf-range" aria-hidden="true">
      <div className="nf-band" style={{ left: x(high), right: `calc(100% - ${x(low)})` }} />
      <div className="nf-mark nf-pred" style={{ left: x(pred) }} title="Prediction" />
      <div className="nf-flag nf-real" style={{ left: x(realistic) }}>
        <span>Realistic</span>
      </div>
      <div className="nf-flag nf-stretch" style={{ left: x(stretch) }}>
        <span>Stretch</span>
      </div>
      {best != null && <div className="nf-mark nf-pb" style={{ left: x(best) }} title={`5 km PB ${formatTime(best)}`} />}
      <div className="nf-axis">
        <span>slower</span>
        <span>faster →</span>
      </div>
    </div>
  );
}

export function NextFiveK({ d, config, student = false }: { d: AthleteDerived; config: Config; student?: boolean }) {
  const p = d.prediction;
  const cfg: PredictConfig = (config as Config & { predict?: PredictConfig }).predict ?? DEFAULT_PREDICT;
  if (!p) return <p className="muted small">No 5 km prediction yet: it needs one verified timed result of at least {cfg.minSourceKm} km from the last {cfg.windowMonths} months.</p>;
  const name = student ? displayName(d.athlete) : d.athlete.preferredName || d.athlete.givenName;
  const conf = Math.round(cfg.confidence * 100);
  return (
    <div className="nf">
      <div className="nf-top">
        <div className="nf-stat">
          <span className="nf-l">Predicted today</span>
          <span className="nf-v num">{formatTime(p.predictedSec)}</span>
          <span className="nf-s">
            {conf}% range {formatTime(p.lowSec)}–{formatTime(p.highSec)} · {p.confidenceLabel} confidence
          </span>
        </div>
        <div className="nf-stat nf-target">
          <span className="nf-l">Realistic target</span>
          <span className="nf-v num">{formatTime(p.realisticSec)}</span>
          <span className="nf-s">{p.targetBasis === 'pb' ? 'back to your PB' : `${p.realisticPct.toFixed(1)}% faster in a term`}</span>
        </div>
        <div className="nf-stat nf-stretchbox">
          <span className="nf-l">Stretch target</span>
          <span className="nf-v num">{formatTime(p.stretchSec)}</span>
          <span className="nf-s">{p.stretchPct.toFixed(1)}% faster{p.targetBasis === 'pb' ? ' than your PB' : ''}</span>
        </div>
        {p.best5kSec != null && (
          <div className="nf-stat">
            <span className="nf-l">5 km PB</span>
            <span className="nf-v num">{formatTime(p.best5kSec)}</span>
            <span className="nf-s">last {cfg.windowMonths} months</span>
          </div>
        )}
      </div>
      <Range low={p.lowSec} high={p.highSec} pred={p.predictedSec} realistic={p.realisticSec} stretch={p.stretchSec} best={p.best5kSec} />
      <details className="nf-why">
        <summary>Why these numbers?</summary>
        {explainPrediction(p, name, cfg).map((t, i) => (
          <p key={i}>{t}</p>
        ))}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Result</th>
                <th className="num">Effort km</th>
                <th className="num">Time</th>
                <th className="num">b</th>
                <th className="num">5 km now</th>
                <th>Counts</th>
              </tr>
            </thead>
            <tbody>
              {p.sources.map((s) => (
                <tr key={s.perfId} className={s.used ? '' : 'row-muted'}>
                  <td className="nowrap">{formatShortDate(s.date)}</td>
                  <td className="small">{s.label}</td>
                  <td className="num">{s.km.toFixed(2)}</td>
                  <td className="num">{formatTime(s.timeSec)}</td>
                  <td className="num">{s.exponent.toFixed(3)}</td>
                  <td className="num">
                    <strong>{formatTime(s.fiveKNow)}</strong>
                  </td>
                  <td className="small">{s.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
