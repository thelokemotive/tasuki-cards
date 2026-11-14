// The website's front door: sign in with a school Microsoft account, check the coach list, then open
// the app on the shared database.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { connect, type Access, type Cloud } from '../../cloud/firebase';
import { DataProvider, useData } from '../data/DataContext';
import { ViewOnlyStore } from '../../store/memoryStore';
import { makePublicPack, readPublicPack, type PublicData } from '../../cloud/publicPack';
import { YamaScene } from '../art/YamaScene';
import { BrandMark } from '../components/BrandMark';
import { AccountContext, OWNER_EMAIL, SCHOOL_DOMAIN } from './account';
import './cloud.css';

type Phase =
  | { at: 'loading' }
  | { at: 'error'; message: string }
  | { at: 'signedOut' }
  | { at: 'denied'; email: string; why: 'domain' | 'list' }
  | { at: 'in'; email: string; access: Access }
  | { at: 'viewer'; email: string; data: PublicData | null; closed?: boolean };

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
          if (user.email.includes('@') && !user.email.endsWith(`@${SCHOOL_DOMAIN}`)) return setPhase({ at: 'denied', email: user.email, why: 'domain' });
          setPhase({ at: 'loading' });
          try {
            const access = await c.loadAccess();
            if (access) return setPhase({ at: 'in', email: user.email, access });
            const json = await c.loadPublic();
            setPhase({ at: 'viewer', email: user.email, data: json && json !== 'closed' ? readPublicPack(json) : null, closed: json === 'closed' });
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

  if (phase.at === 'viewer' && cloud && phase.data) {
    const { email, data } = phase;
    return (
      <AccountContext.Provider value={{ email, isOwner: false, viewer: true, coaches: [], saveCoaches: async () => undefined, pupilView: true, setPupilView: async () => undefined, signOut: cloud.signOut }}>
        <DataProvider key={email} storeOverride={new ViewOnlyStore(data.snapshot)} derivedOverride={data.derived}>
          {children}
        </DataProvider>
      </AccountContext.Provider>
    );
  }

  if (phase.at === 'in' && cloud) {
    const { email, access } = phase;
    const save = async (next: Access) => {
      await cloud.saveAccess(next);
      setPhase({ at: 'in', email, access: next });
    };
    return (
      <AccountContext.Provider
        value={{
          email,
          isOwner: email === OWNER_EMAIL,
          viewer: false,
          coaches: access.coaches,
          saveCoaches: (emails) => save({ ...access, coaches: emails }),
          pupilView: access.pupilView,
          setPupilView: (on) => save({ ...access, pupilView: on }),
          signOut: cloud.signOut,
        }}
      >
        <DataProvider key={email} storeOverride={cloud.store}>
          <Publisher cloud={cloud} />
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
          <p>Sign in with your school Microsoft account to open the squad.</p>
          <button className="btn btn-primary btn-lg door-btn" onClick={signIn} disabled={busy}>
            Sign in with Microsoft
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
      {phase.at === 'viewer' && (
        <>
          <p>
            Hello <strong>{phase.email.split('@')[0]}</strong>. {phase.closed ? 'The pupil view of Tasuki Cards is not open yet.' : "The squad's cards and boards have not been published yet."}
          </p>
          <p className="muted">{phase.closed ? 'Your coach will let you know when it opens.' : 'They appear here once a coach has opened Tasuki Cards. Try again later.'}</p>
          <button className="btn door-btn" onClick={() => cloud?.signOut()}>
            Sign out
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

/**
 * On a coach's device: keep the view-only copy for the rest of the school up to date. Rebuilt a few
 * seconds after the data changes, published only when it differs from what this device last sent.
 */
function Publisher({ cloud }: { cloud: Cloud }) {
  const { ready, snapshot, derived, asOf, today } = useData();
  const last = useRef<string>('');
  useEffect(() => {
    if (!ready || asOf !== today || snapshot.athletes.length === 0) return;
    const t = setTimeout(() => {
      const json = makePublicPack(snapshot, derived);
      if (json === last.current) return;
      cloud.publishPublic(json).then(
        () => {
          last.current = json;
        },
        () => undefined,
      );
    }, 6000);
    return () => clearTimeout(t);
  }, [ready, snapshot, derived, asOf, today, cloud]);
  return null;
}
