import { createHash, randomBytes } from 'crypto';

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** sha256 hex of a plaintext API key. Lookup + storage use only this hash. */
export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext, 'utf8').digest('hex');
}

/**
 * Mint a new API key. Returns the plaintext (shown to the caller exactly once),
 * its sha256 hash (stored), and a short non-secret prefix (for display/lookup).
 */
export function generateApiKey(): { plaintext: string; keyHash: string; keyPrefix: string } {
  const bytes = randomBytes(32);
  let body = '';
  for (const b of bytes) {
    body += BASE62[b % 62];
  }
  const plaintext = `mk_${body}`;
  return { plaintext, keyHash: hashApiKey(plaintext), keyPrefix: plaintext.slice(0, 11) };
}
