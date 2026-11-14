// Top-bar account chip on the website: who is signed in, sign out, and (head coach only) the coach list.
import { useState } from 'react';
import { useToast } from '../components/Toast';
import { OWNER_EMAIL, parseCoachEmails, useAccount } from './account';

export function AccountMenu() {
  const account = useAccount();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  if (!account) return null;
  const { rejected, emails } = parseCoachEmails(text);
  return (
    <div className="acct">
      <button
        className="btn btn-sm acct-chip"
        aria-expanded={open}
        onClick={() => {
          setText(account.coaches.join('\n'));
          setOpen(!open);
        }}
      >
        {account.email.split('@')[0]}
      </button>
      {open && (
        <div className="acct-panel" role="dialog" aria-label="Account">
          <div className="tiny muted">Signed in as</div>
          <div className="acct-email">{account.email}</div>
          {account.isOwner ? (
            <>
              <label className="acct-label acct-toggle">
                <input
                  type="checkbox"
                  checked={account.pupilView}
                  onChange={(e) =>
                    account.setPupilView(e.target.checked).then(
                      () => toast(e.target.checked ? 'Pupil view open' : 'Pupil view closed', 'ok'),
                      (err) => toast(`Could not change: ${err instanceof Error ? err.message : err}`, 'err'),
                    )
                  }
                />
                Pupil view open (everyone at school can see cards and boards)
              </label>
              <label className="acct-label" htmlFor="coach-list">
                Other coaches (one school email per line)
              </label>
              <textarea id="coach-list" className="textarea" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="colleague@harrowappi.jp" />
              {rejected.length > 0 && <div className="tiny acct-warn">Not school addresses, will be left out: {rejected.join(', ')}</div>}
              <p className="tiny muted">Coaches can see and edit everything, including dates of birth and notes. Staff only: do not add pupils.</p>
              <button
                className="btn btn-primary btn-sm"
                onClick={() =>
                  account.saveCoaches(emails).then(
                    () => toast('Coach list saved', 'ok'),
                    (e) => toast(`Could not save: ${e instanceof Error ? e.message : e}`, 'err'),
                  )
                }
              >
                Save coach list
              </button>
            </>
          ) : account.viewer ? (
            <p className="tiny muted">View only: cards, boards and your own sheet. Coaches enter the results.</p>
          ) : (
            <p className="tiny muted">Coaches: {[OWNER_EMAIL, ...account.coaches].join(', ')}</p>
          )}
          <button className="btn btn-sm" onClick={() => account.signOut()}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
