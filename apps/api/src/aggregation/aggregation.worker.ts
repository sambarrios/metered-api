import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { hostname } from 'os';
import { AGGREGATE_WINDOW_JOB, AggregateWindowPayload } from '../jobs/job-types';
import { JobQueueService } from '../jobs/job-queue.service';
import { AggregationService } from './aggregation.service';

const BATCH_SIZE = 50;

/**
 * Drains aggregate_window jobs on a cron. Overlapping ticks are safe: the queue
 * claims with SKIP LOCKED, so a second tick picks up different jobs (or none).
 */
@Injectable()
export class AggregationWorker {
  private readonly logger = new Logger(AggregationWorker.name);
  private readonly workerId = `${hostname()}#${process.pid}`;

  constructor(
    private readonly queue: JobQueueService,
    private readonly aggregation: AggregationService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async tick(): Promise<void> {
    const jobs = await this.queue.claim<AggregateWindowPayload>(
      AGGREGATE_WINDOW_JOB,
      BATCH_SIZE,
      this.workerId,
    );
    for (const job of jobs) {
      try {
        await this.aggregation.recomputeWindow(job.payload.customerId, job.payload.windowStart);
        await this.queue.complete(job.id);
      } catch (err) {
        this.logger.error(`aggregate job ${job.id} failed`, err as Error);
        await this.queue.fail(job.id);
      }
    }
  }
}
