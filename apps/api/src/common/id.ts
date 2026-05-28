import { randomBytes } from 'crypto';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/**
 * Generate a prefixed, URL-safe id like `cus_8f3k...` (base36 body).
 * Prefix encodes the entity type for readable, greppable ids; UNIQUE PKs +
 * the random body make collisions negligible at our scale.
 */
export function generateId(prefix: string, length = 20): string {
  const bytes = randomBytes(length);
  let body = '';
  for (let i = 0; i < length; i++) {
    body += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `${prefix}_${body}`;
}
