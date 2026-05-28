import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { StaffGuard } from '../auth/staff.guard';
import { Page, PaginationQueryDto } from '../common/dto/pagination.dto';
import { Query } from '@nestjs/common';
import { mockInvoice } from '../invoices/invoice.types';
import { CreateApiKeyDto, CreateCustomerDto, IssueCreditDto } from './ops.dto';

interface CustomerSummary {
  id: string;
  name: string;
  createdAt: string;
}

@Controller('ops/customers')
@UseGuards(StaffGuard)
export class OpsCustomersController {
  // MOCK list.
  @Get()
  list(@Query() q: PaginationQueryDto): Page<CustomerSummary> {
    const data: CustomerSummary[] = [
      { id: 'cus_mock_0001', name: 'Acme Corp', createdAt: '2026-01-10T00:00:00.000Z' },
      { id: 'cus_mock_0002', name: 'Globex', createdAt: '2026-02-02T00:00:00.000Z' },
    ];
    return { data, page: { limit: q.limit, offset: q.offset, total: data.length } };
  }

  // MOCK detail: usage + invoices + anomaly signal (10x 30-day avg).
  @Get(':id')
  detail(@Param('id') id: string) {
    return {
      customer: { id, name: 'Acme Corp', createdAt: '2026-01-10T00:00:00.000Z' },
      usage: [
        { windowStart: '2026-05-28T10:00:00.000Z', totalUnits: 12500, eventCount: 4200 },
      ],
      invoices: [mockInvoice('inv_0001', id)],
      anomalies: [
        {
          windowStart: '2026-05-28T10:00:00.000Z',
          totalUnits: 12500,
          thirtyDayAvgUnits: 1100,
          ratio: 11.4,
          flagged: true,
        },
      ],
    };
  }

  // MOCK create customer.
  @Post()
  @HttpCode(201)
  create(@Body() body: CreateCustomerDto) {
    return {
      id: 'cus_mock_0003',
      name: body.name,
      createdAt: new Date().toISOString(),
    };
  }

  // MOCK create api key. Plaintext returned ONCE here; thereafter only the hash
  // is stored (Phase 3). Response never includes plaintext again.
  @Post(':id/api-keys')
  @HttpCode(201)
  createApiKey(@Param('id') id: string, @Body() body: CreateApiKeyDto) {
    return {
      id: 'key_mock_0001',
      customerId: id,
      label: body.label ?? 'default',
      plaintext: 'mk_demo01_show_this_once_only', // MOCK; real = crypto random, shown once
      createdAt: new Date().toISOString(),
    };
  }

  // MOCK issue credit. Phase 3: INSERT credits (idempotency_key UNIQUE) +
  // audit_log row in one tx; second click with same key -> 409/no-op.
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
