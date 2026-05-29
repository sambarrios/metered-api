import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { generateApiKey } from '../common/api-key';
import { Page, PaginationQueryDto } from '../common/dto/pagination.dto';
import { ApiKey } from '../database/entities/api-key.entity';
import { Customer } from '../database/entities/customer.entity';
import { CustomerPlan } from '../database/entities/customer-plan.entity';
import { UsageWindow } from '../database/entities/usage-window.entity';
import { InvoiceQueryService } from '../invoices/invoice-query.service';
import {
  AnomalyView,
  CreatedApiKey,
  CreatedCustomer,
  CustomerDetail,
  CustomerSummary,
  UsageWindowView,
} from './ops.types';

/** How many recent windows the detail view surfaces. */
const RECENT_WINDOWS = 50;
/** Spike threshold: a window >= 10x the 30-day hourly average is flagged. */
const ANOMALY_MULTIPLE = 10;

@Injectable()
export class OpsCustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customers: Repository<Customer>,
    @InjectRepository(ApiKey)
    private readonly apiKeys: Repository<ApiKey>,
    @InjectRepository(UsageWindow)
    private readonly windows: Repository<UsageWindow>,
    private readonly invoiceQuery: InvoiceQueryService,
    private readonly dataSource: DataSource,
  ) {}

  /** All customers, newest first, each with a count of non-revoked keys. */
  async list(q: PaginationQueryDto): Promise<Page<CustomerSummary>> {
    const [rows, total] = await this.customers.findAndCount({
      order: { createdAt: 'DESC' },
      take: q.limit,
      skip: q.offset,
    });
    const activeKeyCounts = await this.activeKeyCounts(rows.map((c) => c.id));
    const data = rows.map((c) => this.toSummary(c, activeKeyCounts.get(c.id) ?? 0));
    return { data, page: { limit: q.limit, offset: q.offset, total } };
  }

  /**
   * Customer detail for the ops console: recent usage, invoices and anomaly
   * signals. Unknown id -> 404 (consistent with the customer-facing 404 policy).
   */
  async detail(id: string): Promise<CustomerDetail> {
    const customer = await this.customers.findOne({ where: { id } });
    if (!customer) {
      throw new NotFoundException('customer not found');
    }

    const activeKeyCount = await this.apiKeys.count({
      where: { customerId: id, revokedAt: IsNull() },
    });

    const windowRows = await this.windows.find({
      where: { customerId: id },
      order: { windowStart: 'DESC' },
      take: RECENT_WINDOWS,
    });
    const usage: UsageWindowView[] = windowRows.map((w) => ({
      windowStart: w.windowStart.toISOString(),
      totalUnits: w.totalUnits,
      eventCount: w.eventCount,
      lastEventTs: w.lastEventTs ? w.lastEventTs.toISOString() : null,
      version: w.version,
    }));

    const invoices = await this.invoiceQuery.list(id, { limit: 50, offset: 0 });
    const anomalies = await this.detectAnomalies(id);

    return {
      customer: this.toSummary(customer, activeKeyCount),
      usage,
      invoices: invoices.data,
      anomalies,
    };
  }

  async createCustomer(name: string): Promise<CreatedCustomer> {
    // New customers land on the default plan so invoicing has tiers to apply.
    const created = await this.dataSource.transaction(async (em) => {
      const customer = await em.save(em.create(Customer, { name }));
      await em.save(
        em.create(CustomerPlan, {
          customerId: customer.id,
          planId: 'pp_default',
          effectiveFrom: new Date(),
        }),
      );
      return customer;
    });
    return {
      id: created.id,
      name: created.name,
      createdAt: created.createdAt.toISOString(),
    };
  }

  /** Mint a key for a customer. Plaintext is returned once and never stored. */
  async createApiKey(customerId: string): Promise<CreatedApiKey> {
    const customer = await this.customers.findOne({ where: { id: customerId } });
    if (!customer) {
      throw new NotFoundException('customer not found');
    }
    const { plaintext, keyHash, keyPrefix } = generateApiKey();
    const key = await this.apiKeys.save(
      this.apiKeys.create({ customerId, keyHash, keyPrefix }),
    );
    return {
      id: key.id,
      customerId,
      keyPrefix,
      plaintext,
      createdAt: key.createdAt.toISOString(),
    };
  }

  private toSummary(c: Customer, activeKeyCount: number): CustomerSummary {
    return {
      id: c.id,
      name: c.name,
      createdAt: c.createdAt.toISOString(),
      activeKeyCount,
    };
  }

  private async activeKeyCounts(customerIds: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (customerIds.length === 0) {
      return counts;
    }
    const rows = await this.apiKeys
      .createQueryBuilder('k')
      .select('k.customer_id', 'customerId')
      .addSelect('COUNT(*)', 'count')
      .where('k.customer_id IN (:...ids)', { ids: customerIds })
      .andWhere('k.revoked_at IS NULL')
      .groupBy('k.customer_id')
      .getRawMany<{ customerId: string; count: string }>();
    for (const r of rows) {
      counts.set(r.customerId, Number(r.count));
    }
    return counts;
  }

  /**
   * Flag recent hourly windows that spike >= ANOMALY_MULTIPLE x the customer's
   * own 30-day average hourly volume. Cheap heuristic for the ops console — a
   * per-customer baseline so a naturally high-volume customer isn't flagged for
   * its normal traffic.
   */
  private async detectAnomalies(customerId: string): Promise<AnomalyView[]> {
    const rows = await this.dataSource.query<
      { window_start: Date; total_units: string; avg_units: string }[]
    >(
      `
      WITH stats AS (
        SELECT AVG(total_units)::float AS avg_units
        FROM usage_windows
        WHERE customer_id = $1
          AND window_start >= now() - interval '30 days'
      )
      SELECT w.window_start, w.total_units, s.avg_units
      FROM usage_windows w, stats s
      WHERE w.customer_id = $1
        AND w.window_start >= now() - interval '30 days'
        AND s.avg_units > 0
        AND w.total_units >= $2 * s.avg_units
      ORDER BY w.window_start DESC
      `,
      [customerId, ANOMALY_MULTIPLE],
    );
    return rows.map((r) => {
      const avg = Number(r.avg_units);
      const units = Number(r.total_units);
      return {
        windowStart: new Date(r.window_start).toISOString(),
        totalUnits: units,
        thirtyDayAvgUnits: Math.round(avg),
        ratio: Math.round((units / avg) * 10) / 10,
      };
    });
  }
}
