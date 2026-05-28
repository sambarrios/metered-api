import { Column, CreateDateColumn, Entity } from 'typeorm';
import { PrefixedEntity } from './base.entity';

@Entity('customers')
export class Customer extends PrefixedEntity {
  protected idPrefix(): string {
    return 'cus';
  }

  @Column('text')
  name!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
