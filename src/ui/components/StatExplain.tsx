// The working behind every rating (go-live plan 4): a coach modal per stat, and a student-readable sheet
// (display name only, no DOB) that can be printed or copied. All text comes from src/engine/explain.ts.
import type { ReactNode } from 'react';
import { Modal } from './common';
import { useToast } from './Toast';
import { useData } from '../data/DataContext';
import type { AthleteDerived } from '../../engine/derive';
import type { RatingKey } from '../../engine/types';
import { explainAll, explainOvr, explainStat, explanationText, type ConsideredStatus, type StatExplanation } from '../../engine/explain';
import { formatLongDate, formatShortDate } from '../../engine/dates';
import { displayName } from '../../engine/display';
import { STAT_NAMES } from '../cards/cardData';

const STATUS_PILL: Record<ConsideredStatus, string> = {
  used: 'pill-ok',
  shield: 'pill-ai',
  lower: '',
  older: '',
  expired: '',
  unverified: 'pill-warn',
  not_scored: 'pill-warn',
  not_top3: '',
  outside_window: '',
  future: '',
};

export function ExplanationBody({ e, showList = true }: { e: StatExplanation; showList?: boolean }) {
  return (
    <div className="explain">
      {e.paragraphs.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      {showList && e.considered.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Result</th>
                <th className="num">Score</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              {e.considered.map((c) => (
                <tr key={c.perfId}>
                  <td className="nowrap">{formatShortDate(c.date)}</td>
                  <td className="small">{c.label}</td>
                  <td className="num">{c.fresh ?? c.score ?? '—'}</td>
                  <td>
                    <span className={`pill ${STATUS_PILL[c.status]}`}>{c.reason}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CopyButton({ text, children }: { text: string; children: ReactNode }) {
  const toast = useToast();
  return (
    <button
      className="btn"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast('Copied', 'ok');
        } catch {
          toast('Could not copy: select the text and copy it instead', 'err');
        }
      }}
    >
      {children}
    </button>
  );
}

/** Coach view: the working for one rating (or OVR), with every result considered. */
export function ExplainModal({ d, stat, onClose }: { d: AthleteDerived; stat: RatingKey | 'OVR'; onClose: () => void }) {
  const { derived } = useData();
  if (stat === 'OVR') {
    const lines = explainOvr(d, derived.config);
    return (
      <Modal title={`OVR ${d.ratings.ovr.display}: how it is worked out`} onClose={onClose} actions={<CopyButton text={lines.join('\n')}>Copy text</CopyButton>}>
        <div className="explain">
          {lines.map((l, i) => (
            <p key={i}>{l}</p>
          ))}
        </div>
      </Modal>
    );
  }
  const e = explainStat(d, stat, derived.config, derived.lookup);
  return (
    <Modal
      wide
      title={`${e.headline.replace(':', '')} · ${STAT_NAMES[stat]}: how it is worked out`}
      onClose={onClose}
      actions={
        <>
          <CopyButton text={explanationText(e)}>Copy text</CopyButton>
          <button className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <ExplanationBody e={e} />
      <p className="tiny muted">
        Config v{derived.configVersion} · as of {formatLongDate(derived.asOf)}
      </p>
    </Modal>
  );
}

/** Student-readable sheet: every rating explained, display name only, no DOB, nothing coach-only. */
export function StudentSheet({ d }: { d: AthleteDerived }) {
  const { derived } = useData();
  const all = explainAll(d, derived.config, derived.lookup, { audience: 'student' });
  const ovr = explainOvr(d, derived.config);
  const name = displayName(d.athlete);
  const text = [`${name}: how your ratings are worked out (as of ${formatLongDate(derived.asOf)})`, '', ...all.map((e) => explanationText(e, false) + '\n'), ...ovr].join('\n');
  return (
    <div className="student-sheet">
      <div className="row no-print" style={{ marginBottom: 12 }}>
        <button className="btn btn-primary" onClick={() => window.print()}>
          Print
        </button>
        <CopyButton text={text}>Copy as text</CopyButton>
        <span className="small muted">Shows the display name only ({name}), never the date of birth.</span>
      </div>
      <h1 style={{ marginTop: 0 }}>{name}: how your ratings are worked out</h1>
      <p className="muted small">
        As of {formatLongDate(derived.asOf)}. Every number comes from your verified results; ages are in whole years. Results that did not count are listed with the reason.
      </p>
      {all.map((e) => (
        <section key={e.key} className="student-stat">
          <h2>
            {e.headline} <span className="muted small">{STAT_NAMES[e.key]}</span>
          </h2>
          <ExplanationBody e={e} showList={e.considered.length > 1} />
        </section>
      ))}
      <section className="student-stat">
        <h2>OVR {d.ratings.ovr.display}</h2>
        {ovr.map((l, i) => (
          <p key={i}>{l}</p>
        ))}
      </section>
    </div>
  );
}
