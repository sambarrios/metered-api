import { Column, Entity, Index } from 'typeorm';
import { PrefixedEntity } from './base.entity';

@Entity('plan_tiers')
@Index('uq_plan_tiers_plan_sort', ['planId', 'sortOrder'], { unique: true })
export class PlanTier extends PrefixedEntity {
  protected idPrefix(): string {
    return 'pt';
  }

  @Column({ name: 'plan_id', type: 'text' })
  planId!: string;

  /** Inclusive upper bound in units; null = unbounded final tier. */
  @Column({ name: 'up_to_units', type: 'int', nullable: true })
  upToUnits!: number | null;

  @Column({ name: 'rate_microdollars', type: 'int' })
  rateMicroDollars!: number;

  /** Tier ordering within the plan (0-based). */
  @Column({ name: 'sort_order', type: 'int' })
  sortOrder!: number;
}
