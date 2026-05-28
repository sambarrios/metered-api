import { Column, CreateDateColumn, Entity } from 'typeorm';
import { PrefixedEntity } from './base.entity';

@Entity('payment_events')
export class PaymentEvent extends PrefixedEntity {
  protected idPrefix(): string {
    return 'pe';
  }

  /** Processor-supplied delivery id; UNIQUE so redeliveries are no-ops. */
  @Column({ name: 'delivery_id', type: 'text', unique: true })
  deliveryId!: string;

  @Column({ type: 'text', nullable: true })
  signature!: string | null;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ name: 'invoice_id', type: 'text', nullable: true })
  invoiceId!: string | null;

  @Column({ type: 'text', nullable: true })
  status!: string | null;

  @CreateDateColumn({ name: 'received_at', type: 'timestamptz' })
  receivedAt!: Date;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt!: Date | null;
}
