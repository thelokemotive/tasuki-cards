// Sends trail reminders to pupils' phones (web push). Run on a schedule by .github/workflows/reminders.yml:
// Thursday 17:00, Saturday 08:30 and Monday 07:30, Japan time. What each says is decided by
// src/cloud/reminderPlan.ts and src/engine/reminders.ts (tested with the app).
//
// Needs (GitHub secrets): FIREBASE_SERVICE_ACCOUNT_TASUKI_CARDS (a service account that can read Firestore and
// delete reminder documents) and VAPID_PRIVATE_KEY (made in the app by the head coach). Sends nothing unless
// the head coach has switched reminders on and the pupil view is open.
//
// Options (environment): SLOT=thursday|saturday|monday to force a slot; DRY_RUN=1 to plan without sending;
// FROM_FILE=path.json to plan from a saved copy ({ pack, devices, pending, settings }) instead of Firestore.
// Logs counts only, never names.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import webpush from 'web-push';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { readPublicPack } from '../../src/cloud/publicPack';
import { planReminders, type DeviceDoc, type PendingLog } from '../../src/cloud/reminderPlan';
import { slotForDay, type ReminderSlot } from '../../src/engine/reminders';
import { todayTokyo } from '../../src/engine/dates';

interface Inputs {
  pack: string;
  devices: DeviceDoc[];
  pending: PendingLog[];
  settings: { reminders?: boolean; vapidKey?: string; pupilView?: boolean };
}

async function fromFirestore(db: Firestore): Promise<Inputs> {
  const settings = (await db.doc('public/settings').get()).data() ?? {};
  const access = (await db.doc('access/main').get()).data();
  const head = (await db.doc('public/pack').get()).data();
  const parts = Number(head?.parts ?? 0);
  if (!parts) throw new Error('No public copy of the squad has been published yet.');
  const chunks = await Promise.all(Array.from({ length: parts }, (_, i) => db.doc(`public/pack-${i}`).get()));
  const pack = gunzipSync(Buffer.concat(chunks.map((c) => Buffer.from(c.data()!.data as Uint8Array)))).toString('utf8');
  const devices = (await db.collection('reminders').get()).docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DeviceDoc, 'id'>) }));
  const pending = (await db.collection('inbox').select('athleteId', 'date').get()).docs.map((d) => d.data() as PendingLog);
  return { pack, devices, pending, settings: { reminders: settings.reminders === true, vapidKey: settings.vapidKey, pupilView: access?.pupilView !== false } };
}

const today = todayTokyo();
const slot = (process.env.SLOT as ReminderSlot | undefined) || slotForDay(today);
if (!slot || !['thursday', 'saturday', 'monday'].includes(slot)) {
  console.log(`No reminders on ${today}.`);
  process.exit(0);
}
const dry = process.env.DRY_RUN === '1';

let db: Firestore | undefined;
let inputs: Inputs;
if (process.env.FROM_FILE) {
  inputs = JSON.parse(readFileSync(process.env.FROM_FILE, 'utf8')) as Inputs;
} else {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) {
    console.log('No service account secret yet: nothing sent.');
    process.exit(0);
  }
  initializeApp({ credential: cert(JSON.parse(sa)) });
  db = getFirestore();
  inputs = await fromFirestore(db);
}

if (!inputs.settings.reminders || !inputs.settings.pupilView) {
  console.log('Reminders are switched off (or the pupil view is closed): nothing sent.');
  process.exit(0);
}
const plan = planReminders(readPublicPack(inputs.pack), inputs.devices, inputs.pending, today, slot);
console.log(`${today} ${slot}: ${inputs.devices.length} phones, ${plan.send.length} to send, ${plan.quiet} with nothing to say, ${plan.unknownCard} for cards no longer listed, ${plan.badAddress} with an unknown push service.`);
if (dry || !plan.send.length) process.exit(0);

const privateKey = process.env.VAPID_PRIVATE_KEY;
const publicKey = inputs.settings.vapidKey;
if (!privateKey || !publicKey) {
  console.log('The reminder keys are not set up (VAPID_PRIVATE_KEY secret and the key in the app): nothing sent.');
  process.exit(0);
}
webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'https://tasuki-cards.web.app', publicKey, privateKey);

let sent = 0;
let gone = 0;
let failed = 0;
for (const p of plan.send) {
  try {
    await webpush.sendNotification({ endpoint: p.endpoint, keys: p.keys }, JSON.stringify(p.message), { TTL: 6 * 3600, urgency: 'normal', topic: p.message.tag });
    sent++;
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    // 404/410: the phone unsubscribed or the app was removed. Forget it.
    if ((status === 404 || status === 410) && db) {
      await db.doc(`reminders/${p.id}`).delete();
      gone++;
    } else failed++;
  }
}
console.log(`Sent ${sent}, forgot ${gone} phones that had unsubscribed, ${failed} failed.`);
