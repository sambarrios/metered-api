import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invoice } from '../database/entities/invoice.entity';
import { InvoiceLineItem } from '../database/entities/invoice-line-item.entity';
import { JobsModule } from '../jobs/jobs.module';
import { InvoiceGenerationService } from './invoice-generation.service';
import { InvoiceQueryService } from './invoice-query.service';
import { InvoiceWorker } from './invoice.worker';
import { InvoicesController } from './invoices.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Invoice, InvoiceLineItem]), JobsModule],
  controllers: [InvoicesController],
  providers: [InvoiceGenerationService, InvoiceQueryService, InvoiceWorker],
  // Ops customer-detail reuses the scoped invoice mapping.
  exports: [InvoiceQueryService],
})
export class InvoicesModule {}
