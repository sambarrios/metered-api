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
import { CurrentStaff } from '../auth/current-staff.decorator';
import { StaffGuard } from '../auth/staff.guard';
import { Page, PaginationQueryDto } from '../common/dto/pagination.dto';
import { CreateCustomerDto, IssueCreditDto } from './ops.dto';
import { CreditsService } from './credits.service';
import { OpsCustomersService } from './ops-customers.service';
import {
  CreatedApiKey,
  CreatedCustomer,
  CreditResult,
  CustomerDetail,
  CustomerSummary,
} from './ops.types';

@Controller('ops/customers')
@UseGuards(StaffGuard)
export class OpsCustomersController {
  constructor(
    private readonly customers: OpsCustomersService,
    private readonly credits: CreditsService,
  ) {}

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

  /**
   * Issue an account credit. Idempotent on `idempotencyKey` (double-click ->
   * one credit). The actor is taken from the verified staff token, never the
   * body, and recorded in the append-only audit_log.
   */
  @Post(':id/credits')
  @HttpCode(201)
  issueCredit(
    @Param('id') id: string,
    @Body() body: IssueCreditDto,
    @CurrentStaff() actor: string,
  ): Promise<CreditResult> {
    return this.credits.issue(id, body, actor);
  }
}
