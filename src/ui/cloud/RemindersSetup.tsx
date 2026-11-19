// Head coach only: switch trail reminders on or off, and make the key pair that signs them (once).
import { useEffect, useState } from 'react';
import { useAccount } from './account';
import { useToast } from '../components/Toast';
import { generateVapidKeys } from '../pupil/vapid';

export function RemindersSetup() {
  const account = useAccount();
  const toast = useToast();
  const cloud = account?.isOwner ? account.reminders : undefined;
  const [s, setS] = useState<{ open: boolean; key?: string } | null>(null);
  const [made, setMade] = useState<{ publicKey: string; privateKey: string } | null>(null);
  useEffect(() => {
    cloud?.settings().then(setS, () => setS(null));
  }, [cloud]);
  if (!cloud || !s) return null;
  const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => toast('Copied', 'ok'), () => toast('Select it and copy by hand', 'err'));
  return (
    <div className="stack-sm">
      <label className="acct-label acct-toggle">
        <input
          type="checkbox"
          checked={s.open}
          disabled={!s.key}
          onChange={(e) => {
            const open = e.target.checked;
            cloud.setSettings({ open }).then(
              () => {
                setS({ ...s, open });
                toast(open ? 'Trail reminders on (pupils still choose)' : 'Trail reminders off', 'ok');
              },
              (err) => toast(`Could not change: ${err instanceof Error ? err.message : err}`, 'err'),
            );
          }}
        />
        Trail reminders (pupils can turn on weekly nudges on their phones)
      </label>
      {!s.key && !made && (
        <button
          className="btn btn-sm"
          onClick={() =>
            generateVapidKeys().then(setMade, (e) => toast(`Could not make keys: ${e instanceof Error ? e.message : e}`, 'err'))
          }
        >
          Set up reminder keys (once)
        </button>
      )}
      {made && (
        <div className="tiny" style={{ background: 'var(--warn-soft)', padding: 8, borderRadius: 8 }}>
          <p style={{ margin: '0 0 6px' }}>
            <strong>Save this private key now; it is shown only once.</strong> In GitHub: the repository → Settings → Secrets and variables → Actions → New secret, named <code>VAPID_PRIVATE_KEY</code>.
          </p>
          <code style={{ display: 'block', overflowWrap: 'anywhere', userSelect: 'all' }}>{made.privateKey}</code>
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn btn-sm" onClick={() => copy(made.privateKey)}>
              Copy
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={() =>
                cloud.setSettings({ key: made.publicKey }).then(
                  () => {
                    setS({ ...s, key: made.publicKey });
                    setMade(null);
                    toast('Reminder key saved. Now switch reminders on.', 'ok');
                  },
                  (e) => toast(`Could not save: ${e instanceof Error ? e.message : e}`, 'err'),
                )
              }
            >
              I have saved it in GitHub
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
