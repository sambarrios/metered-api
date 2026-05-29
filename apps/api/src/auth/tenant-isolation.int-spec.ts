import { ExecutionContext, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createTestCtx, TestCtx, truncateAll } from '../../test/harness';
import { AuthedRequest } from './api-key.guard';

/**
 * Tenant isolation lives at a layer it can't be forgotten: the API-key guard
 * resolves the customer scope from the key hash, and cross-tenant reads return
 * 404 (never 403) so existence isn't leaked.
 */
describe('Tenant isolation (integration)', () => {
  let ctx: TestCtx;

  beforeAll(async () => {
    ctx = await createTestCtx();
  });
  afterAll(async () => {
    await ctx.module.close();
  });
  beforeEach(async () => {
    await truncateAll(ctx.ds);
  });

  function guardCtx(headers: Record<string, unknown>): {
    ctx: ExecutionContext;
    req: AuthedRequest;
  } {
    const req = { headers } as unknown as AuthedRequest;
    const execCtx = {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    return { ctx: execCtx, req };
  }

  it('resolves the owning customer + key from a valid X-API-Key', async () => {
    const customerId = (await ctx.opsCustomers.createCustomer('Acme')).id;
    const key = await ctx.opsCustomers.createApiKey(customerId);

    const { ctx: execCtx, req } = guardCtx({ 'x-api-key': key.plaintext });
    await expect(ctx.apiKeyGuard.canActivate(execCtx)).resolves.toBe(true);
    expect(req.customerId).toBe(customerId);
    expect(req.apiKeyId).toBe(key.id);
  });

  it('rejects a missing key (401)', async () => {
    const { ctx: execCtx } = guardCtx({});
    await expect(ctx.apiKeyGuard.canActivate(execCtx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an unknown key (401, leaks nothing)', async () => {
    const { ctx: execCtx } = guardCtx({ 'x-api-key': 'mk_nope' });
    await expect(ctx.apiKeyGuard.canActivate(execCtx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a revoked key (401)', async () => {
    const customerId = (await ctx.opsCustomers.createCustomer('Acme')).id;
    const key = await ctx.opsCustomers.createApiKey(customerId);
    await ctx.ds.query('UPDATE api_keys SET revoked_at = now() WHERE id = $1', [key.id]);

    const { ctx: execCtx } = guardCtx({ 'x-api-key': key.plaintext });
    await expect(ctx.apiKeyGuard.canActivate(execCtx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('returns 404 (not 403) when one tenant requests another tenant`s invoice', async () => {
    const a = (await ctx.opsCustomers.createCustomer('Tenant A')).id;
    const b = (await ctx.opsCustomers.createCustomer('Tenant B')).id;
    const invoiceId = 'inv_tenantiso01';
    await ctx.ds.query(
      `INSERT INTO invoices
         (id, customer_id, period_start, period_end, status, subtotal_cents, credits_cents, total_cents)
       VALUES ($1, $2, '2026-04-01T00:00:00Z', '2026-05-01T00:00:00Z', 'draft', 100, 0, 100)`,
      [invoiceId, a],
    );

    // Owner can read it.
    await expect(ctx.invoiceQuery.get(a, invoiceId)).resolves.toMatchObject({ id: invoiceId });
    // The other tenant gets a 404 — same response as a non-existent id.
    await expect(ctx.invoiceQuery.get(b, invoiceId)).rejects.toBeInstanceOf(NotFoundException);
  });
});
