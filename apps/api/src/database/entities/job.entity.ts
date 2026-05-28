import { Column, CreateDateColumn, Entity, Index } from 'typeorm';
import { PrefixedEntity } from './base.entity';

export type JobStatus = 'pending' | 'running' | 'done' | 'failed';

/**
 * Background work queue claimed with `SELECT ... FOR UPDATE SKIP LOCKED` so a
 * cron tick can run safely with overlap (aggregation, invoicing).
 */
@Entity('jobs')
@Index('idx_jobs_claim', ['status', 'scheduledFor'])
export class Job extends PrefixedEntity {
  protected idPrefix(): string {
    return 'job';
  }

  @Column('text')
  type!: string;

  @Column({ name: 'scheduled_for', type: 'timestamptz' })
  scheduledFor!: Date;

  @Column({ type: 'text', default: 'pending' })
  status!: JobStatus;

  @Column({ name: 'locked_at', type: 'timestamptz', nullable: true })
  lockedAt!: Date | null;

  @Column({ name: 'locked_by', type: 'text', nullable: true })
  lockedBy!: string | null;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
