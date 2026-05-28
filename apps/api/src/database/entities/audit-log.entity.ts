import { Column, CreateDateColumn, Entity, Index } from 'typeorm';
import { PrefixedEntity } from './base.entity';

/**
 * Append-only audit trail. Immutability is enforced at the DB layer (a BEFORE
 * UPDATE OR DELETE trigger raises) — see the InitialSchema migration.
 */
@Entity('audit_log')
@Index('idx_audit_entity', ['entityType', 'entityId'])
export class AuditLog extends PrefixedEntity {
  protected idPrefix(): string {
    return 'al';
  }

  @Column('text')
  actor!: string;

  @Column('text')
  action!: string;

  @Column({ name: 'entity_type', type: 'text' })
  entityType!: string;

  @Column({ name: 'entity_id', type: 'text' })
  entityId!: string;

  @Column({ name: 'before_json', type: 'jsonb', nullable: true })
  beforeJson!: Record<string, unknown> | null;

  @Column({ name: 'after_json', type: 'jsonb', nullable: true })
  afterJson!: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
