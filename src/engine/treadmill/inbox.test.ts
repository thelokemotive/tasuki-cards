import { describe, expect, it } from 'vitest';
import type { Athlete, DataSnapshot } from '../../types';
import { emptySnapshot } from '../../store/Store';
import { DEFAULT_CONFIG } from '../config';
import { accountKey, approveLog, reviewLog, type LogForReview } from './inbox';

const athlete = (id: string, given: string, extra: Partial<Athlete> = {}): Athlete => ({ id, givenName: given, familyName: 'Testfield', preferredName: given, aliases: [], sex: 'F', yearGroup: 'Y9', displayMode: 'first_initial', absoluteBoardOptOut: false, avatar: { seed: 1, skinTone: 0, hairStyle: 0, hairColour: 0, kitColour: 'academy-navy', accessory: 'none' }, active: true, ...extra });
const log = (extra: Partial<LogForReview> = {}): LogForReview => ({ id: 'u1_1', uid: 'u1', email: 'Aiko.T@harrowappi.jp', name: 'Aiko Testfield', athleteId: 'a1', date: '2026-11-18', distanceKm: 5, timeSec: 1530, inclinePct: 1, speedKmh: 12, effort: 6, read: 'photo', ...extra });
const snap = (athletes: Athlete[], extra: Partial<DataSnapshot> = {}): DataSnapshot => ({ ...emptySnapshot(), athletes, ...extra });
const today = '2026-11-18';

describe('reviewing a pupil’s treadmill log', () => {
  it('a clean log from a photo has nothing to check', () => {
    expect(reviewLog(log(), snap([athlete('a1', 'Aiko')]), today, DEFAULT_CONFIG).warnings).toEqual([]);
  });
  it('flags a sign-in that has sent logs for someone else, and a card used by another sign-in', () => {
    const s = snap([athlete('a1', 'Aiko', { schoolAccounts: ['ken.s@harrowappi.jp'] }), athlete('a2', 'Mio', { schoolAccounts: ['aiko.t@harrowappi.jp'] })]);
    const w = reviewLog(log(), s, today, DEFAULT_CONFIG).warnings;
    expect(w).toContain('This sign-in has sent logs for Mio Testfield before.');
    expect(w).toContain("Aiko Testfield's logs have come from a different sign-in before.");
  });
  it('flags typed and corrected numbers, the pupil’s own checks, and duplicates', () => {
    const s = snap([athlete('a1', 'Aiko')], { performances: [{ id: 'p1', athleteId: 'a1', date: today, kind: 'treadmill', distanceKm: 5, timeSec: 1530, verified: true, source: 'form', rawInput: '', history: [] }] });
    expect(reviewLog(log({ read: 'typed' }), snap([athlete('a1', 'Aiko')]), today, DEFAULT_CONFIG).warnings).toEqual(['Typed in: no photo of the console.']);
    expect(reviewLog(log({ edited: true, flags: ['short: under 1 km'] }), snap([athlete('a1', 'Aiko')]), today, DEFAULT_CONFIG).warnings).toEqual(['The pupil changed a number the photo gave: check it against the photo.', 'short: under 1 km']);
    expect(reviewLog(log(), s, today, DEFAULT_CONFIG).duplicateOf?.id).toBe('p1');
    expect(reviewLog(log({ athleteId: 'gone' }), s, today, DEFAULT_CONFIG).athlete).toBeUndefined();
  });
  it('approving saves a verified treadmill session and remembers the sign-in', () => {
    const a = athlete('a1', 'Aiko');
    const ch = approveLog(log(), a, '2026-11-18T10:00:00.000Z', 'p9');
    const p = ch.put!.performances![0];
    expect(p).toMatchObject({ id: 'p9', athleteId: 'a1', kind: 'treadmill', distanceKm: 5, timeSec: 1530, climbM: 50, inclinePct: 1, effort: 6, verified: true, source: 'form' });
    expect(p.rawInput).toBe('Treadmill 5.000 km in 25:30 at 1.0% (12.0 km/h at the end) effort 6/10; read from a photo by Aiko Testfield (Aiko.T@harrowappi.jp) for Aiko T.');
    expect(ch.put!.athletes![0].schoolAccounts).toEqual(['aiko.t@harrowappi.jp']);
    expect(approveLog(log(), { ...a, schoolAccounts: ['aiko.t@harrowappi.jp'] }, 'x', 'p10').put!.athletes).toBeUndefined();
    expect(accountKey({ uid: 'u7' })).toBe('uid:u7');
  });
});
