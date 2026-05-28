import { Column, Entity, Index } from 'typeorm';
import { PrefixedEntity } from './base.entity';

@Entity('customer_plans')
@Index('idx_customer_plans_customer', ['customerId', 'effectiveFrom'])
export class CustomerPlan extends PrefixedEntity {
  protected idPrefix(): string {
    return 'cp';
  }

  @Column({ name: 'customer_id', type: 'text' })
  customerId!: string;

  @Column({ name: 'plan_id', type: 'text' })
  planId!: string;

  @Column({ name: 'effective_from', type: 'timestamptz' })
  effectiveFrom!: Date;
}
