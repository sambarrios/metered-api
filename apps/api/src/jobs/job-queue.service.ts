import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { generateId } from '../common/id';
import { Job } from '../database/entities/job.entity';
import { NewJob } from './job-types';

/** A job claimed off the queue, ready to process. */
export interface ClaimedJob<P = Record<string, unknown>> {
  id: string;
  payload: P;
}

/**
 * Postgres-backed work queue. Concurrency safety comes from claiming rows with
 * `FOR UPDATE SKIP LOCKED` and atomically flipping them to `running`, so two
 * overlapping workers never grab the same job.
 */
@Injectable()
export class JobQueueService {
  constructor(
    @InjectRepository(Job)
    private readonly jobs: Repository<Job>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Insert jobs, skipping any that collide on the active-dedupe index
   * (`ON CONFLICT DO NOTHING`). Pass `manager` to enqueue inside a caller's
   * transaction (e.g. atomically with the events that produced the work).
   */
  async enqueue(specs: NewJob[], manager?: EntityManager): Promise<void> {
    if (specs.length === 0) {
      return;
    }
    const em = manager ?? this.dataSource.manager;
    const rows = specs.map((s) => ({
      id: generateId('job'),
      type: s.type,
      payload: s.payload ?? null,
      dedupeKey: s.dedupeKey ?? null,
      scheduledFor: s.scheduledFor ?? new Date(),
    }));
    // Cast: TypeORM types a jsonb object column as a nested partial, not a value.
    await em
      .createQueryBuilder()
      .insert()
      .into(Job)
      .values(rows as unknown as QueryDeepPartialEntity<Job>[])
      .orIgnore()
      .execute();
  }

  /**
   * Claim up to `limit` due jobs of `type`: select them `FOR UPDATE SKIP
   * LOCKED` and mark them `running` in one transaction.
   */
  async claim<P = Record<string, unknown>>(
    type: string,
    limit: number,
    worker: string,
  ): Promise<ClaimedJob<P>[]> {
    return this.dataSource.transaction(async (em) => {
      const rows: { id: string; payload: P }[] = await em.query(
        `SELECT id, payload FROM jobs
           WHERE type = $1 AND status = 'pending' AND scheduled_for <= now()
           ORDER BY scheduled_for
           FOR UPDATE SKIP LOCKED
           LIMIT $2`,
        [type, limit],
      );
      if (rows.length === 0) {
        return [];
      }
      const ids = rows.map((r) => r.id);
      await em.query(
        `UPDATE jobs SET status = 'running', locked_at = now(), locked_by = $2, attempts = attempts + 1
           WHERE id = ANY($1)`,
        [ids, worker],
      );
      return rows;
    });
  }

  async complete(id: string): Promise<void> {
    await this.jobs.update(id, { status: 'done', lockedAt: null, lockedBy: null });
  }

  async fail(id: string): Promise<void> {
    await this.jobs.update(id, { status: 'failed', lockedAt: null, lockedBy: null });
  }
}
