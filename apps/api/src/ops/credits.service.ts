import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { generateId } from '../common/id';
import { Customer } from '../database/entities/customer.entity';
import { IssueCreditDto } from './ops.dto';
import { CreditResult } from './ops.types';

interface CreditRow {
  id: string;
  customer_id: string;
  amount_cents: number;
  reason: string;
  idempotency_key: string;
  created_at: Date;
}

@Injectable()
export class CreditsService {
  private readonly logger = new Logger(CreditsService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(Customer)
    private readonly customers: Repository<Customer>,
  ) {}

  /**
   * Issue an account credit. Idempotent on the client-supplied key: the insert
   * and its audit row share one transaction, and a replay collides on the
   * UNIQUE idempotency_key (INSERT ... ON CONFLICT DO NOTHING) so a double-click
   * credits the customer exactly once. The staff actor is server-derived (from
   * the verified token), never client-supplied.
   */
  async issue(
    customerId: string,
    dto: IssueCreditDto,
    actor: string,
  ): Promise<CreditResult> {
    const customer = await this.customers.findOne({ where: { id: customerId } });
    if (!customer) {
      throw new NotFoundException('customer not found');
    }

    return this.dataSource.transaction(async (em) => {
      const inserted = await em.query<CreditRow[]>(
        `INSERT INTO credits (id, customer_id, invoice_id, amount_cents, reason, actor, idempotency_key)
         VALUES ($1, $2, NULL, $3, $4, $5, $6)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING id, customer_id, amount_cents, reason, idempotency_key, created_at`,
        [generateId('cr'), customerId, dto.amountCents, dto.reason, actor, dto.idempotencyKey],
      );

      if (inserted.length === 0) {
        // Replay: return the existing credit unchanged (idempotent). Guard
        // against the same key being reused for a different customer — that's a
        // real conflict, not a benign retry, and we must not leak/return another
        // tenant's credit.
        const existing = await em.query<CreditRow[]>(
          `SELECT id, customer_id, amount_cents, reason, idempotency_key, created_at
             FROM credits WHERE idempotency_key = $1`,
          [dto.idempotencyKey],
        );
        const row = existing[0];
        if (row.customer_id !== customerId) {
          throw new ConflictException('idempotency key already used');
        }
        this.logger.log(`replay of credit idempotency_key ${dto.idempotencyKey}; no-op`);
        return this.toResult(row, true);
      }

      const row = inserted[0];
      // Audit row in the SAME transaction: a credit is never recorded without
      // its append-only audit entry (and vice versa).
      await em.query(
        `INSERT INTO audit_log (id, actor, action, entity_type, entity_id, before_json, after_json, reason)
         VALUES ($1, $2, 'credit.issue', 'credit', $3, NULL, $4, $5)`,
        [
          generateId('al'),
          actor,
          row.id,
          JSON.stringify({ customerId, amountCents: dto.amountCents }),
          dto.reason,
        ],
      );

      return this.toResult(row, false);
    });
  }

  private toResult(row: CreditRow, deduplicated: boolean): CreditResult {
    return {
      id: row.id,
      customerId: row.customer_id,
      amountCents: Number(row.amount_cents),
      reason: row.reason,
      idempotencyKey: row.idempotency_key,
      createdAt: new Date(row.created_at).toISOString(),
      deduplicated,
    };
  }
}
