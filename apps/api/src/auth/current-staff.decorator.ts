import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { StaffRequest } from './staff.guard';

/**
 * The verified staff actor set by StaffGuard. Ops mutations (credits,
 * line-item overrides) MUST record this as the audit_log actor — never trust a
 * client-supplied actor field. Fails closed if StaffGuard didn't run.
 */
export const CurrentStaff = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<StaffRequest>();
    if (!req.staffActor) {
      throw new UnauthorizedException('No staff actor on request');
    }
    return req.staffActor;
  },
);
