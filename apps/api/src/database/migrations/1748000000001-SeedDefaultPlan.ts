import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seed the default tiered plan from the brief:
 *   first 10k units free, next 90k @ $0.001, beyond @ $0.0005.
 * Fixed ids so the seed is deterministic and referenceable.
 */
export class SeedDefaultPlan1748000000001 implements MigrationInterface {
  name = 'SeedDefaultPlan1748000000001';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `INSERT INTO price_plans (id, name) VALUES ('pp_default', 'Default Metered Plan');`,
    );
    await q.query(`
      INSERT INTO plan_tiers (id, plan_id, up_to_units, rate_microdollars, sort_order) VALUES
        ('pt_default_0', 'pp_default', 10000,  0,    0),
        ('pt_default_1', 'pp_default', 100000, 1000, 1),
        ('pt_default_2', 'pp_default', NULL,   500,  2);
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM plan_tiers WHERE plan_id = 'pp_default';`);
    await q.query(`DELETE FROM price_plans WHERE id = 'pp_default';`);
  }
}
