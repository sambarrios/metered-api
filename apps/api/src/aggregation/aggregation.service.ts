import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { generateId } from '../common/id';
import { ONE_HOUR_MS } from '../common/time';

/**
 * Recomputes hourly usage windows from raw events. The recompute is a pure
 * function of usage_events for that hour, written with an idempotent upsert —
 * running it twice yields identical totals (the `version` counter just records
 * how many times it ran, so a late-event re-aggregation is observable).
 */
@Injectable()
export class AggregationService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async recomputeWindow(customerId: string, windowStartIso: string): Promise<void> {
    const start = new Date(windowStartIso);
    const end = new Date(start.getTime() + ONE_HOUR_MS);

    const [agg] = await this.dataSource.query<
      { total_units: string; event_count: number; last_event_ts: Date | null }[]
    >(
      `SELECT COALESCE(SUM(units), 0)::bigint AS total_units,
              COUNT(*)::int                   AS event_count,
              MAX(event_ts)                   AS last_event_ts
         FROM usage_events
        WHERE customer_id = $1 AND event_ts >= $2 AND event_ts < $3`,
      [customerId, start.toISOString(), end.toISOString()],
    );

    await this.dataSource.query(
      `INSERT INTO usage_windows
         (id, customer_id, window_start, total_units, event_count, last_event_ts, state, version)
       VALUES ($1, $2, $3, $4, $5, $6, 'open', 0)
       ON CONFLICT (customer_id, window_start) DO UPDATE SET
         total_units   = EXCLUDED.total_units,
         event_count   = EXCLUDED.event_count,
         last_event_ts = EXCLUDED.last_event_ts,
         version       = usage_windows.version + 1`,
      [
        generateId('win'),
        customerId,
        start.toISOString(),
        agg.total_units,
        agg.event_count,
        agg.last_event_ts,
      ],
    );
  }
}
