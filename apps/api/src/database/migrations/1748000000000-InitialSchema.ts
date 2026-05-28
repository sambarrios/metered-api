import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial schema: all tables, constraints, and indexes for the metering +
 * billing core. Hand-written (not auto-generated) so it can carry the bits
 * TypeORM can't express — CHECK constraints, the append-only audit trigger,
 * and the privilege REVOKE note for a multi-role deploy.
 */
export class InitialSchema1748000000000 implements MigrationInterface {
  name = 'InitialSchema1748000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE customers (
        id          text PRIMARY KEY,
        name        text NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now()
      );
    `);

    await q.query(`
      CREATE TABLE price_plans (
        id          text PRIMARY KEY,
        name        text NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now()
      );
    `);

    await q.query(`
      CREATE TABLE plan_tiers (
        id                 text PRIMARY KEY,
        plan_id            text NOT NULL REFERENCES price_plans(id) ON DELETE CASCADE,
        up_to_units        integer,
        rate_microdollars  integer NOT NULL,
        sort_order         integer NOT NULL,
        CONSTRAINT uq_plan_tiers_plan_sort UNIQUE (plan_id, sort_order),
        CONSTRAINT chk_plan_tiers_rate_nonneg CHECK (rate_microdollars >= 0)
      );
    `);

    await q.query(`
      CREATE TABLE customer_plans (
        id              text PRIMARY KEY,
        customer_id     text NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        plan_id         text NOT NULL REFERENCES price_plans(id),
        effective_from  timestamptz NOT NULL DEFAULT now()
      );
    `);
    await q.query(
      `CREATE INDEX idx_customer_plans_customer ON customer_plans (customer_id, effective_from);`,
    );

    await q.query(`
      CREATE TABLE api_keys (
        id           text PRIMARY KEY,
        customer_id  text NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        key_hash     text NOT NULL UNIQUE,
        key_prefix   text NOT NULL,
        created_at   timestamptz NOT NULL DEFAULT now(),
        revoked_at   timestamptz
      );
    `);
    await q.query(`CREATE INDEX idx_api_keys_customer ON api_keys (customer_id);`);

    await q.query(`
      CREATE TABLE usage_events (
        id           text PRIMARY KEY,
        request_id   text NOT NULL UNIQUE,
        customer_id  text NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        api_key_id   text REFERENCES api_keys(id),
        endpoint     text NOT NULL,
        units        integer NOT NULL,
        event_ts     timestamptz NOT NULL,
        received_at  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_usage_events_units_nonneg CHECK (units >= 0)
      );
    `);
    await q.query(
      `CREATE INDEX idx_usage_events_customer_ts ON usage_events (customer_id, event_ts);`,
    );

    await q.query(`
      CREATE TABLE usage_windows (
        id             text PRIMARY KEY,
        customer_id    text NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        window_start   timestamptz NOT NULL,
        total_units    bigint NOT NULL DEFAULT 0,
        event_count    integer NOT NULL DEFAULT 0,
        last_event_ts  timestamptz,
        state          text NOT NULL DEFAULT 'open',
        version        integer NOT NULL DEFAULT 0,
        CONSTRAINT uq_usage_windows_customer_start UNIQUE (customer_id, window_start),
        CONSTRAINT chk_usage_windows_state CHECK (state IN ('open', 'closed'))
      );
    `);

    await q.query(`
      CREATE TABLE invoices (
        id              text PRIMARY KEY,
        customer_id     text NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        period_start    timestamptz NOT NULL,
        period_end      timestamptz NOT NULL,
        status          text NOT NULL DEFAULT 'draft',
        subtotal_cents  integer NOT NULL DEFAULT 0,
        credits_cents   integer NOT NULL DEFAULT 0,
        total_cents     integer NOT NULL DEFAULT 0,
        issued_at       timestamptz,
        paid_at         timestamptz,
        created_at      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_invoices_customer_period UNIQUE (customer_id, period_start),
        CONSTRAINT chk_invoices_status CHECK (status IN ('draft', 'issued', 'paid'))
      );
    `);

    await q.query(`
      CREATE TABLE invoice_line_items (
        id                 text PRIMARY KEY,
        invoice_id         text NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        description        text NOT NULL,
        units              bigint NOT NULL DEFAULT 0,
        rate_microdollars  integer NOT NULL DEFAULT 0,
        amount_cents       integer NOT NULL DEFAULT 0,
        overridden         boolean NOT NULL DEFAULT false,
        created_at         timestamptz NOT NULL DEFAULT now()
      );
    `);
    await q.query(`CREATE INDEX idx_line_items_invoice ON invoice_line_items (invoice_id);`);

    await q.query(`
      CREATE TABLE credits (
        id               text PRIMARY KEY,
        customer_id      text NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        invoice_id       text REFERENCES invoices(id),
        amount_cents     integer NOT NULL,
        reason           text NOT NULL,
        actor            text NOT NULL,
        idempotency_key  text NOT NULL UNIQUE,
        created_at       timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_credits_amount_pos CHECK (amount_cents > 0)
      );
    `);
    await q.query(`CREATE INDEX idx_credits_customer ON credits (customer_id);`);

    await q.query(`
      CREATE TABLE audit_log (
        id           text PRIMARY KEY,
        actor        text NOT NULL,
        action       text NOT NULL,
        entity_type  text NOT NULL,
        entity_id    text NOT NULL,
        before_json  jsonb,
        after_json   jsonb,
        reason       text,
        created_at   timestamptz NOT NULL DEFAULT now()
      );
    `);
    await q.query(`CREATE INDEX idx_audit_entity ON audit_log (entity_type, entity_id);`);

    // Append-only enforcement. The trigger is the hard guard (works for any
    // role, including the table owner). In a multi-role deploy also run:
    //   REVOKE UPDATE, DELETE ON audit_log FROM <app_role>;
    await q.query(`
      CREATE OR REPLACE FUNCTION audit_log_block_mutation() RETURNS trigger
        LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'audit_log is append-only (% blocked)', TG_OP;
      END;
      $$;
    `);
    await q.query(`
      CREATE TRIGGER trg_audit_log_no_mutation
        BEFORE UPDATE OR DELETE ON audit_log
        FOR EACH ROW EXECUTE FUNCTION audit_log_block_mutation();
    `);

    await q.query(`
      CREATE TABLE payment_events (
        id           text PRIMARY KEY,
        delivery_id  text NOT NULL UNIQUE,
        signature    text,
        payload      jsonb NOT NULL,
        invoice_id   text REFERENCES invoices(id),
        status       text,
        received_at  timestamptz NOT NULL DEFAULT now(),
        processed_at timestamptz
      );
    `);

    await q.query(`
      CREATE TABLE jobs (
        id             text PRIMARY KEY,
        type           text NOT NULL,
        scheduled_for  timestamptz NOT NULL DEFAULT now(),
        status         text NOT NULL DEFAULT 'pending',
        locked_at      timestamptz,
        locked_by      text,
        attempts       integer NOT NULL DEFAULT 0,
        created_at     timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_jobs_status CHECK (status IN ('pending', 'running', 'done', 'failed'))
      );
    `);
    await q.query(`CREATE INDEX idx_jobs_claim ON jobs (status, scheduled_for);`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS jobs;`);
    await q.query(`DROP TABLE IF EXISTS payment_events;`);
    await q.query(`DROP TRIGGER IF EXISTS trg_audit_log_no_mutation ON audit_log;`);
    await q.query(`DROP FUNCTION IF EXISTS audit_log_block_mutation();`);
    await q.query(`DROP TABLE IF EXISTS audit_log;`);
    await q.query(`DROP TABLE IF EXISTS credits;`);
    await q.query(`DROP TABLE IF EXISTS invoice_line_items;`);
    await q.query(`DROP TABLE IF EXISTS invoices;`);
    await q.query(`DROP TABLE IF EXISTS usage_windows;`);
    await q.query(`DROP TABLE IF EXISTS usage_events;`);
    await q.query(`DROP TABLE IF EXISTS api_keys;`);
    await q.query(`DROP TABLE IF EXISTS customer_plans;`);
    await q.query(`DROP TABLE IF EXISTS plan_tiers;`);
    await q.query(`DROP TABLE IF EXISTS price_plans;`);
    await q.query(`DROP TABLE IF EXISTS customers;`);
  }
}
