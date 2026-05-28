import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { InvoiceGenerationService } from './invoice-generation.service';
import { InvoiceWorker } from './invoice.worker';
import { InvoicesController } from './invoices.controller';

@Module({
  imports: [JobsModule],
  controllers: [InvoicesController],
  providers: [InvoiceGenerationService, InvoiceWorker],
})
export class InvoicesModule {}
