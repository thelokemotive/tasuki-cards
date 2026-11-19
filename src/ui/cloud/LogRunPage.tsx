// Pupils on the website: log a treadmill run from a photo of the console. It goes to the coach's inbox and
// appears on the card once the coach has approved it.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useData } from '../data/DataContext';
import { useAccount, type TreadmillLog } from './account';
import { PageHeader, Panel } from '../components/common';
import { useToast } from '../components/Toast';
import { displayName } from '../../engine/display';
import { formatShortDate } from '../../engine/dates';
import { formatTime } from '../../engine/format';
import { TreadmillForm, type TreadmillEntry } from '../treadmill/TreadmillForm';
import { MyWeek } from '../treadmill/MyWeek';
import { Link } from '../router';
import { useMyCard } from '../pupil/local';
import { buzz, chime } from '../pupil/juice';

export function LogRunPage() {
  const { derived, snapshot, config, today } = useData();
  const account = useAccount();
  const toast = useToast();
  const cloud = account?.treadmill;
  const [me, setMe] = useMyCard();
  const [pending, setPending] = useState<TreadmillLog[] | null>(null);
  const [open, setOpen] = useState<boolean | null>(null);
  useEffect(() => {
    if (cloud) cloud.isOpen().then(setOpen, () => setOpen(false));
  }, [cloud]);
  const cards = useMemo(
    () => [...derived.athletes.values()].filter((d) => d.athlete.active && !d.athlete.hiddenOnline && d.athlete.squad !== false).sort((a, b) => displayName(a.athlete).localeCompare(displayName(b.athlete))),
    [derived],
  );
  const mine = cards.find((d) => d.athlete.id === me);
  const refresh = useCallback(() => {
    cloud?.mine().then(setPending, () => setPending([]));
  }, [cloud]);
  useEffect(refresh, [refresh]);

  const submit = async (e: TreadmillEntry) => {
    if (!cloud || !mine) return;
    try {
      await cloud.submit({ athleteId: mine.athlete.id, date: e.date, ...e.values, read: e.read, edited: e.edited, flags: e.flags, ...(e.photo ? { photo: e.photo } : {}) });
      chime('moment');
      buzz([20, 40, 20]);
      toast('Sent! Your trail is kindling: it lights up once your coach approves the run.', 'ok');
      refresh();
    } catch (err) {
      toast(`Not sent: ${err instanceof Error ? err.message : String(err)}`, 'err');
      throw err;
    }
  };

  return (
    <div className="stack">
      <PageHeader title="Log a treadmill run" subtitle="Every session keeps your weekly streak going and counts towards the treadmill km club. A run of 5 km or more also counts for your END rating." />
      <Panel title="Which card is yours?">
        <select
          className="select"
          value={me}
          onChange={(e) => setMe(e.target.value || null)}
          aria-label="Your card"
        >
          <option value="">Choose your name…</option>
          {cards.map((d) => (
            <option key={d.athlete.id} value={d.athlete.id}>
              {displayName(d.athlete)} ({d.athlete.yearGroup})
            </option>
          ))}
        </select>
        <p className="tiny muted" style={{ marginTop: 6 }}>
          Your coach sees which school account sent each run. Not on the list? Ask your coach to add you.
        </p>
      </Panel>
      {mine && (
        <Panel title={`This week · ${displayName(mine.athlete)}`} actions={<Link className="btn btn-sm" to={`/athlete/${mine.athlete.id}/share`}>My card</Link>}>
          <MyWeek d={mine} config={config} calendar={snapshot.calendar} asOf={today} />
        </Panel>
      )}
      {open === false ? (
        <Panel title="Your run">
          <p className="muted" style={{ margin: 0 }}>
            Treadmill logging is not open yet. Your coach will tell you when it is.
          </p>
        </Panel>
      ) : (
        <Panel title="Your run">
          <TreadmillForm onSubmit={submit} submitLabel="Send to my coach" disabled={!cloud ? 'Logging needs the school website.' : !mine ? 'Choose your card first.' : open == null ? 'Checking…' : undefined} />
        </Panel>
      )}
      {pending && pending.length > 0 && (
        <Panel title={`Waiting for your coach (${pending.length})`}>
          <ul className="plain-list">
            {pending.map((p) => (
              <li key={p.id} className="row-between" style={{ padding: '4px 0' }}>
                <span>
                  {formatShortDate(p.date)} · {p.distanceKm.toFixed(2)} km in {formatTime(p.timeSec)}
                  {p.athleteId !== me && <span className="muted"> · for {cards.find((c) => c.athlete.id === p.athleteId)?.athlete ? displayName(cards.find((c) => c.athlete.id === p.athleteId)!.athlete) : 'another card'}</span>}
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    cloud?.remove(p.id).then(
                      () => {
                        toast('Withdrawn', 'ok');
                        refresh();
                      },
                      () => toast('Could not withdraw it', 'err'),
                    )
                  }
                >
                  Withdraw
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
