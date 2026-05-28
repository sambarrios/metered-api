import { Column, CreateDateColumn, Entity, Index } from 'typeorm';
import { PrefixedEntity } from './base.entity';

export type InvoiceStatus = 'draft' | 'issued' | 'paid';

@Entity('invoices')
@Index('uq_invoices_customer_period', ['customerId', 'periodStart'], { unique: true })
export class Invoice extends PrefixedEntity {
  protected idPrefix(): string {
    return 'inv';
  }

  @Column({ name: 'customer_id', type: 'text' })
  customerId!: string;

  @Column({ name: 'period_start', type: 'timestamptz' })
  periodStart!: Date;

  @Column({ name: 'period_end', type: 'timestamptz' })
  periodEnd!: Date;

  @Column({ type: 'text', default: 'draft' })
  status!: InvoiceStatus;

  @Column({ name: 'subtotal_cents', type: 'int', default: 0 })
  subtotalCents!: number;

  @Column({ name: 'credits_cents', type: 'int', default: 0 })
  creditsCents!: number;

  @Column({ name: 'total_cents', type: 'int', default: 0 })
  totalCents!: number;

  @Column({ name: 'issued_at', type: 'timestamptz', nullable: true })
  issuedAt!: Date | null;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
