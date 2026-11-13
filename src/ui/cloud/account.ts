// Who is signed in on the website (null in the offline single file). Kept free of Firebase imports.
import { createContext, useContext } from 'react';

export const SCHOOL_DOMAIN = 'harrowappi.jp';
/** The head coach: always allowed in, and the only account that can change the coach list. Mirrored in firestore.rules. */
export const OWNER_EMAIL = 'floke@harrowappi.jp';

export interface Account {
  email: string;
  isOwner: boolean;
  coaches: string[];
  saveCoaches: (emails: string[]) => Promise<void>;
  signOut: () => Promise<void>;
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
