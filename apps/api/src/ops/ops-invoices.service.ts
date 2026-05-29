import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { generateId } from '../common/id';
import { OverrideLineItemDto } from './ops.dto';
import { OverrideResult } from './ops.types';

interface InvoiceRow {
  id: string;
  status: string;
  credits_cents: number;
}
interface LineRow {
  id: string;
  amount_cents: number;
  overridden: boolean;
}

@Injectable()
export class OpsInvoicesService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Override a single line item's amount. One transaction: lock the invoice,
   * update the line, recompute the invoice totals from the line items, and write
   * the before/after to the append-only audit_log. A paid invoice is frozen
   * (409) — corrections to a settled invoice are made with a credit, not an edit.
   */
  async overrideLineItem(
    invoiceId: string,
    lineId: string,
    dto: OverrideLineItemDto,
    actor: string,
  ): Promise<OverrideResult> {
    return this.dataSource.transaction(async (em) => {
      // Lock the invoice so a concurrent override / payment can't race the
      // total recompute.
      const invoices = await em.query<InvoiceRow[]>(
        `SELECT id, status, credits_cents FROM invoices WHERE id = $1 FOR UPDATE`,
        [invoiceId],
      );
      const invoice = invoices[0];
      if (!invoice) {
        throw new NotFoundException('invoice not found');
      }
      if (invoice.status === 'paid') {
        throw new ConflictException('cannot override a line on a paid invoice; issue a credit');
      }

      // Line must belong to this invoice — scoping prevents editing another
      // invoice's line via a guessed id (and 404, not 403, leaks nothing).
      const lines = await em.query<LineRow[]>(
        `SELECT id, amount_cents, overridden FROM invoice_line_items
          WHERE id = $1 AND invoice_id = $2`,
        [lineId, invoiceId],
      );
      const line = lines[0];
      if (!line) {
        throw new NotFoundException('line item not found');
      }

      const before = { amountCents: Number(line.amount_cents), overridden: line.overridden };

      await em.query(
        `UPDATE invoice_line_items SET amount_cents = $1, overridden = true WHERE id = $2`,
        [dto.amountCents, lineId],
      );

      // Recompute totals from the line items (subtotal = sum of lines, the same
      // invariant the generator holds), then total = subtotal - credits.
      const sums = await em.query<{ subtotal: string }[]>(
        `SELECT COALESCE(SUM(amount_cents), 0)::int AS subtotal
           FROM invoice_line_items WHERE invoice_id = $1`,
        [invoiceId],
      );
      const subtotalCents = Number(sums[0].subtotal);
      const totalCents = subtotalCents - Number(invoice.credits_cents);

      await em.query(
        `UPDATE invoices SET subtotal_cents = $1, total_cents = $2 WHERE id = $3`,
        [subtotalCents, totalCents, invoiceId],
      );

      const after = { amountCents: dto.amountCents, overridden: true };
      await em.query(
        `INSERT INTO audit_log (id, actor, action, entity_type, entity_id, before_json, after_json, reason)
         VALUES ($1, $2, 'line_item.override', 'invoice_line_item', $3, $4, $5, $6)`,
        [
          generateId('al'),
          actor,
          lineId,
          JSON.stringify(before),
          JSON.stringify(after),
          dto.reason,
        ],
      );

      return {
        invoiceId,
        lineItem: { id: lineId, amountCents: dto.amountCents, overridden: true },
        subtotalCents,
        totalCents,
      };
    });
  }
}
