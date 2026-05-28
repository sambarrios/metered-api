import { Column, CreateDateColumn, Entity, Index } from 'typeorm';
import { PrefixedEntity } from './base.entity';

@Entity('credits')
@Index('idx_credits_customer', ['customerId'])
export class Credit extends PrefixedEntity {
  protected idPrefix(): string {
    return 'cr';
  }

  @Column({ name: 'customer_id', type: 'text' })
  customerId!: string;

  @Column({ name: 'invoice_id', type: 'text', nullable: true })
  invoiceId!: string | null;

  @Column({ name: 'amount_cents', type: 'int' })
  amountCents!: number;

  @Column('text')
  reason!: string;

  @Column('text')
  actor!: string;

  /** Client-supplied; UNIQUE so a double-click issues the credit only once. */
  @Column({ name: 'idempotency_key', type: 'text', unique: true })
  idempotencyKey!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
