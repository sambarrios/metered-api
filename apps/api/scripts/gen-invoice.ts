import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { InvoiceGenerationService } from '../src/invoices/invoice-generation.service';

/**
 * Dev-only: generate (or regenerate) a draft invoice for a customer + billing
 * period by driving the real InvoiceGenerationService, without waiting for the
 * monthly cron. Useful for populating the dashboards locally.
 *
 *   npm run gen:invoice -- <customerId> [periodStartIso]
 *
 * periodStartIso defaults to the start of the current UTC month.
 */
function currentMonthStartIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

async function main(): Promise<void> {
  const customerId = process.argv[2];
  if (!customerId) {
    console.error('Usage: npm run gen:invoice -- <customerId> [periodStartIso]');
    process.exit(1);
  }
  const periodStart = process.argv[3] ?? currentMonthStartIso();

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const svc = app.get(InvoiceGenerationService);
    const result = await svc.generateInvoice(customerId, periodStart);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
