import 'reflect-metadata';
import { join } from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';
import { ApiKey } from './entities/api-key.entity';
import { AuditLog } from './entities/audit-log.entity';
import { Credit } from './entities/credit.entity';
import { Customer } from './entities/customer.entity';
import { CustomerPlan } from './entities/customer-plan.entity';
import { Invoice } from './entities/invoice.entity';
import { InvoiceLineItem } from './entities/invoice-line-item.entity';
import { Job } from './entities/job.entity';
import { PaymentEvent } from './entities/payment-event.entity';
import { PlanTier } from './entities/plan-tier.entity';
import { PricePlan } from './entities/price-plan.entity';
import { UsageEvent } from './entities/usage-event.entity';
import { UsageWindow } from './entities/usage-window.entity';

// Load .env for the standalone migration CLI (ts-node). At runtime, Nest's
// ConfigModule has already populated process.env; re-loading is harmless.
// eslint-disable-next-line @typescript-eslint/no-var-requires
try {
  require('dotenv').config();
} catch {
  /* dotenv optional; rely on real env in containers */
}

/** Every entity, listed explicitly (robust across ts-node and compiled dist). */
export const ENTITIES = [
  ApiKey,
  AuditLog,
  Credit,
  Customer,
  CustomerPlan,
  Invoice,
  InvoiceLineItem,
  Job,
  PaymentEvent,
  PlanTier,
  PricePlan,
  UsageEvent,
  UsageWindow,
];

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL ?? 'postgres://metered:metered@localhost:5432/metered',
  entities: ENTITIES,
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  synchronize: false,
  logging: process.env.DB_LOGGING === 'true',
};

// Default export consumed by the TypeORM CLI (migration:generate/run/revert).
export default new DataSource(dataSourceOptions);
