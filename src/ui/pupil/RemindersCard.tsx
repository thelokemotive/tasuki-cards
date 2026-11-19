// Trail reminders on the pupil's phone: off until they turn them on, explained before anything is asked,
// two a week at most, and only when there is something useful to say (see src/engine/reminders.ts). The
// browser asks permission only after a tap on "Turn on". On an iPhone this works only from the Home Screen
// app (Apple's rule), so the card says so instead.
import { useEffect, useState } from 'react';
import { useAccount, type ReminderDevice } from '../cloud/account';
import { DEFAULT_REMINDER_PREFS, REMINDER_SLOTS, type ReminderPrefs } from '../../engine/reminders';
import { useToast } from '../components/Toast';
import { readLocal, writeLocal, useCompanion } from './local';
import { isStandalone, platform } from './pwa';
import { chime } from './juice';
import { defaultCompanion } from '../../engine/spirits';
import { useData } from '../data/DataContext';

const DEVICE_KEY = 'tasuki.deviceId';

/** A random id for this phone (not linked to the pupil anywhere but the reminder itself). */
function deviceId(): string {
  let id = readLocal(DEVICE_KEY);
  if (!id || !/^[a-z0-9]{12,32}$/.test(id)) {
    const b = new Uint8Array(10);
    crypto.getRandomValues(b);
    id = [...b].map((x) => (x % 36).toString(36)).join('') + Date.now().toString(36).slice(-4);
    writeLocal(DEVICE_KEY, id);
  }
  return id;
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function RemindersCard({ athleteId }: { athleteId: string }) {
  const account = useAccount();
  const toast = useToast();
  const { derived } = useData();
  const cloud = account?.reminders;
  const [settings, setSettings] = useState<{ open: boolean; key?: string } | null>(null);
  const [device, setDevice] = useState<ReminderDevice | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [chosen] = useCompanion(athleteId);
  const d = derived.athletes.get(athleteId);
  const companion = chosen ?? (d ? defaultCompanion(d.ratings.stats) : 'serow');

  useEffect(() => {
    if (!cloud) return;
    cloud.settings().then(setSettings, () => setSettings({ open: false }));
    cloud.mine(deviceId()).then(setDevice, () => setDevice(null));
  }, [cloud]);

  // Keep the reminder pointing at the right card and companion when the pupil changes either.
  useEffect(() => {
    if (!cloud || !device || (device.athleteId === athleteId && device.companion === companion)) return;
    const next = { ...device, athleteId, companion };
    navigator.serviceWorker?.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => (sub ? cloud.save(deviceId(), next, sub.toJSON()).then(() => setDevice(next)) : undefined))
      .catch(() => undefined);
  }, [cloud, device, athleteId, companion]);

  if (!cloud || !settings?.open || !settings.key || device === undefined) return null;

  const ios = platform() === 'ios';
  if (!pushSupported() || (ios && !isStandalone())) {
    return (
      <section className="trail-panel">
        <h2 className="trail-h">Trail reminders</h2>
        <p className="small" style={{ margin: 0 }}>
          {ios ? 'On an iPhone, reminders work from the Home Screen app only. Add Tasuki to your Home Screen (above), open it from there, and turn them on.' : 'This browser cannot show reminders. Try Chrome or Safari on your phone.'}
        </p>
      </section>
    );
  }

  const turnOn = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        toast('Reminders need permission. You can allow notifications in your phone settings later.', 'err');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(settings.key!) }));
      const next: ReminderDevice = { athleteId, prefs: { ...DEFAULT_REMINDER_PREFS }, companion };
      await cloud.save(deviceId(), next, sub.toJSON());
      setDevice(next);
      chime('moment');
      toast('Reminders on. Change them here any time.', 'ok');
    } catch (e) {
      toast(`Could not turn reminders on: ${e instanceof Error ? e.message : String(e)}`, 'err');
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      await (await reg.pushManager.getSubscription())?.unsubscribe();
      await cloud.remove(deviceId());
      setDevice(null);
      toast('Reminders off', 'ok');
    } catch (e) {
      toast(`Could not turn reminders off: ${e instanceof Error ? e.message : String(e)}`, 'err');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (slot: keyof ReminderPrefs, on: boolean) => {
    if (!device) return;
    const next = { ...device, prefs: { ...device.prefs, [slot]: on } };
    setDevice(next);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await cloud.save(deviceId(), next, sub.toJSON());
    } catch {
      toast('Could not save that change', 'err');
    }
  };

  return (
    <section className="trail-panel">
      <h2 className="trail-h">Trail reminders</h2>
      {device ? (
        <>
          <ul className="remind-list">
            {REMINDER_SLOTS.map((s) => (
              <li key={s.slot}>
                <label className="remind-row">
                  <input type="checkbox" checked={device.prefs[s.slot]} onChange={(e) => toggle(s.slot, e.target.checked)} />
                  <span>
                    <strong>{s.label}</strong> <span className="muted small">{s.when}</span>
                    <br />
                    <span className="small muted">{s.what}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <button className="btn btn-sm" onClick={turnOff} disabled={busy}>
            Turn reminders off
          </button>
        </>
      ) : (
        <>
          <p className="small" style={{ marginTop: 0 }}>
            A nudge from your companion when it helps, never more than two a week, never at night, and never once your week is kept. Turn it off any time.
          </p>
          <ul className="small remind-preview">
            {REMINDER_SLOTS.filter((s) => DEFAULT_REMINDER_PREFS[s.slot]).map((s) => (
              <li key={s.slot}>
                <strong>{s.when}</strong>: {s.what}
              </li>
            ))}
          </ul>
          <button className="btn-press btn-press-ai" onClick={turnOn} disabled={busy}>
            Turn on reminders
          </button>
          <p className="tiny muted" style={{ marginBottom: 0 }}>
            Your phone asks you to allow notifications. What is saved: which card is yours, which reminders you chose, and an address for this phone that only Tasuki's reminders can use.
          </p>
        </>
      )}
    </section>
  );
}
