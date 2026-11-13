// The website's front door: sign in with a school Google account, check the coach list, then open
// the app on the shared database.
import { useEffect, useState, type ReactNode } from 'react';
import { connect, type Cloud } from '../../cloud/firebase';
import { DataProvider } from '../data/DataContext';
import { YamaScene } from '../art/YamaScene';
import { BrandMark } from '../components/BrandMark';
import { AccountContext, OWNER_EMAIL, SCHOOL_DOMAIN } from './account';
import './cloud.css';

type Phase =
  | { at: 'loading' }
  | { at: 'error'; message: string }
  | { at: 'signedOut' }
  | { at: 'denied'; email: string; why: 'domain' | 'list' }
  | { at: 'in'; email: string; coaches: string[] };

function Door({ children }: { children: ReactNode }) {
  const hour = new Date().getHours();
  const mood = hour < 7 ? 'dawn' : hour < 17 ? 'summer' : hour < 19 ? 'autumn' : 'night';
  return (
    <div className="door">
      <YamaScene mood={mood} shape="wide" seed={11} className="door-scene" />
      <div className="door-card">
        <div className="door-brand">
          <BrandMark />
          <div>
            <strong>Tasuki Cards</strong>
            <small>HARROW APPI TRAIL RUNNING</small>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function CloudGate({ children }: { children: ReactNode }) {
  const [cloud, setCloud] = useState<Cloud | null>(null);
  const [phase, setPhase] = useState<Phase>({ at: 'loading' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let off: (() => void) | undefined;
    let cancelled = false;
    connect()
      .then((c) => {
        if (cancelled) return;
        setCloud(c);
        off = c.onUser(async (user) => {
          if (!user) return setPhase({ at: 'signedOut' });
          if (!user.email.endsWith(`@${SCHOOL_DOMAIN}`)) return setPhase({ at: 'denied', email: user.email, why: 'domain' });
          setPhase({ at: 'loading' });
          try {
            const coaches = await c.loadCoaches();
            setPhase(coaches ? { at: 'in', email: user.email, coaches } : { at: 'denied', email: user.email, why: 'list' });
          } catch (e) {
            setPhase({ at: 'error', message: e instanceof Error ? e.message : String(e) });
          }
        });
      })
      .catch((e) => setPhase({ at: 'error', message: e instanceof Error ? e.message : String(e) }));
    return () => {
      cancelled = true;
      off?.();
    };
  }, []);

  if (phase.at === 'in' && cloud) {
    const { email, coaches } = phase;
    return (
      <AccountContext.Provider
        value={{
          email,
          isOwner: email === OWNER_EMAIL,
          coaches,
          saveCoaches: async (emails) => {
            await cloud.saveCoaches(emails);
            setPhase({ at: 'in', email, coaches: emails });
          },
          signOut: cloud.signOut,
        }}
      >
        <DataProvider key={email} storeOverride={cloud.store}>
          {children}
        </DataProvider>
      </AccountContext.Provider>
    );
  }

  const signIn = () => {
    if (!cloud) return;
    setBusy(true);
    cloud
      .signIn()
      .catch((e) => setPhase({ at: 'error', message: e instanceof Error ? e.message : String(e) }))
      .finally(() => setBusy(false));
  };

  return (
    <Door>
      {phase.at === 'loading' && <p className="muted">Opening the trailhead…</p>}
      {phase.at === 'signedOut' && (
        <>
          <p>Sign in with your school Google account to open the squad.</p>
          <button className="btn btn-primary btn-lg door-btn" onClick={signIn} disabled={busy}>
            Sign in with Google
          </button>
          <p className="tiny muted">Only @{SCHOOL_DOMAIN} accounts on the coach list can see the data.</p>
        </>
      )}
      {phase.at === 'denied' && (
        <>
          <p>
            <strong>{phase.email}</strong> {phase.why === 'domain' ? `is not a @${SCHOOL_DOMAIN} account.` : 'is not on the coach list yet.'}
          </p>
          <p className="muted">{phase.why === 'domain' ? 'Sign in again with your school account.' : 'Ask Mr Loke to add you. Nothing about the squad has been shown or downloaded.'}</p>
          <button className="btn door-btn" onClick={() => cloud?.signOut()}>
            Use a different account
          </button>
        </>
      )}
      {phase.at === 'error' && (
        <>
          <p>
            <strong>Could not connect.</strong>
          </p>
          <p className="muted">{phase.message}</p>
          <button className="btn door-btn" onClick={() => location.reload()}>
            Try again
          </button>
        </>
      )}
    </Door>
  );
}
