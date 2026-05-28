import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

/**
 * Tenant scope source of truth: pulled from the request set by ApiKeyGuard.
 * Controllers MUST take customerId from here, never from a path/body param —
 * this is the "scoping that can't be forgotten" seam (see DESIGN.md threat model).
 */
export const CurrentCustomer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<Request & { customerId?: string }>();
    return req.customerId ?? 'cus_mock_0001';
  },
);
