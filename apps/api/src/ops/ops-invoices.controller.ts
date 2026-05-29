import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import { CurrentStaff } from '../auth/current-staff.decorator';
import { StaffGuard } from '../auth/staff.guard';
import { OverrideLineItemDto } from './ops.dto';
import { OpsInvoicesService } from './ops-invoices.service';
import { OverrideResult } from './ops.types';

@Controller('ops/invoices')
@UseGuards(StaffGuard)
export class OpsInvoicesController {
  constructor(private readonly invoices: OpsInvoicesService) {}

  /**
   * Override a line item's amount. Updates the line, recomputes invoice totals,
   * and writes an immutable before/after audit_log row — all in one tx. Actor is
   * the verified staff token, never the body. Paid invoice -> 409.
   */
  @Patch(':id/line-items/:lineId')
  override(
    @Param('id') invoiceId: string,
    @Param('lineId') lineId: string,
    @Body() body: OverrideLineItemDto,
    @CurrentStaff() actor: string,
  ): Promise<OverrideResult> {
    return this.invoices.overrideLineItem(invoiceId, lineId, body, actor);
  }
}
