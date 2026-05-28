import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthedRequest } from './api-key.guard';

/**
 * Tenant scope source of truth: pulled from the request set by ApiKeyGuard.
 * Controllers MUST take customerId from here, never from a path/body param —
 * this is the "scoping that can't be forgotten" seam (see DESIGN.md threat model).
 * Throws if used without ApiKeyGuard having run (fail closed, never default).
 */
export const CurrentCustomer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!req.customerId) {
      throw new UnauthorizedException('No tenant scope on request');
    }
    return req.customerId;
  },
);
