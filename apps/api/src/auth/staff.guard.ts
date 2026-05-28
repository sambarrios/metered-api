import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

/**
 * MOCK staff guard (Phase 1): allow-all. Phase 3 verifies a staff JWT
 * (STAFF_JWT_SECRET) and role before any /ops route runs.
 */
@Injectable()
export class StaffGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    return true;
  }
}
