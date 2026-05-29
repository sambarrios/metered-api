import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Minimal self-contained HS256 JWT for staff (ops) auth — no external lib, same
 * crypto primitives as the payments webhook HMAC. Verify is fail-closed and
 * explicitly rejects the `alg=none` / alg-confusion downgrade attacks: we only
 * ever trust HS256 and never read the algorithm from the (attacker-controlled)
 * header to pick a verifier.
 *
 * `sub` identifies the staff actor and is what flows into audit_log for credits
 * and line-item overrides — see DESIGN.md threat model (hostile internal user).
 */
export interface StaffClaims {
  /** staff actor identity (e.g. email) — recorded as the audit actor */
  sub: string;
  role: 'staff';
  iat: number;
  exp: number;
}

function b64url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64urlJson(obj: unknown): string {
  return b64url(Buffer.from(JSON.stringify(obj), 'utf8'));
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

export function signStaffToken(
  sub: string,
  secret: string,
  ttlSeconds = 3600,
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload: StaffClaims = { sub, role: 'staff', iat: now, exp: now + ttlSeconds };
  const signingInput = `${b64urlJson(header)}.${b64urlJson(payload)}`;
  const sig = b64url(createHmac('sha256', secret).update(signingInput).digest());
  return `${signingInput}.${sig}`;
}

/** Verifies signature, alg, role and expiry. Throws on any failure (fail closed). */
export function verifyStaffToken(token: string, secret: string): StaffClaims {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('malformed token');
  }
  const [h, p, s] = parts;
  const signingInput = `${h}.${p}`;

  // Constant-time signature check before we parse anything attacker-controlled.
  const expected = createHmac('sha256', secret).update(signingInput).digest();
  const provided = fromB64url(s);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new Error('bad signature');
  }

  let header: { alg?: string };
  let payload: Partial<StaffClaims>;
  try {
    header = JSON.parse(fromB64url(h).toString('utf8'));
    payload = JSON.parse(fromB64url(p).toString('utf8'));
  } catch {
    throw new Error('malformed token');
  }

  // Pin the algorithm — never honor `alg: none` or an attacker-chosen verifier.
  if (header.alg !== 'HS256') {
    throw new Error('unexpected alg');
  }
  if (payload.role !== 'staff' || typeof payload.sub !== 'string' || !payload.sub) {
    throw new Error('not a staff token');
  }
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now) {
    throw new Error('token expired');
  }
  return payload as StaffClaims;
}
