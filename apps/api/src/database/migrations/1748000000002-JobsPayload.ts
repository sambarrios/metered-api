import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Give jobs a payload (what to work on) and a dedupe key. The partial unique
 * index keeps at most one *active* (pending/running) job per key, so re-enqueue
 * is a no-op while work is outstanding but allowed again once it completes.
 */
export class JobsPayload1748000000002 implements MigrationInterface {
  name = 'JobsPayload1748000000002';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE jobs ADD COLUMN payload jsonb;`);
    await q.query(`ALTER TABLE jobs ADD COLUMN dedupe_key text;`);
    await q.query(`
      CREATE UNIQUE INDEX uq_jobs_active_dedupe ON jobs (dedupe_key)
        WHERE dedupe_key IS NOT NULL AND status IN ('pending', 'running');
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS uq_jobs_active_dedupe;`);
    await q.query(`ALTER TABLE jobs DROP COLUMN IF EXISTS dedupe_key;`);
    await q.query(`ALTER TABLE jobs DROP COLUMN IF EXISTS payload;`);
  }
}
