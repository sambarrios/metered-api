import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { verifyStaffToken } from '../common/staff-jwt';

/** Request augmented by StaffGuard with the verified staff actor (audit actor). */
export type StaffRequest = Request & { staffActor?: string };

/**
 * Verifies a staff JWT in `Authorization: Bearer <token>` (HS256, signed with
 * STAFF_JWT_SECRET). Separate mechanism from the customer API key — ops code and
 * customer code never share an auth path. Fail-closed: if the secret is unset the
 * whole /ops surface is unreachable (500), never silently open. On success the
 * actor (`sub`) is attached for audit_log on credits/overrides.
 */
@Injectable()
export class StaffGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.config.get<string>('STAFF_JWT_SECRET');
    if (!secret) {
      throw new InternalServerErrorException('Staff auth not configured');
    }

    const req = context.switchToHttp().getRequest<StaffRequest>();
    const raw = req.headers['authorization'];
    const header = Array.isArray(raw) ? raw[0] : raw;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing staff token');
    }

    const token = header.slice('Bearer '.length).trim();
    try {
      const claims = verifyStaffToken(token, secret);
      req.staffActor = claims.sub;
    } catch {
      // Don't echo the underlying reason — leaks nothing about why it failed.
      throw new UnauthorizedException('Invalid staff token');
    }
    return true;
  }
}
