// Who gets a trail reminder this time, and what it says: from the public copy of the squad (the same one
// pupils see), the phones that asked for reminders, and treadmill runs waiting for the coach. Pure, so it is
// tested here; scripts/reminders/send.ts reads the database, calls this, and sends.
import type { ISODate } from '../types';
import type { PublicData } from './publicPack';
import { isoWeek } from '../engine/dates';
import { counts } from '../engine/perf';
import { isCircuitPerf } from '../engine/streak';
import { winterWeeks } from '../engine/winter';
import { waysToKeep } from '../engine/trail';
import { defaultCompanion, isSpiritId } from '../engine/spirits';
import { reminderFor, type ReminderMessage, type ReminderPrefs, type ReminderSlot } from '../engine/reminders';

export interface DeviceDoc {
  id: string;
  athleteId: string;
  prefs: ReminderPrefs;
  companion?: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PendingLog {
  athleteId: string;
  date: ISODate;
}

export interface Planned {
  id: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** `badge`: also put the red dot on the app icon (something to do), not for good news. */
  message: ReminderMessage & { badge: boolean };
}

/** The push services phones use (Google, Apple, Mozilla, Microsoft). Mirrored in firestore.rules. */
export const PUSH_HOSTS = /^https:\/\/(fcm\.googleapis\.com|web\.push\.apple\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com)\/./;

export function planReminders(pub: PublicData, devices: DeviceDoc[], pending: PendingLog[], today: ISODate, slot: ReminderSlot): { send: Planned[]; quiet: number; unknownCard: number; badAddress: number } {
  const week = isoWeek(today);
  const cal = pub.snapshot.calendar;
  const holidayWeeks = new Set(cal.holidayWeeks);
  const winter = new Set(winterWeeks(cal.winter ?? []));
  const config = pub.derived.config;
  const circuitEntered = pub.snapshot.performances.some((p) => isoWeek(p.date) === week && counts(p) && isCircuitPerf(p, pub.derived.lookup));
  const out = { send: [] as Planned[], quiet: 0, unknownCard: 0, badAddress: 0 };
  for (const dev of devices) {
    const d = pub.derived.athletes.get(dev.athleteId);
    if (!d) {
      out.unknownCard++;
      continue;
    }
    if (!PUSH_HOSTS.test(dev.endpoint)) {
      out.badAddress++;
      continue;
    }
    const tw = d.winter?.thisWeek?.week === week ? d.winter.thisWeek : undefined;
    const message = reminderFor({
      slot,
      today,
      streak: d.streak,
      holidayWeeks,
      winterWeeks: winter,
      winterThisWeek: tw ? { sessions: tw.sessions, target: d.winter!.target, kept: tw.state === 'kept' } : undefined,
      circuitEntered,
      pending: pending.filter((l) => l.athleteId === dev.athleteId && isoWeek(l.date) === week).length,
      companion: isSpiritId(dev.companion) ? dev.companion : defaultCompanion(d.ratings.stats),
      ways: waysToKeep(config),
      milestones: config.streak.milestones,
      prefs: dev.prefs,
    });
    if (!message) {
      out.quiet++;
      continue;
    }
    out.send.push({ id: dev.id, endpoint: dev.endpoint, keys: { p256dh: dev.p256dh, auth: dev.auth }, message: { ...message, badge: slot !== 'monday' } });
  }
  return out;
}
