import { createTestCtx, TestCtx, truncateAll } from '../../test/harness';

/**
 * audit_log is append-only, enforced at the DB layer by a BEFORE UPDATE OR
 * DELETE trigger. A privileged actor (or buggy code) cannot rewrite history
 * through the normal SQL path.
 */
describe('audit_log immutability (integration)', () => {
  let ctx: TestCtx;

  beforeAll(async () => {
    ctx = await createTestCtx();
  });
  afterAll(async () => {
    await ctx.module.close();
  });
  beforeEach(async () => {
    await truncateAll(ctx.ds);
    await ctx.ds.query(
      `INSERT INTO audit_log (id, actor, action, entity_type, entity_id, before_json, after_json, reason)
       VALUES ('al_immutable01', 'staff@local', 'credit.issue', 'credit', 'cr_x', NULL, $1, 'test')`,
      [JSON.stringify({ amountCents: 100 })],
    );
  });

  it('allows INSERT (the row is present)', async () => {
    const [{ n }] = await ctx.ds.query('SELECT COUNT(*)::int AS n FROM audit_log');
    expect(n).toBe(1);
  });

  it('blocks UPDATE', async () => {
    await expect(
      ctx.ds.query(`UPDATE audit_log SET reason = 'tampered' WHERE id = 'al_immutable01'`),
    ).rejects.toThrow(/append-only/i);
  });

  it('blocks DELETE', async () => {
    await expect(
      ctx.ds.query(`DELETE FROM audit_log WHERE id = 'al_immutable01'`),
    ).rejects.toThrow(/append-only/i);

    // Row still there.
    const [{ n }] = await ctx.ds.query('SELECT COUNT(*)::int AS n FROM audit_log');
    expect(n).toBe(1);
  });
});
