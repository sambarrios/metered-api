import { createHmac } from 'crypto';
import { signStaffToken, verifyStaffToken } from './staff-jwt';

const SECRET = 'test-staff-secret';

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
/** Hand-forge a token with arbitrary header/payload, signed (or not) at will. */
function forge(header: object, payload: object, secret?: string): string {
  const signingInput = `${b64urlJson(header)}.${b64urlJson(payload)}`;
  const sig =
    secret === undefined
      ? ''
      : b64url(createHmac('sha256', secret).update(signingInput).digest());
  return `${signingInput}.${sig}`;
}

describe('staff JWT sign/verify roundtrip', () => {
  it('verifies a freshly signed token and returns claims', () => {
    const token = signStaffToken('staff@local', SECRET);
    const claims = verifyStaffToken(token, SECRET);
    expect(claims.sub).toBe('staff@local');
    expect(claims.role).toBe('staff');
    expect(claims.exp).toBeGreaterThan(claims.iat);
  });
});

describe('staff JWT rejects forged / tampered tokens (fail closed)', () => {
  it('rejects a token signed with a different secret', () => {
    const token = signStaffToken('staff@local', 'other-secret');
    expect(() => verifyStaffToken(token, SECRET)).toThrow('bad signature');
  });

  it('rejects a tampered payload (sub swapped, signature stale)', () => {
    const token = signStaffToken('staff@local', SECRET);
    const [h, , s] = token.split('.');
    const evilPayload = b64urlJson({
      sub: 'attacker',
      role: 'staff',
      iat: 0,
      exp: 9_999_999_999,
    });
    const tampered = `${h}.${evilPayload}.${s}`;
    expect(() => verifyStaffToken(tampered, SECRET)).toThrow('bad signature');
  });

  it('rejects alg=none (unsigned) tokens', () => {
    // Classic downgrade: header says none, empty signature.
    const token = forge(
      { alg: 'none', typ: 'JWT' },
      { sub: 'attacker', role: 'staff', iat: 0, exp: 9_999_999_999 },
    );
    // Empty sig fails the constant-time length/compare check first.
    expect(() => verifyStaffToken(token, SECRET)).toThrow();
  });

  it('rejects alg confusion even when the body is correctly HS256-signed but header lies', () => {
    // Properly HMAC-signed over its own input, but header advertises a non-HS256 alg.
    const token = forge(
      { alg: 'HS512', typ: 'JWT' },
      { sub: 'attacker', role: 'staff', iat: 0, exp: 9_999_999_999 },
      SECRET,
    );
    expect(() => verifyStaffToken(token, SECRET)).toThrow('unexpected alg');
  });

  it('rejects an expired token', () => {
    const token = forge(
      { alg: 'HS256', typ: 'JWT' },
      { sub: 'staff@local', role: 'staff', iat: 0, exp: 1 },
      SECRET,
    );
    expect(() => verifyStaffToken(token, SECRET)).toThrow('token expired');
  });

  it('rejects a non-staff role even if validly signed', () => {
    const token = forge(
      { alg: 'HS256', typ: 'JWT' },
      { sub: 'someone', role: 'admin', iat: 0, exp: 9_999_999_999 },
      SECRET,
    );
    expect(() => verifyStaffToken(token, SECRET)).toThrow('not a staff token');
  });

  it('rejects an empty sub', () => {
    const token = forge(
      { alg: 'HS256', typ: 'JWT' },
      { sub: '', role: 'staff', iat: 0, exp: 9_999_999_999 },
      SECRET,
    );
    expect(() => verifyStaffToken(token, SECRET)).toThrow('not a staff token');
  });

  it('rejects malformed tokens (wrong part count)', () => {
    expect(() => verifyStaffToken('a.b', SECRET)).toThrow('malformed token');
    expect(() => verifyStaffToken('garbage', SECRET)).toThrow('malformed token');
  });
});
