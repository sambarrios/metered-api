import { createTestCtx, TestCtx, truncateAll } from '../../test/harness';

/**
 * End-to-end tiered money math against the real DB, plus the invoice
 * idempotency states: a draft regenerates (absorbing late aggregation) while an
 * issued/paid invoice is frozen. The per-line cent rounding must hold the
 * invariant subtotal = sum(line cents).
 */
describe('InvoiceGenerationService.generateInvoice (integration)', () => {
  let ctx: TestCtx;
  let customerId: string;

  const periodStart = '2026-05-01T00:00:00.000Z';

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

  let winSeq = 0;
  async function seedWindow(units: number, day = 10): Promise<void> {
    winSeq += 1;
    await ctx.ds.query(
      `INSERT INTO usage_windows
         (id, customer_id, window_start, total_units, event_count, last_event_ts, state, version)
       VALUES ($1, $2, $3, $4, 1, $3, 'open', 0)`,
      [
        `win_test${String(winSeq).padStart(4, '0')}`,
        customerId,
        `2026-05-${String(day).padStart(2, '0')}T10:00:00.000Z`,
        units,
      ],
    );
  }

  it('computes the documented 150k-units => $115.00 invoice with one line per tier', async () => {
    await seedWindow(150_000);

    const res = await ctx.invoiceGen.generateInvoice(customerId, periodStart);
    expect(res.units).toBe(150_000);
    expect(res.subtotalCents).toBe(115_00);
    expect(res.totalCents).toBe(115_00);
    expect(res.status).toBe('draft');
    expect(res.frozen).toBe(false);
    expect(res.lineItems).toBe(3); // free 10k, 90k @ $0.001, 50k @ $0.0005

    // Invariant: subtotal equals the sum of the persisted line cents.
    const [{ sum }] = await ctx.ds.query(
      `SELECT COALESCE(SUM(amount_cents), 0)::int AS sum
         FROM invoice_line_items WHERE invoice_id = $1`,
      [res.invoiceId],
    );
    expect(sum).toBe(115_00);
  });

  it('charges nothing inside the free tier', async () => {
    await seedWindow(8_000);
    const res = await ctx.invoiceGen.generateInvoice(customerId, periodStart);
    expect(res.totalCents).toBe(0);
  });

  it('regenerates a draft to absorb late aggregation (idempotent recompute)', async () => {
    await seedWindow(150_000, 10);
    const first = await ctx.invoiceGen.generateInvoice(customerId, periodStart);
    expect(first.totalCents).toBe(115_00);

    // A late window pushes the month to 200k units total.
    await seedWindow(50_000, 11);
    const regen = await ctx.invoiceGen.generateInvoice(customerId, periodStart);
    expect(regen.invoiceId).toBe(first.invoiceId); // same draft, reused
    expect(regen.units).toBe(200_000);
    // free 10k + 90k @ $0.001 ($90) + 100k @ $0.0005 ($50) = $140.00
    expect(regen.totalCents).toBe(140_00);
    expect(regen.frozen).toBe(false);

    // Only one invoice for the period — UNIQUE(customer_id, period_start) holds.
    const [{ n }] = await ctx.ds.query(
      'SELECT COUNT(*)::int AS n FROM invoices WHERE customer_id = $1',
      [customerId],
    );
    expect(n).toBe(1);
  });

  it('freezes an issued invoice — late events do not rewrite a closed period', async () => {
    await seedWindow(150_000);
    const draft = await ctx.invoiceGen.generateInvoice(customerId, periodStart);
    await ctx.ds.query(`UPDATE invoices SET status = 'issued', issued_at = now() WHERE id = $1`, [
      draft.invoiceId,
    ]);

    // A late window arrives, but the issued invoice must not change.
    await seedWindow(50_000, 12);
    const regen = await ctx.invoiceGen.generateInvoice(customerId, periodStart);
    expect(regen.frozen).toBe(true);
    expect(regen.status).toBe('issued');
    expect(regen.totalCents).toBe(115_00); // unchanged from the draft total
  });

  it('serializes concurrent generation for the same period (advisory lock + UNIQUE)', async () => {
    await seedWindow(150_000);
    const [a, b] = await Promise.all([
      ctx.invoiceGen.generateInvoice(customerId, periodStart),
      ctx.invoiceGen.generateInvoice(customerId, periodStart),
    ]);
    expect(a.invoiceId).toBe(b.invoiceId); // one invoice, not two
    const [{ n }] = await ctx.ds.query(
      'SELECT COUNT(*)::int AS n FROM invoices WHERE customer_id = $1',
      [customerId],
    );
    expect(n).toBe(1);
  });
});
