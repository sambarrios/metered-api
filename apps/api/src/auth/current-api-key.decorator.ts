import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthedRequest } from './api-key.guard';

/**
 * The id of the api_key used to authenticate this request (set by ApiKeyGuard).
 * Usage is attributed to this key, never to a client-supplied value.
 */
export const CurrentApiKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    return req.apiKeyId ?? null;
  },
);
