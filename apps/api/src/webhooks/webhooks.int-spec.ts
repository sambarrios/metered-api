import { UnauthorizedException } from '@nestjs/common';
import { createTestCtx, TEST_WEBHOOK_SECRET, TestCtx, truncateAll } from '../../test/harness';
import { signWebhook } from '../common/webhook-signature';
import { PaymentWebhookDto } from './webhooks.controller';

/**
 * The payments webhook is the "compromised webhook" actor in the threat model:
 * an unsigned/forged delivery is rejected, and a redelivered (replayed)
 * delivery_id flips the invoice exactly once (dedupe insert + state change in
 * one transaction).
 */
describe('WebhooksService.process (integration)', () => {
  let ctx: TestCtx;
  let customerId: string;
  let invoiceId: string;

  beforeAll(async () => {
    ctx = await createTestCtx();
  });
  afterAll(async () => {
    await ctx.module.close();
  });
  beforeEach(async () => {
    await truncateAll(ctx.ds);
    customerId = (await ctx.opsCustomers.createCustomer('Acme')).id;
    invoiceId = await seedIssuedInvoice();
  });

  async function seedIssuedInvoice(): Promise<string> {
    const id = 'inv_webhooktest01';
    await ctx.ds.query(
      `INSERT INTO invoices
         (id, customer_id, period_start, period_end, status, subtotal_cents, credits_cents, total_cents, issued_at)
       VALUES ($1, $2, '2026-04-01T00:00:00Z', '2026-05-01T00:00:00Z', 'issued', 1000, 0, 1000, now())`,
      [id, customerId],
    );
    return id;
  }

  function signed(dto: PaymentWebhookDto): { raw: Buffer; sig: string } {
    const raw = Buffer.from(JSON.stringify(dto));
    return { raw, sig: signWebhook(raw, TEST_WEBHOOK_SECRET) };
  }

  async function invoiceStatus(): Promise<{ status: string; paid_at: Date | null }> {
    const [row] = await ctx.ds.query('SELECT status, paid_at FROM invoices WHERE id = $1', [
      invoiceId,
    ]);
    return row;
  }

  it('rejects a delivery with a bad signature (401), invoice untouched', async () => {
    const dto: PaymentWebhookDto = {
      deliveryId: 'd-bad',
      invoiceId,
      status: 'paid',
      amountCents: 1000,
    };
    const raw = Buffer.from(JSON.stringify(dto));
    await expect(ctx.webhooks.process(raw, 'deadbeef', dto)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect((await invoiceStatus()).status).toBe('issued');
  });

  it('rejects a missing signature (401)', async () => {
    const dto: PaymentWebhookDto = {
      deliveryId: 'd-nosig',
      invoiceId,
      status: 'paid',
      amountCents: 1000,
    };
    await expect(
      ctx.webhooks.process(Buffer.from(JSON.stringify(dto)), undefined, dto),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('flips the invoice to paid on a valid signed delivery', async () => {
    const dto: PaymentWebhookDto = {
      deliveryId: 'd-1',
      invoiceId,
      status: 'paid',
      amountCents: 1000,
    };
    const { raw, sig } = signed(dto);
    const res = await ctx.webhooks.process(raw, sig, dto);
    expect(res.deduplicated).toBe(false);
    expect((await invoiceStatus()).status).toBe('paid');
  });

  it('processes a replayed delivery_id exactly once (3 deliveries, one effect)', async () => {
    const dto: PaymentWebhookDto = {
      deliveryId: 'd-replay',
      invoiceId,
      status: 'paid',
      amountCents: 1000,
    };
    const { raw, sig } = signed(dto);

    const first = await ctx.webhooks.process(raw, sig, dto);
    expect(first.deduplicated).toBe(false);
    const paidAt = (await invoiceStatus()).paid_at;

    const second = await ctx.webhooks.process(raw, sig, dto);
    const third = await ctx.webhooks.process(raw, sig, dto);
    expect(second.deduplicated).toBe(true);
    expect(third.deduplicated).toBe(true);

    // Exactly one payment_event row; paid_at never moved after the first.
    const [{ n }] = await ctx.ds.query(
      'SELECT COUNT(*)::int AS n FROM payment_events WHERE delivery_id = $1',
      ['d-replay'],
    );
    expect(n).toBe(1);
    expect((await invoiceStatus()).paid_at).toEqual(paidAt);
  });

  it('records a distinct delivery for an already-paid invoice without moving it', async () => {
    const pay: PaymentWebhookDto = {
      deliveryId: 'd-pay',
      invoiceId,
      status: 'paid',
      amountCents: 1000,
    };
    const a = signed(pay);
    await ctx.webhooks.process(a.raw, a.sig, pay);
    const paidAt = (await invoiceStatus()).paid_at;

    // A second, distinct delivery for the same (now paid) invoice: recorded,
    // but the bounded transition WHERE status IN ('draft','issued') moves nothing.
    const again: PaymentWebhookDto = {
      deliveryId: 'd-pay-2',
      invoiceId,
      status: 'paid',
      amountCents: 1000,
    };
    const b = signed(again);
    const res = await ctx.webhooks.process(b.raw, b.sig, again);
    expect(res.deduplicated).toBe(false); // a new delivery row is written

    expect((await invoiceStatus()).paid_at).toEqual(paidAt); // unchanged
    const [{ n }] = await ctx.ds.query('SELECT COUNT(*)::int AS n FROM payment_events');
    expect(n).toBe(2);
  });
});
