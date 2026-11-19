import { describe, expect, it } from 'vitest';
import { generateVapidKeys } from './vapid';

describe('reminder keys', () => {
  it('a P-256 key pair in the form web push expects (65-byte public point, 32-byte private scalar, base64url)', async () => {
    const { publicKey, privateKey } = await generateVapidKeys();
    const bytes = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    expect(publicKey).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(bytes(publicKey)).toHaveLength(65);
    expect(bytes(publicKey)[0]).toBe(4);
    expect(bytes(privateKey)).toHaveLength(32);
    expect((await generateVapidKeys()).publicKey).not.toBe(publicKey);
  });
});
