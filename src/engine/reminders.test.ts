// Phone reminders: who gets one, what it says, and when nothing is sent.
import { describe, expect, it } from 'vitest';
import type { StreakResult, StreakWeekState } from './types';
import { DEFAULT_REMINDER_PREFS, reminderFor, REMINDER_SLOTS, slotForDay, streakBefore, type ReminderInput } from './reminders';

const W = (n: number) => `2026-W${String(n).padStart(2, '0')}`;
function streak(states: [number, StreakWeekState][], best?: number): StreakResult {
  const weeks = states.map(([w, state]) => ({ week: W(w), state, holidayBonus: false }));
  let cur = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    if (weeks[i].state === 'missed') break;
    if (weeks[i].state === 'counted') cur++;
  }
  return { athleteId: 'a', currentStreak: cur, bestStreak: best ?? cur, status: cur ? 'active' : 'none', holidayBonusFlames: 0, weeks };
}

// 2026-11-19 is a Thursday in week 47; 2026-11-21 a Saturday; 2026-11-23 a Monday (week 48).
const base = (over: Partial<ReminderInput> = {}): ReminderInput => ({
  slot: 'thursday',
  today: '2026-11-19',
  streak: streak([[44, 'counted'], [45, 'counted'], [46, 'counted'], [47, 'current']]),
  holidayWeeks: new Set(),
  winterWeeks: new Set(),
  circuitEntered: true,
  pending: 0,
  companion: 'pika',
  ways: 'a Circuit run, a Saturday run or a treadmill run',
  milestones: [4, 8, 12, 20],
  prefs: { thursday: true, saturday: true, monday: true },
  ...over,
});

describe('reminders', () => {
  it('Thursday, week still open: the companion is waiting', () => {
    expect(reminderFor(base())).toEqual({
      title: 'One run keeps your 3-week trail',
      body: 'The pika is waiting at the trailhead. A Circuit run, a Saturday run or a treadmill run by Sunday makes it 4.',
      tag: 'tasuki-thursday',
      url: './#/',
    });
  });

  it('results not typed in yet: no claim that the runner has not run', () => {
    expect(reminderFor(base({ circuitEntered: false }))!.body).toMatch(/counts once your coach adds the results/);
  });

  it('nothing once the week is kept, frozen, a run is waiting, or it is a holiday', () => {
    expect(reminderFor(base({ streak: streak([[46, 'counted'], [47, 'counted']]) }))).toBeNull();
    expect(reminderFor(base({ streak: streak([[46, 'counted'], [47, 'frozen']]) }))).toBeNull();
    expect(reminderFor(base({ pending: 1 }))).toBeNull();
    expect(reminderFor(base({ holidayWeeks: new Set([W(47)]) }))).toBeNull();
  });

  it('nothing in a slot the pupil has not turned on', () => {
    expect(reminderFor(base({ prefs: { ...DEFAULT_REMINDER_PREFS, thursday: false } }))).toBeNull();
    expect(reminderFor(base({ slot: 'saturday', today: '2026-11-21', prefs: DEFAULT_REMINDER_PREFS }))).toBeNull();
  });

  it('a winter week counts sessions, even in the holidays', () => {
    const m = reminderFor(base({ holidayWeeks: new Set([W(47)]), winterWeeks: new Set([W(47)]), winterThisWeek: { sessions: 1, target: 2, kept: false } }));
    expect(m).toMatchObject({ title: 'Winter week: 1 of 2' });
    expect(m!.body).toMatch(/^One more session on another day/);
    expect(reminderFor(base({ winterWeeks: new Set([W(47)]), winterThisWeek: { sessions: 2, target: 2, kept: true } }))).toBeNull();
  });

  it('a lapsed runner hears about the comeback; a new one about starting', () => {
    expect(reminderFor(base({ streak: streak([[40, 'counted'], [41, 'counted'], [42, 'missed'], [47, 'current']], 2) }))!.title).toBe('A fresh trail');
    expect(reminderFor(base({ streak: streak([]) }))!.title).toBe('Start your trail');
  });

  it('Saturday is short', () => {
    expect(reminderFor(base({ slot: 'saturday', today: '2026-11-21' }))).toMatchObject({ title: 'Weekend run?', body: 'One run by Sunday keeps your 3-week trail going.' });
  });

  it('Monday is good news only', () => {
    const kept = streak([[44, 'counted'], [45, 'counted'], [46, 'counted'], [47, 'counted']]);
    expect(reminderFor(base({ slot: 'monday', today: '2026-11-23', streak: kept }))).toMatchObject({ title: 'Week kept: 4 in a row 🔥', body: 'Your trail is 4 weeks long. A new week starts today.' });
    const three = streak([[45, 'counted'], [46, 'counted'], [47, 'counted']]);
    expect(reminderFor(base({ slot: 'monday', today: '2026-11-23', streak: three }))!.body).toBe('Your trail is 3 weeks long. 1 more to the 4-week badge.');
    expect(reminderFor(base({ slot: 'monday', today: '2026-11-23' }))).toBeNull();
  });

  it('an old copy of the squad: weeks it does not cover are not counted, holidays hold', () => {
    const old = streak([[43, 'counted'], [44, 'counted'], [45, 'current']]);
    expect(streakBefore(old, W(47), new Set())).toBe(0);
    expect(streakBefore(old, W(46), new Set([W(45)]))).toBe(2);
    expect(streakBefore(streak([[44, 'counted'], [45, 'holiday'], [46, 'counted']]), W(47), new Set())).toBe(2);
  });

  it('never talks about losing anything', () => {
    const inputs: ReminderInput[] = [base(), base({ circuitEntered: false }), base({ slot: 'saturday', today: '2026-11-21' }), base({ streak: streak([[40, 'counted'], [42, 'missed']], 1) }), base({ streak: streak([]) })];
    for (const i of inputs) expect(JSON.stringify(reminderFor(i))).not.toMatch(/lose|lost|break|broke|miss|fail|let .* down/i);
  });

  it('the schedule: Thursday, Saturday and Monday only', () => {
    expect(['2026-11-19', '2026-11-21', '2026-11-23', '2026-11-20', '2026-11-22'].map(slotForDay)).toEqual(['thursday', 'saturday', 'monday', null, null]);
    expect(REMINDER_SLOTS.map((s) => s.slot)).toEqual(['thursday', 'saturday', 'monday']);
  });
});
