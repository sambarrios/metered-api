import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dataSourceOptions } from './database/data-source';
import { AccountModule } from './account/account.module';
import { AuthModule } from './auth/auth.module';
import { AggregationModule } from './aggregation/aggregation.module';
import { HealthController } from './health/health.controller';
import { EventsModule } from './events/events.module';
import { UsageModule } from './usage/usage.module';
import { InvoicesModule } from './invoices/invoices.module';
import { OpsModule } from './ops/ops.module';
import { WebhooksModule } from './webhooks/webhooks.module';

// TypeORM wired with the shared dataSourceOptions (same config the migration
// CLI uses); ScheduleModule drives the cron-based background workers. The API
// requires Postgres to boot (`docker compose up db`).
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(dataSourceOptions),
    ScheduleModule.forRoot(),
    AccountModule,
    AuthModule,
    EventsModule,
    UsageModule,
    InvoicesModule,
    OpsModule,
    WebhooksModule,
    AggregationModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
