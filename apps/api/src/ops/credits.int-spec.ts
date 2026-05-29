import { ConflictException } from '@nestjs/common';
import { createTestCtx, TestCtx, truncateAll } from '../../test/harness';

/**
 * Credit issuance must be idempotent on the client-supplied key: a double
 * click (even concurrent) credits exactly once and writes exactly one audit
 * row. Reusing a key for a different customer is a real conflict, not a retry.
 */
describe('CreditsService.issue (integration)', () => {
  let ctx: TestCtx;
  let customerId: string;

  beforeAll(async () => {
    ctx = await createTestCtx();
  });
  afterAll(async () => {
    await ctx.module.close();
  });
  beforeEach(async () => {
    await truncateAll(ctx.ds);
    customerId = (await ctx.opsCustomers.createCustomer('Acme')).id;
  });

  const dto = (idempotencyKey: string, amountCents = 500) => ({
    amountCents,
    reason: 'goodwill credit',
    idempotencyKey,
  });

  async function counts() {
    const [c] = await ctx.ds.query('SELECT COUNT(*)::int AS n FROM credits');
    const [a] = await ctx.ds.query(
      `SELECT COUNT(*)::int AS n FROM audit_log WHERE action = 'credit.issue'`,
    );
    return { credits: c.n as number, audits: a.n as number };
  }

  it('issues once, replay returns the existing credit with no second audit row', async () => {
    const first = await ctx.credits.issue(customerId, dto('idem-key-0001'), 'staff@local');
    expect(first.deduplicated).toBe(false);
    expect(first.amountCents).toBe(500);

    const replay = await ctx.credits.issue(customerId, dto('idem-key-0001', 999), 'staff@local');
    expect(replay.deduplicated).toBe(true);
    expect(replay.id).toBe(first.id);
    expect(replay.amountCents).toBe(500); // original amount, not the replayed 999

    expect(await counts()).toEqual({ credits: 1, audits: 1 });
  });

  it('credits exactly once under a concurrent double-submit (UNIQUE idempotency_key)', async () => {
    const results = await Promise.allSettled([
      ctx.credits.issue(customerId, dto('race-key-0001'), 'staff@local'),
      ctx.credits.issue(customerId, dto('race-key-0001'), 'staff@local'),
    ]);

    const fulfilled = results.filter(
      (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof ctx.credits.issue>>> =>
        r.status === 'fulfilled',
    );
    expect(fulfilled).toHaveLength(2);
    const deduped = fulfilled.map((r) => r.value.deduplicated).sort();
    expect(deduped).toEqual([false, true]); // one inserted, one saw the conflict

    expect(await counts()).toEqual({ credits: 1, audits: 1 });
  });

  it('rejects the same idempotency key reused for a different customer (409)', async () => {
    const other = (await ctx.opsCustomers.createCustomer('Other Co')).id;
    await ctx.credits.issue(customerId, dto('shared-key-0001'), 'staff@local');

    await expect(
      ctx.credits.issue(other, dto('shared-key-0001'), 'staff@local'),
    ).rejects.toBeInstanceOf(ConflictException);

    // No credit leaked to the other tenant.
    const [{ n }] = await ctx.ds.query(
      'SELECT COUNT(*)::int AS n FROM credits WHERE customer_id = $1',
      [other],
    );
    expect(n).toBe(0);
  });

  it('records the server-derived staff actor on the audit row', async () => {
    await ctx.credits.issue(customerId, dto('actor-key-0001'), 'alice@ops');
    const [row] = await ctx.ds.query(
      `SELECT actor FROM audit_log WHERE action = 'credit.issue'`,
    );
    expect(row.actor).toBe('alice@ops');
  });
});
