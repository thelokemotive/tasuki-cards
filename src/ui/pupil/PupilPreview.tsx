// "Preview the pupil app": a coach sees exactly what pupils see, built from the squad's own data the same
// way the website's view-only copy is (makePublicPack), on any device and in the offline file. Nothing is
// published or sent; leaving the preview returns to the coach's app.
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useData, DataProvider } from '../data/DataContext';
import { AccountContext, useAccount, type Account } from '../cloud/account';
import { ViewOnlyStore } from '../../store/memoryStore';
import { makePublicPack, readPublicPack } from '../../cloud/publicPack';

const KEY = 'tasuki.pupilPreview';

interface PreviewApi {
  active: boolean;
  start: () => void;
  stop: () => void;
}

const Ctx = createContext<PreviewApi>({ active: false, start: () => undefined, stop: () => undefined });
export const usePreview = () => useContext(Ctx);

function stored(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function PreviewProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(stored);
  const api = useMemo<PreviewApi>(
    () => ({
      active,
      start: () => {
        try {
          sessionStorage.setItem(KEY, '1');
        } catch {
          /* kept for this tab only */
        }
        setActive(true);
      },
      stop: () => {
        try {
          sessionStorage.removeItem(KEY);
        } catch {
          /* nothing stored */
        }
        setActive(false);
      },
    }),
    [active],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

/** Wraps the app in the pupils' view of the squad when a coach is previewing it. */
export function PupilPreview({ children }: { children: ReactNode }) {
  const { active, stop } = usePreview();
  const outer = useAccount();
  const { ready, snapshot, derived } = useData();
  const pack = useMemo(() => (active && ready ? readPublicPack(makePublicPack(snapshot, derived)) : null), [active, ready, snapshot, derived]);
  const store = useMemo(() => (pack ? new ViewOnlyStore(pack.snapshot) : null), [pack]);
  if (!active || outer?.viewer || !pack || !store) return <>{children}</>;
  const account: Account = {
    email: 'pupil preview',
    isOwner: false,
    viewer: true,
    coaches: [],
    saveCoaches: async () => undefined,
    pupilView: true,
    setPupilView: async () => undefined,
    signOut: async () => stop(),
    preview: true,
  };
  return (
    <AccountContext.Provider value={account}>
      <DataProvider key={derived.asOf + ':' + snapshot.performances.length + ':' + snapshot.athletes.length} storeOverride={store} derivedOverride={pack.derived}>
        {children}
      </DataProvider>
    </AccountContext.Provider>
  );
}
