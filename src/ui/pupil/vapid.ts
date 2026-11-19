// The key pair that signs trail reminders (VAPID, the web push standard), made in the head coach's browser so
// nothing needs installing. The public half is stored for phones to subscribe with; the private half is shown
// once, to be saved as the GitHub secret VAPID_PRIVATE_KEY for the sender, and is never stored by the app.

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function generateVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  if (!jwk.d) throw new Error('could not export the private key');
  return { publicKey: b64url(raw), privateKey: jwk.d };
}
