import { describe, expect, it } from 'vitest';
import { buildDemoData } from '../demo/demoData';
import { emptySnapshot } from '../store/Store';
import { DEFAULT_CONFIG } from '../engine/config';
import { deriveAll } from '../engine/derive';
import { isoWeek } from '../engine/dates';
import { makePublicPack, readPublicPack } from './publicPack';
import { planReminders, PUSH_HOSTS, type DeviceDoc } from './reminderPlan';

const TODAY = '2026-11-19'; // Thursday
const snap = { ...emptySnapshot(), ...buildDemoData(TODAY), configs: [DEFAULT_CONFIG] };
const pub = readPublicPack(makePublicPack(snap, deriveAll(snap, TODAY, DEFAULT_CONFIG)));
const all = [...pub.derived.athletes.values()];
const open = all.find((d) => d.streak.weeks.find((w) => w.week === isoWeek(TODAY))?.state === 'current')!;
const kept = all.find((d) => d.streak.weeks.find((w) => w.week === isoWeek(TODAY))?.state === 'counted')!;
const dev = (id: string, athleteId: string, over: Partial<DeviceDoc> = {}): DeviceDoc => ({ id, athleteId, prefs: { thursday: true, saturday: false, monday: true }, endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'k', auth: 'a', ...over });

describe('planning reminders from the public copy', () => {
  it('nudges an open week on Thursday, leaves a kept week alone', () => {
    expect(open && kept).toBeTruthy();
    const plan = planReminders(pub, [dev('1', open.athlete.id), dev('2', kept.athlete.id)], [], TODAY, 'thursday');
    expect(plan.send.map((p) => p.id)).toEqual(['1']);
    expect(plan.send[0].message).toMatchObject({ tag: 'tasuki-thursday', badge: true, url: './#/' });
    expect(plan.quiet).toBe(1);
  });

  it('a run waiting for the coach this week means no nudge', () => {
    const plan = planReminders(pub, [dev('1', open.athlete.id)], [{ athleteId: open.athlete.id, date: '2026-11-17' }], TODAY, 'thursday');
    expect(plan.send).toHaveLength(0);
  });

  it('unknown cards and addresses outside the push services are skipped', () => {
    const plan = planReminders(pub, [dev('1', 'no-such-card'), dev('2', open.athlete.id, { endpoint: 'https://evil.example/x' })], [], TODAY, 'thursday');
    expect(plan).toMatchObject({ send: [], unknownCard: 1, badAddress: 1 });
  });

  it('the companion speaks: the chosen one, or the strongest stat', () => {
    const plan = planReminders(pub, [dev('1', open.athlete.id, { companion: 'pika' })], [], TODAY, 'thursday');
    if (open.streak.currentStreak > 0) expect(plan.send[0].message.body).toMatch(/pika/);
  });

  it('push hosts: Google, Apple, Mozilla, Microsoft only', () => {
    for (const ok of ['https://fcm.googleapis.com/fcm/send/x', 'https://web.push.apple.com/QA', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://wns2-by3p.notify.windows.com/w/?token=x']) expect(PUSH_HOSTS.test(ok)).toBe(true);
    for (const bad of ['http://fcm.googleapis.com/x', 'https://fcm.googleapis.com.evil.com/x', 'https://example.com/x', 'https://web.push.apple.com/']) expect(PUSH_HOSTS.test(bad)).toBe(false);
  });
});
