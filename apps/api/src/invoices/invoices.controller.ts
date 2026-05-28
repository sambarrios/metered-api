import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { CurrentCustomer } from '../auth/current-customer.decorator';
import { Page, PaginationQueryDto } from '../common/dto/pagination.dto';
import { InvoiceQueryService } from './invoice-query.service';
import { InvoiceView } from './invoice.types';

@Controller('v1/invoices')
@UseGuards(ApiKeyGuard)
export class InvoicesController {
  constructor(private readonly invoices: InvoiceQueryService) {}

  @Get()
  list(
    @CurrentCustomer() customerId: string,
    @Query() q: PaginationQueryDto,
  ): Promise<Page<InvoiceView>> {
    return this.invoices.list(customerId, q);
  }

  // Cross-tenant or unknown id -> 404 (not 403), so existence isn't leaked.
  @Get(':id')
  get(
    @CurrentCustomer() customerId: string,
    @Param('id') id: string,
  ): Promise<InvoiceView> {
    return this.invoices.get(customerId, id);
  }
}
