import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { CurrentCustomer } from '../auth/current-customer.decorator';
import { Page, PaginationQueryDto } from '../common/dto/pagination.dto';
import { Query } from '@nestjs/common';
import { InvoiceView, mockInvoice } from './invoice.types';

@Controller('v1/invoices')
@UseGuards(ApiKeyGuard)
export class InvoicesController {
  // MOCK. Phase 3: SELECT ... WHERE customer_id = customerId, paged.
  @Get()
  list(
    @CurrentCustomer() customerId: string,
    @Query() q: PaginationQueryDto,
  ): Page<InvoiceView> {
    const data = [mockInvoice('inv_0001', customerId)];
    return { data, page: { limit: q.limit, offset: q.offset, total: data.length } };
  }

  // MOCK. Phase 3: SELECT ... WHERE id = :id AND customer_id = customerId.
  // Cross-tenant id guess returns 404 (not 403) — no existence leak.
  @Get(':id')
  get(
    @CurrentCustomer() customerId: string,
    @Param('id') id: string,
  ): InvoiceView {
    return mockInvoice(id, customerId);
  }
}
