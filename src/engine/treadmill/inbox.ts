// The coach's side of a pupil's treadmill log: what to look at before approving, and what approving saves.
import type { Athlete, DataSnapshot, Performance } from '../../types';
import type { Changes } from '../../store/changes';
import type { Config } from '../config';
import { makePerformance } from '../corrections';
import { displayName, fullName } from '../display';
import { checkTreadmillRun, treadmillClimbM, treadmillRawInput } from './session';

/** The fields of a log the coach's side needs (the website's TreadmillLog has these and more). */
export interface LogForReview {
  id: string;
  uid: string;
  email?: string;
  name?: string;
  athleteId: string;
  date: string;
  distanceKm: number;
  timeSec: number;
  inclinePct?: number;
  speedKmh?: number;
  effort?: number;
  read: 'photo' | 'typed';
  edited?: boolean;
  flags?: string[];
}

/** How a sign-in is remembered on the athlete: the school email, else the sign-in's id. */
export function accountKey(log: Pick<LogForReview, 'email' | 'uid'>): string {
  return log.email ? log.email.toLowerCase() : `uid:${log.uid}`;
}

export function sender(log: Pick<LogForReview, 'email' | 'uid' | 'name'>): string {
  return log.name && log.email ? `${log.name} (${log.email})` : log.name || log.email || 'a school account';
}

export interface LogReview {
  athlete?: Athlete;
  /** Worth a second look before approving. */
  warnings: string[];
  duplicateOf?: Performance;
}

export function reviewLog(log: LogForReview, snapshot: DataSnapshot, today: string, config: Config): LogReview {
  const warnings: string[] = [];
  const athlete = snapshot.athletes.find((a) => a.id === log.athleteId);
  if (!athlete) return { warnings: ['This card is no longer on the roster.'] };
  const key = accountKey(log);
  const other = snapshot.athletes.find((a) => a.id !== athlete.id && a.schoolAccounts?.includes(key));
  if (other) warnings.push(`This sign-in has sent logs for ${fullName(other)} before.`);
  if (athlete.schoolAccounts?.length && !athlete.schoolAccounts.includes(key)) warnings.push(`${fullName(athlete)}'s logs have come from a different sign-in before.`);
  if (log.read === 'typed') warnings.push('Typed in: no photo of the console.');
  else if (log.edited) warnings.push('The pupil changed a number the photo gave: check it against the photo.');
  const check = checkTreadmillRun(log, log.date, today, { ...config, treadmill: { ...config.treadmill, maxDaysOld: 3650 } });
  warnings.push(...check.errors, ...check.flags.filter((f) => !(log.flags ?? []).includes(f)), ...(log.flags ?? []));
  const duplicateOf = snapshot.performances.find((p) => !p.deleted && p.athleteId === athlete.id && p.kind === 'treadmill' && p.date === log.date && p.timeSec != null && Math.abs(p.timeSec - log.timeSec) < 2 && Math.abs((p.distanceKm ?? 0) - log.distanceKm) < 0.0015);
  if (duplicateOf) warnings.push('Already saved: the same run on the same day.');
  return { athlete, warnings, duplicateOf };
}

/**
 * Approving saves a verified treadmill session (the coach has seen the photo) and remembers the sign-in on
 * the athlete, so a later log from another account for this card is flagged.
 */
export function approveLog(log: LogForReview, athlete: Athlete, now: string, perfId: string): Changes {
  const perf = makePerformance(
    {
      athleteId: athlete.id,
      date: log.date,
      kind: 'treadmill',
      distanceKm: log.distanceKm,
      timeSec: log.timeSec,
      climbM: treadmillClimbM(log.distanceKm, log.inclinePct),
      inclinePct: log.inclinePct,
      effort: log.effort,
      verified: true,
      source: 'form',
      rawInput: treadmillRawInput(log, `${log.read === 'photo' ? `read from a photo${log.edited ? ' and corrected' : ''}` : 'typed'} by ${sender(log)} for ${displayName(athlete)}`),
    },
    perfId,
    now,
  );
  const key = accountKey(log);
  const changes: Changes = { put: { performances: [perf] } };
  if (!athlete.schoolAccounts?.includes(key)) changes.put!.athletes = [{ ...athlete, schoolAccounts: [...(athlete.schoolAccounts ?? []), key] }];
  return changes;
}
