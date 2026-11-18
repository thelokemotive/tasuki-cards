// The website's only network code: Microsoft sign-in for school accounts and the shared database.
// Loaded only in the website build (see __WEB__); the offline single file never includes it.
import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, OAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut, type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  writeBatch,
  type Firestore,
  type QuerySnapshot,
  Bytes,
} from 'firebase/firestore';
import type { AppMeta, Calendar, DataSnapshot } from '../types';
import { emptySnapshot, type Store, type TableMap, type TableName } from '../store/Store';
import type { Changes } from '../store/changes';
import { changesToPatches, docsToSnapshot, META_DOC, snapshotToDocs } from './codec';
import { SCHOOL_TENANT, type TreadmillCloud, type TreadmillLog } from '../ui/cloud/account';

const SQUAD = 'squad';
const PUBLIC = 'public';
/** Pupils' treadmill logs waiting for a coach (firestore.rules checks every field). */
const INBOX = 'inbox';
/** Firestore documents hold at most 1 MiB; the compressed copy is split into parts below that. */
const PART_BYTES = 900_000;

async function gzip(s: string): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([s]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
}
async function gunzip(b: Uint8Array): Promise<string> {
  return new Response(new Blob([b as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}

export interface Access {
  coaches: string[];
  /** Everyone at school can open the view-only copy (default on). */
  pupilView: boolean;
}

export interface Cloud {
  onUser(cb: (user: { email: string } | null) => void): () => void;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  /** The coach list, or null when this account is not allowed in. */
  /** The coach list and whether the pupil view is open, or null when this account is not a coach. */
  loadAccess(): Promise<Access | null>;
  saveAccess(access: Access): Promise<void>;
  /** Coaches: publish the view-only copy (JSON from makePublicPack). */
  publishPublic(json: string): Promise<void>;
  /** Everyone at school: the view-only copy, or null if none has been published yet. */
  loadPublic(): Promise<string | null | 'closed'>;
  treadmill: TreadmillCloud;
  store: Store;
}

function toLog(id: string, d: Record<string, unknown>): TreadmillLog {
  const { photo, at, ...rest } = d;
  return {
    ...(rest as Omit<TreadmillLog, 'id' | 'photo' | 'at'>),
    id,
    ...(photo instanceof Bytes ? { photo: photo.toUint8Array() } : {}),
    ...(at instanceof Timestamp ? { at: at.toDate().toISOString() } : {}),
  };
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
  // School accounts are Microsoft 365 accounts. `tenant` sends people straight to the school's sign-in page.
  const provider = new OAuthProvider('microsoft.com');
  provider.setCustomParameters({ tenant: SCHOOL_TENANT, prompt: 'select_account' });
  const access = doc(db, 'access', 'main');
  return {
    onUser: (cb) => onAuthStateChanged(auth, (u: User | null) => {
        if (!u) return cb(null);
        // Some school accounts (often pupils') carry no email on the sign-in itself, only on the Microsoft profile.
        const email = u.email ?? u.providerData.find((p) => p.email)?.email ?? '';
        cb({ email: email.toLowerCase() || u.displayName || 'school account' });
      }),
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
    async loadAccess() {
      try {
        const d = (await getDoc(access)).data();
        return { coaches: ((d?.coaches as string[] | undefined) ?? []).slice().sort(), pupilView: d?.pupilView !== false };
      } catch (e) {
        if ((e as { code?: string }).code === 'permission-denied') return null;
        throw e;
      }
    },
    saveAccess: (a) => setDoc(access, { coaches: a.coaches, pupilView: a.pupilView }),
    async publishPublic(json) {
      const data = await gzip(json);
      const parts = Math.max(1, Math.ceil(data.length / PART_BYTES));
      const batch = writeBatch(db);
      for (let i = 0; i < parts; i++) batch.set(doc(db, PUBLIC, `pack-${i}`), { data: Bytes.fromUint8Array(data.subarray(i * PART_BYTES, (i + 1) * PART_BYTES)) });
      batch.set(doc(db, PUBLIC, 'pack'), { parts, bytes: data.length, at: new Date().toISOString() });
      await batch.commit();
    },
    async loadPublic() {
      let head;
      try {
        head = await getDoc(doc(db, PUBLIC, 'pack'));
      } catch (e) {
        if ((e as { code?: string }).code === 'permission-denied') return 'closed';
        throw e;
      }
      const parts = head.data()?.parts as number | undefined;
      if (!parts) return null;
      const chunks = await Promise.all(Array.from({ length: parts }, (_, i) => getDoc(doc(db, PUBLIC, `pack-${i}`))));
      const bytes = chunks.map((c) => (c.data()?.data as Bytes).toUint8Array());
      const all = new Uint8Array(bytes.reduce((n, b) => n + b.length, 0));
      let at = 0;
      for (const b of bytes) {
        all.set(b, at);
        at += b.length;
      }
      return gunzip(all);
    },
    treadmill: {
      async isOpen() {
        try {
          return (await getDoc(doc(db, PUBLIC, 'settings'))).data()?.treadmillLogs !== false;
        } catch {
          return false;
        }
      },
      setOpen: (on) => setDoc(doc(db, PUBLIC, 'settings'), { treadmillLogs: on }, { merge: true }),
      async submit(log) {
        const u = auth.currentUser;
        if (!u) throw new Error('not signed in');
        // Who sent it comes from the sign-in itself; the rules accept only these exact values.
        const claims = (await u.getIdTokenResult()).claims;
        const id = `${u.uid}_${Date.now()}`;
        const data: Record<string, unknown> = { ...log, uid: u.uid, at: serverTimestamp() };
        if (typeof claims.email === 'string') data.email = claims.email;
        if (typeof claims.name === 'string') data.name = claims.name;
        if (log.photo) data.photo = Bytes.fromUint8Array(log.photo);
        for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
        await setDoc(doc(db, INBOX, id), data);
      },
      async mine() {
        const u = auth.currentUser;
        if (!u) return [];
        const snap = await getDocs(query(collection(db, INBOX), where('uid', '==', u.uid)));
        return snap.docs.map((d) => toLog(d.id, d.data()));
      },
      watchInbox(cb) {
        return onSnapshot(collection(db, INBOX), (snap) => cb(snap.docs.map((d) => toLog(d.id, d.data()))), () => cb([]));
      },
      remove: (id) => deleteDoc(doc(db, INBOX, id)),
    },
    store: new FirestoreStore(db),
  };
}
