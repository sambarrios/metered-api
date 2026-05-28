import { Column, CreateDateColumn, Entity, Index } from 'typeorm';
import { PrefixedEntity } from './base.entity';

@Entity('usage_events')
@Index('idx_usage_events_customer_ts', ['customerId', 'eventTs'])
export class UsageEvent extends PrefixedEntity {
  protected idPrefix(): string {
    return 'evt';
  }

  /** Client-supplied idempotency key; UNIQUE so replays collapse on insert. */
  @Column({ name: 'request_id', type: 'text', unique: true })
  requestId!: string;

  @Column({ name: 'customer_id', type: 'text' })
  customerId!: string;

  @Column({ name: 'api_key_id', type: 'text', nullable: true })
  apiKeyId!: string | null;

  @Column('text')
  endpoint!: string;

  @Column({ type: 'int' })
  units!: number;

  /** When the usage happened (drives windowing); may arrive late/out-of-order. */
  @Column({ name: 'event_ts', type: 'timestamptz' })
  eventTs!: Date;

  @CreateDateColumn({ name: 'received_at', type: 'timestamptz' })
  receivedAt!: Date;
}
