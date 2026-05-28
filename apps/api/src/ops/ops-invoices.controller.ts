import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import { StaffGuard } from '../auth/staff.guard';
import { OverrideLineItemDto } from './ops.dto';

@Controller('ops/invoices')
@UseGuards(StaffGuard)
export class OpsInvoicesController {
  // MOCK line-item override. Phase 3: UPDATE line item + INSERT immutable
  // audit_log (actor, before/after, reason) in one tx; recompute invoice total.
  @Patch(':id/line-items/:lineId')
  override(
    @Param('id') invoiceId: string,
    @Param('lineId') lineId: string,
    @Body() body: OverrideLineItemDto,
  ) {
    return {
      invoiceId,
      lineItem: {
        id: lineId,
        amountCents: body.amountCents,
        overridden: true,
      },
      audit: {
        actor: 'staff_mock',
        action: 'line_item.override',
        before: { amountCents: 9000 },
        after: { amountCents: body.amountCents },
        reason: body.reason,
        at: new Date().toISOString(),
      },
    };
  }
}
