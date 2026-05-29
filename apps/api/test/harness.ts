import 'reflect-metadata';
import { join } from 'path';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ENTITIES } from '../src/database/data-source';
import { ApiKeyGuard } from '../src/auth/api-key.guard';
import { ApiKey } from '../src/database/entities/api-key.entity';
import { Customer } from '../src/database/entities/customer.entity';
import { Invoice } from '../src/database/entities/invoice.entity';
import { InvoiceLineItem } from '../src/database/entities/invoice-line-item.entity';
import { Job } from '../src/database/entities/job.entity';
import { UsageWindow } from '../src/database/entities/usage-window.entity';
import { AggregationService } from '../src/aggregation/aggregation.service';
import { EventsService } from '../src/events/events.service';
import { JobQueueService } from '../src/jobs/job-queue.service';
import { InvoiceGenerationService } from '../src/invoices/invoice-generation.service';
import { InvoiceQueryService } from '../src/invoices/invoice-query.service';
import { CreditsService } from '../src/ops/credits.service';
import { OpsCustomersService } from '../src/ops/ops-customers.service';
import { OpsInvoicesService } from '../src/ops/ops-invoices.service';
import { WebhooksService } from '../src/webhooks/webhooks.service';

/**
 * Integration-test harness. Talks to a real, throwaway Postgres database
 * (`metered_test`) so the correctness mechanisms under test — UNIQUE/ON
 * CONFLICT dedupe, FOR UPDATE SKIP LOCKED, advisory locks, the append-only
 * audit trigger — are exercised against the actual engine, not a mock.
 *
 * The test DB is created on demand and migrated; each test truncates the
 * mutable tables (keeping the seeded price plans). Run serially (--runInBand)
 * since all tests share the one database.
 */

export const TEST_WEBHOOK_SECRET = 'test-webhook-secret';
export const TEST_STAFF_SECRET = 'test-staff-secret';

const HOST = process.env.TEST_PG_HOST ?? 'localhost';
const PORT = process.env.TEST_PG_PORT ?? '5432';
const USER = process.env.TEST_PG_USER ?? 'metered';
const PASS = process.env.TEST_PG_PASSWORD ?? 'metered';
const TEST_DB = process.env.TEST_PG_DB ?? 'metered_test';
// Admin connection uses the always-present `metered` database to create the
// throwaway test DB.
const ADMIN_URL = `postgres://${USER}:${PASS}@${HOST}:${PORT}/metered`;
const TEST_URL = `postgres://${USER}:${PASS}@${HOST}:${PORT}/${TEST_DB}`;

const MIGRATIONS = [join(process.cwd(), 'src/database/migrations/*.{ts,js}')];

let prepared: Promise<void> | undefined;

/** Create the test database if absent and run migrations. Idempotent. */
async function prepareDatabase(): Promise<void> {
  // Admin connection to the always-present `metered` db. CREATE DATABASE can't
  // run inside a transaction; DataSource.query issues it standalone.
  const admin = new DataSource({ type: 'postgres', url: ADMIN_URL });
  await admin.initialize();
  try {
    const r: unknown[] = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      TEST_DB,
    ]);
    if (r.length === 0) {
      await admin.query(`CREATE DATABASE ${TEST_DB}`);
    }
  } finally {
    await admin.destroy();
  }

  const ds = new DataSource({
    type: 'postgres',
    url: TEST_URL,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    synchronize: false,
  });
  await ds.initialize();
  try {
    await ds.runMigrations();
  } finally {
    await ds.destroy();
  }
}

export function ensureTestDatabase(): Promise<void> {
  if (!prepared) {
    prepared = prepareDatabase();
  }
  return prepared;
}

export interface TestCtx {
  module: TestingModule;
  ds: DataSource;
  events: EventsService;
  queue: JobQueueService;
  aggregation: AggregationService;
  webhooks: WebhooksService;
  credits: CreditsService;
  opsCustomers: OpsCustomersService;
  opsInvoices: OpsInvoicesService;
  invoiceGen: InvoiceGenerationService;
  invoiceQuery: InvoiceQueryService;
  apiKeyGuard: ApiKeyGuard;
}

export async function createTestCtx(): Promise<TestCtx> {
  await ensureTestDatabase();

  // Secrets the webhook/staff code reads via ConfigService.
  process.env.WEBHOOK_SIGNING_SECRET = TEST_WEBHOOK_SECRET;
  process.env.STAFF_JWT_SECRET = TEST_STAFF_SECRET;

  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      TypeOrmModule.forRoot({
        type: 'postgres',
        url: TEST_URL,
        entities: ENTITIES,
        synchronize: false,
        migrationsRun: false,
      }),
      TypeOrmModule.forFeature([
        Job,
        Customer,
        ApiKey,
        UsageWindow,
        Invoice,
        InvoiceLineItem,
      ]),
    ],
    providers: [
      EventsService,
      JobQueueService,
      AggregationService,
      WebhooksService,
      CreditsService,
      OpsCustomersService,
      OpsInvoicesService,
      InvoiceGenerationService,
      InvoiceQueryService,
      ApiKeyGuard,
    ],
  }).compile();

  const ds = module.get(DataSource);
  await truncateAll(ds);

  return {
    module,
    ds,
    events: module.get(EventsService),
    queue: module.get(JobQueueService),
    aggregation: module.get(AggregationService),
    webhooks: module.get(WebhooksService),
    credits: module.get(CreditsService),
    opsCustomers: module.get(OpsCustomersService),
    opsInvoices: module.get(OpsInvoicesService),
    invoiceGen: module.get(InvoiceGenerationService),
    invoiceQuery: module.get(InvoiceQueryService),
    apiKeyGuard: module.get(ApiKeyGuard),
  };
}

/** Empty every mutable table; keep the migration-seeded price plans/tiers. */
export async function truncateAll(ds: DataSource): Promise<void> {
  const rows: { tablename: string }[] = await ds.query(
    `SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename NOT IN ('migrations', 'price_plans', 'plan_tiers')`,
  );
  if (rows.length === 0) {
    return;
  }
  const list = rows.map((r) => `"${r.tablename}"`).join(', ');
  // TRUNCATE doesn't fire the audit_log append-only trigger (that's BEFORE
  // UPDATE/DELETE), so the log clears cleanly between tests.
  await ds.query(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}
