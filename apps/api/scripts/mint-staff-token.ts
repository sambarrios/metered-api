import 'reflect-metadata';
import { signStaffToken } from '../src/common/staff-jwt';

/**
 * Dev-only: mint a staff JWT for exercising /ops. No staff user store exists in
 * this take-home (production story = SSO/OIDC, see DESIGN.md) — this script
 * stands in for an identity provider issuing a signed, expiring token.
 *
 *   npm run mint:staff -- alice@ops.example   # sub defaults to "staff@local"
 */
try {
  require('dotenv').config();
} catch {
  /* dotenv optional */
}

const secret = process.env.STAFF_JWT_SECRET;
if (!secret) {
  console.error('STAFF_JWT_SECRET is not set (check apps/api/.env)');
  process.exit(1);
}

const sub = process.argv[2] ?? 'staff@local';
const ttl = Number(process.argv[3] ?? 3600);
const token = signStaffToken(sub, secret, ttl);

console.log('Staff actor:', sub);
console.log(`Expires in:  ${ttl}s`);
console.log('Token (use as `Authorization: Bearer <token>`):');
console.log(token);
