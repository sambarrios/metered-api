import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Webhook signatures: hex HMAC-SHA256 of the exact raw request body under the
 * shared secret. We verify against the raw bytes (not re-serialized JSON) so a
 * different key order or whitespace can't change the result.
 */
export function signWebhook(rawBody: Buffer | string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

/** Constant-time compare of a provided hex signature against the expected one. */
export function verifyWebhookSignature(
  rawBody: Buffer | string,
  provided: string | undefined,
  secret: string,
): boolean {
  if (!provided) {
    return false;
  }
  const expected = signWebhook(rawBody, secret);
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // timingSafeEqual throws on length mismatch; a length diff already means no
  // match, so guard it without leaking timing on equal-length inputs.
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}
