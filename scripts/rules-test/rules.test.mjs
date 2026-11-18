// Firestore rules check for the treadmill inbox (and the squad data staying coach-only), on the local emulator.
// Needs Java. From this folder: npm install, then npm test. Not part of `npm test` at the top level.
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, deleteDoc, updateDoc, collection, query, where, serverTimestamp, Bytes } from 'firebase/firestore';

const env = await initializeTestEnvironment({ projectId: 'demo-tasuki', firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 } });
const ms = (uid, email, name) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'microsoft.com' }, ...(email ? { email } : {}), ...(name ? { name } : {}) }).firestore();
const pupil = ms('pupilA1', 'aiko.t@harrowappi.jp', 'Aiko Testfield');
const pupilNoEmail = ms('pupilB2', undefined, 'Ben Sampleton');
const other = ms('pupilC3', 'ken.s@harrowappi.jp', 'Ken S');
const coach = ms('coach1', 'floke@harrowappi.jp', 'F Loke');
const google = env.authenticatedContext('g1', { firebase: { sign_in_provider: 'google.com' }, email: 'x@gmail.com' }).firestore();

const log = (uid, extra = {}) => ({ uid, email: 'aiko.t@harrowappi.jp', name: 'Aiko Testfield', athleteId: 'ath-1', date: '2026-11-18', distanceKm: 5, timeSec: 1530, inclinePct: 1, speedKmh: 12, effort: 6, read: 'photo', edited: false, flags: [], photo: Bytes.fromUint8Array(new Uint8Array(30000)), at: serverTimestamp(), ...extra });
const id = (uid) => `${uid}_${Date.now()}`;
let pass = 0, fail = 0;
async function t(name, p) { try { await p; pass++; console.log('ok  ', name); } catch (e) { fail++; console.log('FAIL', name, e.message?.slice(0, 200)); } }

await t('logging closed (no switch yet): refused', assertFails(setDoc(doc(pupil, 'inbox', id('pupilA1')), log('pupilA1'))));
await t('a pupil cannot open logging', assertFails(setDoc(doc(pupil, 'public', 'settings'), { treadmillLogs: true })));
await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'access', 'main'), { coaches: ['helper@harrowappi.jp'], pupilView: true }));
const helper = ms('coach2', 'helper@harrowappi.jp', 'Helper');
await t('another coach cannot open logging', assertFails(setDoc(doc(helper, 'public', 'settings'), { treadmillLogs: true })));
await t('another coach still publishes the pupil copy', assertSucceeds(setDoc(doc(helper, 'public', 'pack'), { parts: 0 })));
await t('the head coach opens logging', assertSucceeds(setDoc(doc(coach, 'public', 'settings'), { treadmillLogs: true })));
await t('pupils can see that logging is open', assertSucceeds(getDoc(doc(pupil, 'public', 'settings'))));
const a = id('pupilA1');
await t('pupil sends a valid log', assertSucceeds(setDoc(doc(pupil, 'inbox', a), log('pupilA1'))));
const noEmail = log('pupilB2', { name: 'Ben Sampleton' }); delete noEmail.email;
await t('pupil without email on the token, name only (no email field)', assertSucceeds(setDoc(doc(pupilNoEmail, 'inbox', id('pupilB2') + '9'.repeat(0)), noEmail)));
await t('typed log, no photo or optional fields', assertSucceeds(setDoc(doc(pupil, 'inbox', id('pupilA1') ), { uid: 'pupilA1', athleteId: 'ath-1', date: '2026-11-18', distanceKm: 3, timeSec: 1100, read: 'typed', at: serverTimestamp() })));
await t('another uid in the data', assertFails(setDoc(doc(pupil, 'inbox', id('pupilA1')), log('pupilC3'))));
await t('a document id for another pupil', assertFails(setDoc(doc(pupil, 'inbox', id('pupilC3')), log('pupilA1'))));
await t('a made-up id', assertFails(setDoc(doc(pupil, 'inbox', 'pupilA1_123'), log('pupilA1'))));
await t('someone else’s email', assertFails(setDoc(doc(pupil, 'inbox', id('pupilA1')), log('pupilA1', { email: 'ken.s@harrowappi.jp' }))));
await t('someone else’s name', assertFails(setDoc(doc(pupil, 'inbox', id('pupilA1')), log('pupilA1', { name: 'Ken S' }))));
await t('an extra field', assertFails(setDoc(doc(pupil, 'inbox', id('pupilA1')), log('pupilA1', { verified: true }))));
await t('zero distance', assertFails(setDoc(doc(pupil, 'inbox', id('pupilA1')), log('pupilA1', { distanceKm: 0 }))));
await t('effort 11', assertFails(setDoc(doc(pupil, 'inbox', id('pupilA1')), log('pupilA1', { effort: 11 }))));
await t('a 200 kB photo', assertFails(setDoc(doc(pupil, 'inbox', id('pupilA1')), log('pupilA1', { photo: Bytes.fromUint8Array(new Uint8Array(200000)) }))));
await t('a client clock time', assertFails(setDoc(doc(pupil, 'inbox', id('pupilA1')), log('pupilA1', { at: new Date() }))));
await t('a bad date', assertFails(setDoc(doc(pupil, 'inbox', id('pupilA1')), log('pupilA1', { date: '18/11/2026' }))));
await t('a Google account', assertFails(setDoc(doc(google, 'inbox', id('g1')), (() => { const l = log('g1', { email: 'x@gmail.com' }); delete l.name; return l; })())));
await t('pupil reads their own', assertSucceeds(getDoc(doc(pupil, 'inbox', a))));
await t('pupil lists their own', assertSucceeds(getDocs(query(collection(pupil, 'inbox'), where('uid', '==', 'pupilA1')))));
await t('another pupil cannot read it', assertFails(getDoc(doc(other, 'inbox', a))));
await t('a pupil cannot list everyone’s', assertFails(getDocs(collection(other, 'inbox'))));
await t('nobody can change a log', assertFails(updateDoc(doc(pupil, 'inbox', a), { distanceKm: 10 })));
await t('coach lists all', assertSucceeds(getDocs(collection(coach, 'inbox'))));
await t('another pupil cannot delete it', assertFails(deleteDoc(doc(other, 'inbox', a))));
await t('coach deletes it once decided', assertSucceeds(deleteDoc(doc(coach, 'inbox', a))));
const b = id('pupilA1') + '';
await new Promise((r) => setTimeout(r, 5));
const b2 = id('pupilA1');
await t('pupil sends another', assertSucceeds(setDoc(doc(pupil, 'inbox', b2), log('pupilA1'))));
await t('pupil withdraws their own', assertSucceeds(deleteDoc(doc(pupil, 'inbox', b2))));
await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'access', 'main'), { coaches: [], pupilView: false }));
await t('pupil view closed: no new logs', assertFails(setDoc(doc(pupil, 'inbox', id('pupilA1')), log('pupilA1'))));
await t('pupil view closed: coaches log in Quick Entry instead', assertFails(setDoc(doc(coach, 'inbox', id('coach1')), log('coach1', { email: 'floke@harrowappi.jp', name: 'F Loke' }))));
await t('squad data still coach-only', assertFails(getDocs(collection(pupil, 'squad'))));
await env.cleanup();
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
