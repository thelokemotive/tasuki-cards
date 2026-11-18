// Coaches on the website: treadmill runs pupils have sent, with the photo of the console. Approve saves a
// verified treadmill session; either way the log and its photo are then deleted from the inbox.
import './treadmill.css';
import { useEffect, useMemo, useState } from 'react';
import { useAccount, type TreadmillLog } from '../cloud/account';
import { useData } from '../data/DataContext';
import { Panel, newId } from '../components/common';
import { useToast } from '../components/Toast';
import { Link } from '../router';
import { approveLog, reviewLog, sender } from '../../engine/treadmill/inbox';
import { averageKmh } from '../../engine/treadmill/session';
import { formatShortDate } from '../../engine/dates';
import { formatTime } from '../../engine/format';
import { fullName } from '../../engine/display';

function Photo({ bytes }: { bytes?: Uint8Array }) {
  const url = useMemo(() => (bytes ? URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/jpeg' })) : ''), [bytes]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  return url ? <img src={url} alt="The treadmill display the pupil photographed" /> : <div className="tm-noimg muted small">No photo (typed in)</div>;
}

export function TreadmillInbox() {
  const account = useAccount();
  const cloud = account && !account.viewer ? account.treadmill : undefined;
  const { snapshot, commit, today, config } = useData();
  const toast = useToast();
  const [logs, setLogs] = useState<TreadmillLog[]>([]);
  const [busy, setBusy] = useState('');
  useEffect(() => (cloud ? cloud.watchInbox(setLogs) : undefined), [cloud]);
  if (!cloud || !logs.length) return null;

  const decide = async (log: TreadmillLog, approve: boolean) => {
    setBusy(log.id);
    try {
      if (approve) {
        const r = reviewLog(log, snapshot, today, config);
        if (!r.athlete) throw new Error('that card is no longer on the roster');
        await commit(approveLog(log, r.athlete, new Date().toISOString(), newId('p')));
      }
      await cloud.remove(log.id);
      toast(approve ? 'Saved to the runner’s card' : 'Removed', 'ok');
    } catch (e) {
      toast(`Could not do that: ${e instanceof Error ? e.message : String(e)}`, 'err');
    } finally {
      setBusy('');
    }
  };

  const sorted = [...logs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const clean = sorted.filter((l) => !reviewLog(l, snapshot, today, config).warnings.length);
  return (
    <Panel
      title={`Treadmill runs to check (${logs.length})`}
      actions={
        clean.length > 1 ? (
          <button
            className="btn btn-sm btn-primary"
            disabled={!!busy}
            onClick={async () => {
              for (const l of clean) await decide(l, true);
            }}
          >
            Approve the {clean.length} with nothing to check
          </button>
        ) : undefined
      }
    >
      <p className="tiny muted" style={{ marginTop: 0 }}>
        Sent by pupils from a photo of the console. Approving saves a treadmill session: it keeps the weekly streak going and counts for the treadmill km club, and a run of 5 km of effort or more also counts for END, like a long run. The photo is deleted once you decide.
      </p>
      <div className="tm-inbox">
        {sorted.map((log) => {
          const r = reviewLog(log, snapshot, today, config);
          return (
            <div key={log.id} className="tm-item">
              <Photo bytes={log.photo} />
              <div className="tm-body">
                <div className="tm-nums">
                  {log.distanceKm.toFixed(3)} km · {formatTime(log.timeSec)}
                  {log.inclinePct != null ? ` · ${log.inclinePct.toFixed(1)}%` : ''}
                  {log.speedKmh != null ? ` · ${log.speedKmh.toFixed(1)} km/h` : ''}
                </div>
                <div className="small">
                  {r.athlete ? <Link to={`/athlete/${r.athlete.id}`}>{fullName(r.athlete)}</Link> : 'Unknown card'} · {formatShortDate(log.date)} · average {averageKmh(log.distanceKm, log.timeSec).toFixed(1)} km/h
                  {log.effort ? ` · felt ${log.effort}/10` : ''}
                </div>
                <div className="tiny muted">Sent by {sender(log)}</div>
                {r.warnings.map((w) => (
                  <div key={w} className="tm-warn">
                    {w}
                  </div>
                ))}
                <div className="row" style={{ marginTop: 6 }}>
                  <button className="btn btn-sm btn-primary" disabled={!!busy || !r.athlete || !!r.duplicateOf} onClick={() => decide(log, true)}>
                    Approve
                  </button>
                  <button className="btn btn-sm" disabled={!!busy} onClick={() => decide(log, false)}>
                    {r.duplicateOf ? 'Remove duplicate' : 'Turn down'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
