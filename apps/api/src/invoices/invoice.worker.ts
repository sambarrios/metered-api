import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { hostname } from 'os';
import { DataSource } from 'typeorm';
import { addMonthsUtc, floorToMonthUtc } from '../common/time';
import {
  GENERATE_INVOICE_JOB,
  GenerateInvoicePayload,
  NewJob,
} from '../jobs/job-types';
import { JobQueueService } from '../jobs/job-queue.service';
import { InvoiceGenerationService } from './invoice-generation.service';

const BATCH_SIZE = 25;

/**
 * Owns invoice generation off the locked job table. `drain` claims jobs with
 * SKIP LOCKED so overlapping ticks are safe; `closePreviousMonth` is the
 * monthly trigger that enqueues a deduped job per customer with usage in the
 * just-closed period.
 */
@Injectable()
export class InvoiceWorker {
  private readonly logger = new Logger(InvoiceWorker.name);
  private readonly workerId = `${hostname()}#${process.pid}`;

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly queue: JobQueueService,
    private readonly generation: InvoiceGenerationService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async drain(): Promise<void> {
    const jobs = await this.queue.claim<GenerateInvoicePayload>(
      GENERATE_INVOICE_JOB,
      BATCH_SIZE,
      this.workerId,
    );
    for (const job of jobs) {
      try {
        await this.generation.generateInvoice(job.payload.customerId, job.payload.periodStart);
        await this.queue.complete(job.id);
      } catch (err) {
        this.logger.error(`invoice job ${job.id} failed`, err as Error);
        await this.queue.fail(job.id);
      }
    }
  }

  /** At 02:00 UTC on the 1st, enqueue invoices for the month that just closed. */
  @Cron('0 2 1 * *', { timeZone: 'UTC' })
  async closePreviousMonth(): Promise<void> {
    const previousPeriod = addMonthsUtc(floorToMonthUtc(new Date()), -1);
    const enqueued = await this.enqueuePeriod(previousPeriod.toISOString());
    this.logger.log(`closed ${previousPeriod.toISOString()}: enqueued ${enqueued} invoice job(s)`);
  }

  /**
   * Enqueue a generate_invoice job for every customer that has usage windows in
   * the period. Deduped on `inv:<customer>:<period>` so re-running (or a manual
   * trigger plus the cron) can't double-enqueue while one is pending/running.
   */
  async enqueuePeriod(periodStartIso: string): Promise<number> {
    const periodEnd = addMonthsUtc(new Date(periodStartIso), 1).toISOString();
    const customers = await this.dataSource.query<{ customer_id: string }[]>(
      `SELECT DISTINCT customer_id FROM usage_windows
        WHERE window_start >= $1 AND window_start < $2`,
      [periodStartIso, periodEnd],
    );

    const specs: NewJob[] = customers.map((c) => ({
      type: GENERATE_INVOICE_JOB,
      payload: { customerId: c.customer_id, periodStart: periodStartIso },
      dedupeKey: `inv:${c.customer_id}:${periodStartIso}`,
    }));
    await this.queue.enqueue(specs);
    return specs.length;
  }
}
