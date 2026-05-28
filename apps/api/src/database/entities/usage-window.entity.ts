import { Column, Entity, Index } from 'typeorm';
import { bigintTransformer } from '../../common/transformers';
import { PrefixedEntity } from './base.entity';

export type UsageWindowState = 'open' | 'closed';

@Entity('usage_windows')
@Index('uq_usage_windows_customer_start', ['customerId', 'windowStart'], { unique: true })
export class UsageWindow extends PrefixedEntity {
  protected idPrefix(): string {
    return 'win';
  }

  @Column({ name: 'customer_id', type: 'text' })
  customerId!: string;

  /** Hourly bucket start (UTC, truncated). */
  @Column({ name: 'window_start', type: 'timestamptz' })
  windowStart!: Date;

  @Column({ name: 'total_units', type: 'bigint', default: 0, transformer: bigintTransformer })
  totalUnits!: number;

  @Column({ name: 'event_count', type: 'int', default: 0 })
  eventCount!: number;

  @Column({ name: 'last_event_ts', type: 'timestamptz', nullable: true })
  lastEventTs!: Date | null;

  @Column({ type: 'text', default: 'open' })
  state!: UsageWindowState;

  /** Bumped on re-aggregation (e.g. late events) so recomputes are observable. */
  @Column({ type: 'int', default: 0 })
  version!: number;
}
