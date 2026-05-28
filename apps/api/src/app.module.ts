import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { EventsModule } from './events/events.module';
import { UsageModule } from './usage/usage.module';
import { InvoicesModule } from './invoices/invoices.module';
import { OpsModule } from './ops/ops.module';
import { WebhooksModule } from './webhooks/webhooks.module';

// NOTE: TypeOrmModule is intentionally NOT wired yet. Phase 1 serves mocked
// responses with no DB dependency so the API boots without Postgres.
// Phase 2 adds TypeOrmModule.forRootAsync + entities (see database/data-source.ts).
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventsModule,
    UsageModule,
    InvoicesModule,
    OpsModule,
    WebhooksModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
