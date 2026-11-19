// Phone reminders (opt-in, website only): what each one says, decided from the public copy of the squad. Used
// by the sender (scripts/reminders/send.ts, a scheduled GitHub Action) and tested here.
//
// The rules follow the ICO Children's Code standards the school uses as its yardstick: off unless the pupil
// turns them on, at most two a week, in the daytime, encouraging and never shaming. A reminder never says a
// pupil "will lose" anything, never names anyone else, and is not sent at all once the week is kept, while a
// run is waiting for the coach, or in a holiday week (unless it is a Winter Mode week, which the pupil chose).
import type { ISODate, ISOWeek } from '../types';
import type { StreakResult } from './types';
import { addWeeks, isoWeek } from './dates';
import type { SpiritId } from './spirits';

export type ReminderSlot = 'thursday' | 'saturday' | 'monday';

export interface ReminderPrefs {
  thursday: boolean;
  saturday: boolean;
  monday: boolean;
}

export const DEFAULT_REMINDER_PREFS: ReminderPrefs = { thursday: true, saturday: false, monday: true };

/** When each one goes (Japan time) and what it is for: shown to the pupil before they turn any on. */
export const REMINDER_SLOTS: { slot: ReminderSlot; label: string; when: string; what: string }[] = [
  { slot: 'thursday', label: 'Thursday nudge', when: 'Thursday 17:00', what: 'Only if this week is not kept yet: one session by Sunday keeps your trail going.' },
  { slot: 'saturday', label: 'Weekend nudge', when: 'Saturday 08:30', what: 'Only if this week is still open: a weekend run keeps it.' },
  { slot: 'monday', label: 'Monday trail news', when: 'Monday 07:30', what: 'Only good news: when last week was kept, how long your trail is now.' },
];

export interface ReminderMessage {
  title: string;
  body: string;
  /** Same tag replaces an older notification instead of stacking. */
  tag: string;
  /** Opens here when tapped. */
  url: string;
}

export interface ReminderInput {
  slot: ReminderSlot;
  /** Today in Japan. */
  today: ISODate;
  /** The runner's streak from the public copy (it may have been worked out a few days ago). */
  streak: StreakResult;
  holidayWeeks: ReadonlySet<ISOWeek>;
  winterWeeks: ReadonlySet<ISOWeek>;
  /** Winter Mode this week, when the public copy is from this week. */
  winterThisWeek?: { sessions: number; target: number; kept: boolean };
  /** Someone's Circuit result for this week is already in (so a missing one is not just late typing). */
  circuitEntered: boolean;
  /** This runner's treadmill logs for this week waiting for the coach. */
  pending: number;
  companion: SpiritId;
  /** What keeps a week, in words ('a Circuit run, a Saturday run or a treadmill run'). */
  ways: string;
  milestones: number[];
  prefs: ReminderPrefs;
}

const SHORT: Record<SpiritId, string> = { falcon: 'falcon', eagle: 'sea eagle', serow: 'serow', pika: 'pika', owl: 'fish owl', panda: 'red panda', monkey: 'snow monkey', dugong: 'dugong', rabbit: 'Amami rabbit' };

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/**
 * Kept weeks in a row up to the week before `week`, from a streak that may be a few days old: a week the
 * copy does not cover counts as not kept, unless it is a holiday week; holiday and frozen weeks hold the run.
 */
export function streakBefore(streak: StreakResult, week: ISOWeek, holidays: ReadonlySet<ISOWeek>): number {
  const byWeek = new Map(streak.weeks.map((w) => [w.week, w.state]));
  const first = streak.weeks[0]?.week;
  let n = 0;
  for (let w = addWeeks(week, -1), i = 0; first && w >= first && i < 520; w = addWeeks(w, -1), i++) {
    // A week the copy left in progress ('current') or does not cover is not known to be kept.
    let s = byWeek.get(w);
    if (s == null || s === 'current') s = holidays.has(w) ? 'holiday' : 'missed';
    if (s === 'counted') n++;
    else if (s === 'holiday' || s === 'frozen') continue;
    else break;
  }
  return n;
}

/** The reminder for one runner in one slot, or null when there is nothing worth saying. */
export function reminderFor(x: ReminderInput): ReminderMessage | null {
  if (!x.prefs[x.slot]) return null;
  const week = isoWeek(x.today);
  const tag = `tasuki-${x.slot}`;
  const url = './#/';
  const state = x.streak.weeks.find((w) => w.week === week)?.state;

  if (x.slot === 'monday') {
    const last = addWeeks(week, -1);
    if (x.streak.weeks.find((w) => w.week === last)?.state !== 'counted') return null;
    const n = streakBefore(x.streak, week, x.holidayWeeks);
    const m = [...x.milestones].sort((a, b) => a - b).find((v) => v > n);
    return {
      title: n > 1 ? `Week kept: ${n} in a row 🔥` : 'Week kept 🔥',
      body: m && m - n <= 2 ? `Your trail is ${n} ${n === 1 ? 'week' : 'weeks'} long. ${m - n} more to the ${m}-week badge.` : `Your trail is ${n} ${n === 1 ? 'week' : 'weeks'} long. A new week starts today.`,
      tag,
      url,
    };
  }

  // Thursday and Saturday: only while this week is still open.
  if (state === 'counted' || state === 'frozen' || x.pending > 0) return null;
  const winter = x.winterWeeks.has(week);
  if (!winter && (state === 'holiday' || x.holidayWeeks.has(week))) return null;
  const n = streakBefore(x.streak, week, x.holidayWeeks);
  const c = SHORT[x.companion];

  if (winter) {
    const w = x.winterThisWeek;
    if (w?.kept) return null;
    const left = w ? Math.max(1, w.target - w.sessions) : undefined;
    return {
      title: w ? `Winter week: ${Math.min(w.sessions, w.target)} of ${w.target}` : 'Winter week',
      body: left
        ? `${left === 1 ? 'One more session' : `${left} more sessions`} on ${left === 1 ? 'another day' : 'different days'} keeps your winter week. A run of 15+ minutes, or armour.`
        : 'Two sessions on different days, one of them a run, keeps your winter week.',
      tag,
      url,
    };
  }

  if (x.slot === 'saturday') {
    return { title: 'Weekend run?', body: n > 0 ? `One run by Sunday keeps your ${n}-week trail going.` : 'One run this weekend starts your trail.', tag, url };
  }

  if (n === 0) {
    const comeback = x.streak.bestStreak > 0;
    return comeback
      ? { title: 'A fresh trail', body: 'The Amami rabbit came back, and so can you: one run this week starts a new trail.', tag, url }
      : { title: 'Start your trail', body: `One run this week starts your first trail week: ${x.ways}.`, tag, url };
  }
  return x.circuitEntered
    ? { title: `One run keeps your ${n}-week trail`, body: `The ${c} is waiting at the trailhead. ${cap(x.ways)} by Sunday makes it ${n + 1}.`, tag, url }
    : { title: `Your ${n}-week trail`, body: `${cap(x.ways)} by Sunday makes it ${n + 1}. Ran the Circuit already? It counts once your coach adds the results.`, tag, url };
}

/** The slot due at a moment, from the schedule in REMINDER_SLOTS (Japan time), or null. */
export function slotForDay(today: ISODate): ReminderSlot | null {
  const [y, m, d] = today.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 4 ? 'thursday' : dow === 6 ? 'saturday' : dow === 1 ? 'monday' : null;
}
