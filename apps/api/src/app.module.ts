import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dataSourceOptions } from './database/data-source';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';
import { EventsModule } from './events/events.module';
import { UsageModule } from './usage/usage.module';
import { InvoicesModule } from './invoices/invoices.module';
import { OpsModule } from './ops/ops.module';
import { WebhooksModule } from './webhooks/webhooks.module';

// Phase 2: TypeORM wired with the shared dataSourceOptions (same config the
// migration CLI uses). Controllers still serve mocks until Phase 3 swaps in
// repositories. The API now requires Postgres to boot (`docker compose up db`).
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(dataSourceOptions),
    AuthModule,
    EventsModule,
    UsageModule,
    InvoicesModule,
    OpsModule,
    WebhooksModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
