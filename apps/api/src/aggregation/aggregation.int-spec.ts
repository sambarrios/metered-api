import { createTestCtx, TestCtx, truncateAll } from '../../test/harness';
import { AGGREGATE_WINDOW_JOB } from '../jobs/job-types';

/**
 * Two correctness properties: (1) window recompute is an idempotent pure
 * function of the raw events — re-running yields identical totals, only the
 * version counter advances; (2) overlapping workers claiming the job queue
 * never grab the same job (FOR UPDATE SKIP LOCKED).
 */
describe('Aggregation + job queue (integration)', () => {
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

  const evt = (requestId: string, timestamp: string, units: number) => ({
    requestId,
    endpoint: '/v1/search',
    units,
    timestamp,
  });

  const windowStart = '2026-05-01T10:00:00.000Z';

  async function readWindow() {
    const [w] = await ctx.ds.query(
      `SELECT total_units::int AS total_units, event_count, version
         FROM usage_windows WHERE customer_id = $1 AND window_start = $2`,
      [customerId, windowStart],
    );
    return w as { total_units: number; event_count: number; version: number };
  }

  it('recomputes the same totals on re-run; version is a re-aggregation counter', async () => {
    await ctx.events.ingest(customerId, null, {
      events: [
        evt('a', '2026-05-01T10:05:00.000Z', 3),
        evt('b', '2026-05-01T10:45:00.000Z', 7),
      ],
    });

    await ctx.aggregation.recomputeWindow(customerId, windowStart);
    const first = await readWindow();
    expect(first).toMatchObject({ total_units: 10, event_count: 2, version: 0 });

    // Re-run with no new events: identical totals, version bumps (observable
    // that it re-ran, but the totals are deterministic from raw events).
    await ctx.aggregation.recomputeWindow(customerId, windowStart);
    const second = await readWindow();
    expect(second).toMatchObject({ total_units: 10, event_count: 2, version: 1 });
  });

  it('absorbs a late event into an open window on re-aggregation', async () => {
    await ctx.events.ingest(customerId, null, {
      events: [evt('a', '2026-05-01T10:05:00.000Z', 10)],
    });
    await ctx.aggregation.recomputeWindow(customerId, windowStart);
    expect(await readWindow()).toMatchObject({ total_units: 10, version: 0 });

    // A late event lands in the same (still-open) hour; re-aggregate.
    await ctx.events.ingest(customerId, null, {
      events: [evt('late', '2026-05-01T10:30:00.000Z', 5)],
    });
    await ctx.aggregation.recomputeWindow(customerId, windowStart);
    expect(await readWindow()).toMatchObject({ total_units: 15, event_count: 2, version: 1 });
  });

  it('never lets two concurrent workers claim the same job (SKIP LOCKED)', async () => {
    // Enqueue 10 distinct aggregate jobs.
    const specs = Array.from({ length: 10 }, (_, i) => ({
      type: AGGREGATE_WINDOW_JOB,
      payload: { customerId, windowStart: `2026-05-01T${String(i).padStart(2, '0')}:00:00.000Z` },
      dedupeKey: `agg:${customerId}:${i}`,
    }));
    await ctx.queue.enqueue(specs);

    // Two workers race to drain the queue.
    const [w1, w2] = await Promise.all([
      ctx.queue.claim(AGGREGATE_WINDOW_JOB, 10, 'worker-1'),
      ctx.queue.claim(AGGREGATE_WINDOW_JOB, 10, 'worker-2'),
    ]);

    const ids1 = new Set(w1.map((j) => j.id));
    const ids2 = new Set(w2.map((j) => j.id));
    const overlap = [...ids1].filter((id) => ids2.has(id));
    expect(overlap).toEqual([]); // disjoint — no job claimed twice
    expect(ids1.size + ids2.size).toBe(10); // every job claimed exactly once

    // All claimed jobs are now 'running'; none left pending.
    const [{ pending }] = await ctx.ds.query(
      `SELECT COUNT(*)::int AS pending FROM jobs WHERE type = $1 AND status = 'pending'`,
      [AGGREGATE_WINDOW_JOB],
    );
    expect(pending).toBe(0);
  });

  it('dedupes active jobs for the same window (partial unique index)', async () => {
    const spec = {
      type: AGGREGATE_WINDOW_JOB,
      payload: { customerId, windowStart },
      dedupeKey: `agg:${customerId}:${windowStart}`,
    };
    await ctx.queue.enqueue([spec]);
    await ctx.queue.enqueue([spec]); // same dedupe key while still pending

    const [{ count }] = await ctx.ds.query(
      `SELECT COUNT(*)::int AS count FROM jobs WHERE type = $1`,
      [AGGREGATE_WINDOW_JOB],
    );
    expect(count).toBe(1);
  });
});
