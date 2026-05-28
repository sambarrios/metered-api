import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { Page } from '../common/dto/pagination.dto';
import { UsageWindow } from '../database/entities/usage-window.entity';
import { UsageQueryDto, UsageWindowView } from './usage.dto';

@Injectable()
export class UsageService {
  constructor(
    @InjectRepository(UsageWindow)
    private readonly windows: Repository<UsageWindow>,
  ) {}

  /**
   * List a customer's hourly usage windows, newest first. Scoped to the
   * authenticated customer at the query layer — a cross-tenant window is
   * simply not in the result set (no row to leak). Windows aggregate all of
   * the customer's keys for the hour, so there is no per-api-key filter here.
   */
  async list(customerId: string, q: UsageQueryDto): Promise<Page<UsageWindowView>> {
    const where: Record<string, unknown> = { customerId };
    if (q.from && q.to) {
      where.windowStart = Between(new Date(q.from), new Date(q.to));
    } else if (q.from) {
      where.windowStart = MoreThanOrEqual(new Date(q.from));
    } else if (q.to) {
      where.windowStart = LessThanOrEqual(new Date(q.to));
    }

    const [rows, total] = await this.windows.findAndCount({
      where,
      order: { windowStart: 'DESC' },
      take: q.limit,
      skip: q.offset,
    });

    const data: UsageWindowView[] = rows.map((w) => ({
      windowStart: w.windowStart.toISOString(),
      totalUnits: w.totalUnits,
      eventCount: w.eventCount,
      lastEventTs: w.lastEventTs ? w.lastEventTs.toISOString() : null,
      version: w.version,
    }));

    return { data, page: { limit: q.limit, offset: q.offset, total } };
  }
}
