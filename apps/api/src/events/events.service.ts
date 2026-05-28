import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { generateId } from '../common/id';
import { floorToHourUtc } from '../common/time';
import { UsageEvent } from '../database/entities/usage-event.entity';
import { AGGREGATE_WINDOW_JOB } from '../jobs/job-types';
import { JobQueueService } from '../jobs/job-queue.service';
import { IngestEventsDto, IngestResultDto } from './events.dto';

@Injectable()
export class EventsService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly queue: JobQueueService,
  ) {}

  /**
   * Idempotent batch ingest. Intra-batch duplicate request_ids collapse here
   * (first wins); cross-request replays collapse at the UNIQUE(request_id)
   * constraint via `ON CONFLICT DO NOTHING`. `accepted` = rows actually
   * inserted (RETURNING), so concurrent dup inserts also report correctly.
   *
   * The insert and the aggregation enqueue share one transaction: every hour
   * bucket touched by accepted events gets an aggregate job (deduped), so usage
   * windows are recomputed without the worker needing a scan watermark.
   */
  async ingest(
    customerId: string,
    apiKeyId: string | null,
    dto: IngestEventsDto,
  ): Promise<IngestResultDto> {
    const received = dto.events.length;

    const seen = new Set<string>();
    const rows: Array<{
      id: string;
      requestId: string;
      customerId: string;
      apiKeyId: string | null;
      endpoint: string;
      units: number;
      eventTs: Date;
    }> = [];
    for (const e of dto.events) {
      if (seen.has(e.requestId)) {
        continue;
      }
      seen.add(e.requestId);
      rows.push({
        id: generateId('evt'),
        requestId: e.requestId,
        customerId,
        // Attributed to the authenticating key, never a client-supplied value.
        apiKeyId,
        endpoint: e.endpoint,
        units: e.units,
        eventTs: new Date(e.timestamp),
      });
    }

    return this.dataSource.transaction(async (em) => {
      const result = await em
        .createQueryBuilder()
        .insert()
        .into(UsageEvent)
        .values(rows)
        .orIgnore() // ON CONFLICT (request_id) DO NOTHING
        .returning('id')
        .execute();

      const accepted = (result.raw as unknown[]).length;

      if (accepted > 0) {
        const windows = new Map<string, { customerId: string; windowStart: string }>();
        for (const r of rows) {
          const windowStart = floorToHourUtc(r.eventTs).toISOString();
          windows.set(`${r.customerId}|${windowStart}`, { customerId: r.customerId, windowStart });
        }
        await this.queue.enqueue(
          [...windows.values()].map((w) => ({
            type: AGGREGATE_WINDOW_JOB,
            payload: w,
            dedupeKey: `agg:${w.customerId}:${w.windowStart}`,
          })),
          em,
        );
      }

      return { received, accepted, duplicates: received - accepted };
    });
  }
}
