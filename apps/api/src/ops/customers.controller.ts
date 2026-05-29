import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { StaffGuard } from '../auth/staff.guard';
import { Page, PaginationQueryDto } from '../common/dto/pagination.dto';
import { CreateCustomerDto, IssueCreditDto } from './ops.dto';
import { OpsCustomersService } from './ops-customers.service';
import {
  CreatedApiKey,
  CreatedCustomer,
  CustomerDetail,
  CustomerSummary,
} from './ops.types';

@Controller('ops/customers')
@UseGuards(StaffGuard)
export class OpsCustomersController {
  constructor(private readonly customers: OpsCustomersService) {}

  @Get()
  list(@Query() q: PaginationQueryDto): Promise<Page<CustomerSummary>> {
    return this.customers.list(q);
  }

  /** Detail: recent usage + invoices + anomaly signals. Unknown id -> 404. */
  @Get(':id')
  detail(@Param('id') id: string): Promise<CustomerDetail> {
    return this.customers.detail(id);
  }

  @Post()
  @HttpCode(201)
  create(@Body() body: CreateCustomerDto): Promise<CreatedCustomer> {
    return this.customers.createCustomer(body.name);
  }

  /** Mint a key; plaintext is in the response ONCE, then only the hash persists. */
  @Post(':id/api-keys')
  @HttpCode(201)
  createApiKey(@Param('id') id: string): Promise<CreatedApiKey> {
    return this.customers.createApiKey(id);
  }

  // MOCK issue credit. Next unit: INSERT credits (idempotency_key UNIQUE) +
  // audit_log row in one tx; second click with same key -> no-op.
  @Post(':id/credits')
  @HttpCode(201)
  issueCredit(@Param('id') id: string, @Body() body: IssueCreditDto) {
    return {
      id: 'cr_mock_0001',
      customerId: id,
      amountCents: body.amountCents,
      reason: body.reason,
      idempotencyKey: body.idempotencyKey,
      createdAt: new Date().toISOString(),
    };
  }
}
