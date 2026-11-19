// "Put Tasuki on your Home Screen": the one-tap prompt on Android, the three steps on an iPhone (Safari has
// no prompt). An installed app opens full screen, works with no signal, and is the only way an iPhone can
// receive reminders. Hidden once installed, on a laptop, or when dismissed.
import { useState } from 'react';
import { isStandalone, platform, useInstallPrompt } from './pwa';
import { useDismissed } from './local';
import { chime } from './juice';

export function InstallCard() {
  const [dismissed, dismiss] = useDismissed('install');
  const { canPrompt, prompt } = useInstallPrompt();
  const [done, setDone] = useState(false);
  const p = platform();
  if (dismissed || done || isStandalone() || (p === 'other' && !canPrompt)) return null;
  return (
    <section className="trail-panel install">
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <h2 className="trail-h" style={{ margin: 0 }}>
          Put Tasuki on your Home Screen
        </h2>
        <button className="btn btn-ghost btn-sm" onClick={dismiss} aria-label="Not now">
          ✕
        </button>
      </div>
      <p className="small" style={{ margin: '6px 0 10px' }}>
        It opens like an app, full screen, and works with no signal on the hill.{p === 'ios' ? ' On an iPhone it is also the only way to get trail reminders.' : ''}
      </p>
      {canPrompt ? (
        <button
          className="btn-press btn-press-ai"
          onClick={async () => {
            chime('tap');
            if (await prompt()) setDone(true);
          }}
        >
          Install Tasuki
        </button>
      ) : p === 'ios' ? (
        <ol className="install-steps">
          <li>
            Tap <strong>Share</strong>{' '}
            <svg viewBox="0 0 20 24" width="16" height="19" aria-label="the Share button" className="install-share">
              <path d="M10,2 V15 M5,7 L10,2 L15,7 M4,11 H2 V22 H18 V11 H16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>{' '}
            in Safari (at the bottom, or the top on an iPad).
          </li>
          <li>
            Choose <strong>Add to Home Screen</strong> (scroll down the list if you cannot see it).
          </li>
          <li>
            Open <strong>Tasuki</strong> from your Home Screen and sign in once more: the Home Screen app keeps its own sign-in.
          </li>
        </ol>
      ) : (
        <p className="small muted" style={{ margin: 0 }}>
          In Chrome, open the menu ⋮ and choose <strong>Add to Home screen</strong> or <strong>Install app</strong>.
        </p>
      )}
    </section>
  );
}
