/**
 * App lock (PLAN.md section 16.6): a PIN or passphrase checked locally.
 * Stores only a PBKDF2 hash and salt. It keeps casual eyes out on a shared
 * device; it does not encrypt stored data (that is the optional encrypted
 * storage in Phase 10).
 */

export interface LockRecord {
  salt: string;
  hash: string;
  iterations: number;
}

const ITERATIONS = 310_000;

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function derive(secret: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function createLock(secret: string, iterations = ITERATIONS): Promise<LockRecord> {
  if (secret.length < 4) throw new Error('Use at least 4 characters');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: toBase64(salt), hash: toBase64(await derive(secret, salt, iterations)), iterations };
}

export async function verifyLock(secret: string, record: LockRecord): Promise<boolean> {
  const hash = await derive(secret, fromBase64(record.salt), record.iterations);
  const expected = fromBase64(record.hash);
  if (hash.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash[i]! ^ expected[i]!;
  return diff === 0;
}
