// The website's only network code: Google sign-in for school accounts and the shared database.
// Loaded only in the website build (see __WEB__); the offline single file never includes it.
import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut, type User } from 'firebase/auth';
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  setDoc,
  writeBatch,
  type Firestore,
  type QuerySnapshot,
} from 'firebase/firestore';
import type { AppMeta, Calendar, DataSnapshot } from '../types';
import { emptySnapshot, type Store, type TableMap, type TableName } from '../store/Store';
import type { Changes } from '../store/changes';
import { changesToPatches, docsToSnapshot, META_DOC, snapshotToDocs } from './codec';
import { SCHOOL_DOMAIN } from '../ui/cloud/account';

const SQUAD = 'squad';

export interface Cloud {
  onUser(cb: (user: { email: string } | null) => void): () => void;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  /** The coach list, or null when this account is not allowed in. */
  loadCoaches(): Promise<string[] | null>;
  saveCoaches(emails: string[]): Promise<void>;
  store: Store;
}

async function loadConfig(): Promise<FirebaseOptions> {
  // Firebase Hosting serves the project's own web configuration here, so none is kept in the code.
  const env = import.meta.env.VITE_FIREBASE_CONFIG as string | undefined;
  if (env) return JSON.parse(env) as FirebaseOptions;
  const res = await fetch('/__/firebase/init.json');
  if (!res.ok) throw new Error('This page is not being served by Firebase Hosting yet.');
  return (await res.json()) as FirebaseOptions;
}

class FirestoreStore implements Store {
  readonly kind = 'cloud';
  constructor(private db: Firestore) {}

  private read(snap: QuerySnapshot): DataSnapshot {
    return docsToSnapshot(new Map(snap.docs.map((d) => [d.id, d.data()])));
  }
  async loadAll(): Promise<DataSnapshot> {
    return this.read(await getDocs(collection(this.db, SQUAD)));
  }
  subscribe(onChange: (s: DataSnapshot) => void): () => void {
    return onSnapshot(collection(this.db, SQUAD), (snap) => onChange(this.read(snap)), () => undefined);
  }
  async persist(ch: Changes): Promise<void> {
    const { rows, meta } = changesToPatches(ch);
    const batch = writeBatch(this.db);
    for (const [id, patch] of rows) {
      const fields = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === null ? deleteField() : v]));
      batch.set(doc(this.db, SQUAD, id), { rows: fields }, { merge: true });
    }
    if (meta) batch.set(doc(this.db, SQUAD, META_DOC), meta, { merge: true });
    await batch.commit();
  }
  put<K extends TableName>(table: K, rows: TableMap[K][]): Promise<void> {
    return this.persist({ put: { [table]: rows } } as Changes);
  }
  remove<K extends TableName>(table: K, keys: (string | number)[]): Promise<void> {
    return this.persist({ remove: { [table]: keys } } as Changes);
  }
  saveCalendar(calendar: Calendar): Promise<void> {
    return this.persist({ calendar });
  }
  saveMeta(meta: AppMeta): Promise<void> {
    return this.persist({ meta });
  }
  async replaceAll(s: DataSnapshot): Promise<void> {
    const { rows, meta } = snapshotToDocs(s);
    const batch = writeBatch(this.db);
    for (const [id, r] of rows) batch.set(doc(this.db, SQUAD, id), { rows: r });
    batch.set(doc(this.db, SQUAD, META_DOC), meta);
    await batch.commit();
  }
  clearAll(): Promise<void> {
    return this.replaceAll(emptySnapshot());
  }
}

export async function connect(): Promise<Cloud> {
  const app = initializeApp(await loadConfig());
  const auth = getAuth(app);
  // The local cache keeps the app usable with no signal on the hill; changes sync when back online.
  const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ hd: SCHOOL_DOMAIN, prompt: 'select_account' });
  const access = doc(db, 'access', 'main');
  return {
    onUser: (cb) => onAuthStateChanged(auth, (u: User | null) => cb(u?.email ? { email: u.email.toLowerCase() } : null)),
    async signIn() {
      try {
        await signInWithPopup(auth, provider);
      } catch (e) {
        const code = (e as { code?: string }).code ?? '';
        if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') await signInWithRedirect(auth, provider);
        else if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') throw e;
      }
    },
    signOut: () => signOut(auth),
    async loadCoaches() {
      try {
        const snap = await getDoc(access);
        return ((snap.data()?.coaches as string[] | undefined) ?? []).slice().sort();
      } catch (e) {
        if ((e as { code?: string }).code === 'permission-denied') return null;
        throw e;
      }
    },
    saveCoaches: (emails) => setDoc(access, { coaches: emails }),
    store: new FirestoreStore(db),
  };
}
