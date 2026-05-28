import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';

export const MOCK_CUSTOMER_ID = 'cus_mock_0001';

/**
 * MOCK guard (Phase 1): does not yet verify keys. It resolves a customerId and
 * attaches it to the request so /v1 controllers already read tenant scope from
 * here. Phase 3 replaces the body with: sha256(key) lookup in api_keys,
 * 401 on miss, then attach the real customer_id. Controllers don't change.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { customerId?: string }>();
    const headerKey = (req.headers['x-api-key'] as string | undefined) ?? '';
    // MOCK: any key (or none) maps to the demo tenant. Real verify in Phase 3.
    req.customerId = headerKey.startsWith('mk_') ? `cus_${headerKey.slice(3, 11)}` : MOCK_CUSTOMER_ID;
    return true;
  }
}
