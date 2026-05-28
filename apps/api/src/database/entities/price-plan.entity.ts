import { Column, CreateDateColumn, Entity } from 'typeorm';
import { PrefixedEntity } from './base.entity';

@Entity('price_plans')
export class PricePlan extends PrefixedEntity {
  protected idPrefix(): string {
    return 'pp';
  }

  @Column('text')
  name!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
