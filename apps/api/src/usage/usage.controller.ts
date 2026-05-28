import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { CurrentCustomer } from '../auth/current-customer.decorator';
import { Page } from '../common/dto/pagination.dto';
import { UsageQueryDto, UsageWindowView } from './usage.dto';
import { UsageService } from './usage.service';

@Controller('v1/usage')
@UseGuards(ApiKeyGuard)
export class UsageController {
  constructor(private readonly usage: UsageService) {}

  @Get()
  list(
    @CurrentCustomer() customerId: string,
    @Query() q: UsageQueryDto,
  ): Promise<Page<UsageWindowView>> {
    return this.usage.list(customerId, q);
  }
}
