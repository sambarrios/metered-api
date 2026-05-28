import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IsISO8601, IsOptional, IsString } from 'class-validator';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { CurrentCustomer } from '../auth/current-customer.decorator';
import { PaginationQueryDto, Page } from '../common/dto/pagination.dto';

export class UsageQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsString()
  apiKeyId?: string;
}

interface UsageWindowView {
  windowStart: string;
  totalUnits: number;
  eventCount: number;
}

@Controller('v1/usage')
@UseGuards(ApiKeyGuard)
export class UsageController {
  // MOCK: returns two hourly windows. Phase 3: query usage_windows WHERE
  // customer_id = customerId AND window_start BETWEEN from/to, paged.
  @Get()
  list(
    @CurrentCustomer() customerId: string,
    @Query() q: UsageQueryDto,
  ): Page<UsageWindowView> {
    void customerId;
    void q;
    const data: UsageWindowView[] = [
      { windowStart: '2026-05-28T10:00:00.000Z', totalUnits: 12500, eventCount: 4200 },
      { windowStart: '2026-05-28T11:00:00.000Z', totalUnits: 9800, eventCount: 3100 },
    ];
    return { data, page: { limit: q.limit, offset: q.offset, total: data.length } };
  }
}
