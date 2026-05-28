import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { generateId } from '../common/id';
import { UsageEvent } from '../database/entities/usage-event.entity';
import { IngestEventsDto, IngestResultDto } from './events.dto';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(UsageEvent)
    private readonly events: Repository<UsageEvent>,
  ) {}

  /**
   * Idempotent batch ingest. Intra-batch duplicate request_ids collapse here
   * (first wins); cross-request replays collapse at the UNIQUE(request_id)
   * constraint via `ON CONFLICT DO NOTHING`. `accepted` = rows actually
   * inserted (RETURNING), so concurrent dup inserts also report correctly.
   */
  async ingest(
    customerId: string,
    apiKeyId: string | null,
    dto: IngestEventsDto,
  ): Promise<IngestResultDto> {
    const received = dto.events.length;

    const seen = new Set<string>();
    const rows = [];
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

    const result = await this.events
      .createQueryBuilder()
      .insert()
      .into(UsageEvent)
      .values(rows)
      .orIgnore() // ON CONFLICT DO NOTHING
      .returning('id')
      .execute();

    const accepted = (result.raw as unknown[]).length;
    return { received, accepted, duplicates: received - accepted };
  }
}
