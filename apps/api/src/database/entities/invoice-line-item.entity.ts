import { Column, CreateDateColumn, Entity, Index } from 'typeorm';
import { bigintTransformer } from '../../common/transformers';
import { PrefixedEntity } from './base.entity';

@Entity('invoice_line_items')
@Index('idx_line_items_invoice', ['invoiceId'])
export class InvoiceLineItem extends PrefixedEntity {
  protected idPrefix(): string {
    return 'li';
  }

  @Column({ name: 'invoice_id', type: 'text' })
  invoiceId!: string;

  @Column('text')
  description!: string;

  @Column({ type: 'bigint', default: 0, transformer: bigintTransformer })
  units!: number;

  @Column({ name: 'rate_microdollars', type: 'int', default: 0 })
  rateMicroDollars!: number;

  @Column({ name: 'amount_cents', type: 'int', default: 0 })
  amountCents!: number;

  @Column({ type: 'boolean', default: false })
  overridden!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
