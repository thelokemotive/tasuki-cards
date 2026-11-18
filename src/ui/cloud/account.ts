// Who is signed in on the website (null in the offline single file). Kept free of Firebase imports.
import { createContext, useContext } from 'react';

export const SCHOOL_DOMAIN = 'harrowappi.jp';
/** The school's Microsoft Entra directory (tenant) ID: sign-in goes only to this directory. */
export const SCHOOL_TENANT = '41ec83bc-a7bf-44b7-ad13-22e010566373';
/** The head coach: always allowed in, and the only account that can change the coach list. Mirrored in firestore.rules. */
export const OWNER_EMAIL = 'floke@harrowappi.jp';

/** A treadmill run a pupil has sent for the coach to check (the website's `inbox` collection). */
export interface TreadmillLog {
  id: string;
  /** Who sent it, from the school sign-in (never typed by the pupil). */
  uid: string;
  email?: string;
  name?: string;
  /** The card the pupil chose as theirs. */
  athleteId: string;
  date: string;
  distanceKm: number;
  timeSec: number;
  inclinePct?: number;
  speedKmh?: number;
  effort?: number;
  /** 'photo': read from a photo of the console; 'typed': no usable photo. */
  read: 'photo' | 'typed';
  /** The pupil changed a number the photo gave. */
  edited?: boolean;
  /** Checks to look at (short, too fast for the display, …). */
  flags?: string[];
  /** JPEG of the console display only. Deleted with the log once the coach has decided. */
  photo?: Uint8Array;
  at?: string;
}

export type NewTreadmillLog = Omit<TreadmillLog, 'id' | 'uid' | 'email' | 'name' | 'at'>;

export interface TreadmillCloud {
  /** Whether treadmill logging is open (on unless the head coach switches it off; everyone at school can read it). */
  isOpen(): Promise<boolean>;
  /** Head coach only. */
  setOpen(on: boolean): Promise<void>;
  /** Pupils: send a log to the coach. */
  submit(log: NewTreadmillLog): Promise<void>;
  /** Pupils: their own logs still waiting for the coach. */
  mine(): Promise<TreadmillLog[]>;
  /** Coaches: every waiting log, live. */
  watchInbox(cb: (logs: TreadmillLog[]) => void): () => void;
  /** Coaches (approved or turned down) and pupils (withdrawn). */
  remove(id: string): Promise<void>;
}

export interface Account {
  email: string;
  isOwner: boolean;
  /** Everyone at school who is not a coach: the view-only copy (cards, boards, their own sheet). */
  viewer: boolean;
  coaches: string[];
  saveCoaches: (emails: string[]) => Promise<void>;
  /** Head coach: whether everyone at school can open the view-only copy. */
  pupilView: boolean;
  setPupilView: (on: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  /** Treadmill logs (the website only). */
  treadmill?: TreadmillCloud;
}

export const AccountContext = createContext<Account | null>(null);
export const useAccount = (): Account | null => useContext(AccountContext);

/** Tidy a typed list of school emails; returns the ones that are not school addresses as `rejected`. */
export function parseCoachEmails(text: string): { emails: string[]; rejected: string[] } {
  const all = text.toLowerCase().split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  const ok = (e: string) => /^[^@\s]+@harrowappi\.jp$/.test(e);
  return {
    emails: [...new Set(all.filter(ok))].filter((e) => e !== OWNER_EMAIL).sort(),
    rejected: all.filter((e) => !ok(e)),
  };
}
