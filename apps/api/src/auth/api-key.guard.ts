import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { Repository } from 'typeorm';
import { hashApiKey } from '../common/api-key';
import { ApiKey } from '../database/entities/api-key.entity';

/** Request augmented by this guard with the resolved tenant scope. */
export type AuthedRequest = Request & { customerId?: string; apiKeyId?: string };

/**
 * Verifies the `X-API-Key` header: sha256 it, look up api_keys by hash, reject
 * if missing or revoked. On success, attaches the owning customer_id + key id
 * to the request — the single source of tenant scope for /v1 (see
 * current-customer.decorator). 401 leaks nothing about which keys exist.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeys: Repository<ApiKey>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const raw = req.headers['x-api-key'];
    const plaintext = Array.isArray(raw) ? raw[0] : raw;
    if (!plaintext) {
      throw new UnauthorizedException('Missing API key');
    }

    const key = await this.apiKeys.findOne({ where: { keyHash: hashApiKey(plaintext) } });
    if (!key || key.revokedAt) {
      throw new UnauthorizedException('Invalid API key');
    }

    req.customerId = key.customerId;
    req.apiKeyId = key.id;
    return true;
  }
}
