import { randomUUID } from 'crypto';
import { createTestCtx, TestCtx, truncateAll } from '../../test/harness';
import { AGGREGATE_WINDOW_JOB } from '../jobs/job-types';

/**
 * Idempotent ingest is the first correctness boundary: a replayed batch must
 * not double-count, and accepted events must enqueue exactly one (deduped)
 * aggregate job per touched hour.
 */
describe('EventsService.ingest (integration)', () => {
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

  const evt = (requestId: string, timestamp: string, units = 1) => ({
    requestId,
    endpoint: '/v1/search',
    units,
    timestamp,
  });

  it('accepts a fresh batch and dedupes a full replay (UNIQUE request_id)', async () => {
    const ts = '2026-05-01T10:15:00.000Z';
    const events = [evt('r1', ts), evt('r2', ts), evt('r3', ts)];

    const first = await ctx.events.ingest(customerId, null, { events });
    expect(first).toEqual({ received: 3, accepted: 3, duplicates: 0 });

    // Replay the identical batch — every request_id collides, nothing inserted.
    const replay = await ctx.events.ingest(customerId, null, { events });
    expect(replay).toEqual({ received: 3, accepted: 0, duplicates: 3 });

    const [{ count }] = await ctx.ds.query(
      'SELECT COUNT(*)::int AS count FROM usage_events WHERE customer_id = $1',
      [customerId],
    );
    expect(count).toBe(3);
  });

  it('collapses intra-batch duplicate request_ids (first wins)', async () => {
    const ts = '2026-05-01T10:15:00.000Z';
    const events = [evt('dup', ts, 5), evt('dup', ts, 99), evt('other', ts)];

    const res = await ctx.events.ingest(customerId, null, { events });
    expect(res).toEqual({ received: 3, accepted: 2, duplicates: 1 });

    // First occurrence wins: units 5, not 99.
    const [row] = await ctx.ds.query(
      'SELECT units FROM usage_events WHERE request_id = $1',
      ['dup'],
    );
    expect(row.units).toBe(5);
  });

  it('enqueues one deduped aggregate job per touched hour', async () => {
    const events = [
      evt('a', '2026-05-01T10:05:00.000Z'),
      evt('b', '2026-05-01T10:55:00.000Z'), // same hour as a
      evt('c', '2026-05-01T12:30:00.000Z'), // different hour
    ];
    await ctx.events.ingest(customerId, null, { events });

    const jobs = await ctx.ds.query(
      `SELECT payload FROM jobs WHERE type = $1 ORDER BY (payload->>'windowStart')`,
      [AGGREGATE_WINDOW_JOB],
    );
    expect(jobs).toHaveLength(2);
    expect(jobs.map((j: { payload: { windowStart: string } }) => j.payload.windowStart)).toEqual([
      '2026-05-01T10:00:00.000Z',
      '2026-05-01T12:00:00.000Z',
    ]);
  });

  it('attributes events to the authenticating key, not a client-supplied id', async () => {
    const apiKeyId = 'key_authenticating';
    // Seed a real api key row so the FK (if any) is satisfied via the ops path.
    const created = await ctx.opsCustomers.createApiKey(customerId);
    await ctx.events.ingest(customerId, created.id, {
      events: [evt('z', '2026-05-01T10:00:00.000Z')],
    });
    const [row] = await ctx.ds.query(
      'SELECT api_key_id FROM usage_events WHERE request_id = $1',
      ['z'],
    );
    expect(row.api_key_id).toBe(created.id);
    expect(row.api_key_id).not.toBe(apiKeyId);
  });
});
