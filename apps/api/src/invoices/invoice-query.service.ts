import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Page, PaginationQueryDto } from '../common/dto/pagination.dto';
import { Invoice } from '../database/entities/invoice.entity';
import { InvoiceLineItem } from '../database/entities/invoice-line-item.entity';
import { InvoiceView, LineItemView } from './invoice.types';

@Injectable()
export class InvoiceQueryService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoices: Repository<Invoice>,
    @InjectRepository(InvoiceLineItem)
    private readonly lineItems: Repository<InvoiceLineItem>,
  ) {}

  /** A customer's invoices, newest period first, with their line items. */
  async list(customerId: string, q: PaginationQueryDto): Promise<Page<InvoiceView>> {
    const [rows, total] = await this.invoices.findAndCount({
      where: { customerId },
      order: { periodStart: 'DESC' },
      take: q.limit,
      skip: q.offset,
    });

    const linesByInvoice = await this.loadLines(rows.map((r) => r.id));
    const data = rows.map((inv) => this.toView(inv, linesByInvoice.get(inv.id) ?? []));
    return { data, page: { limit: q.limit, offset: q.offset, total } };
  }

  /**
   * A single invoice scoped to the caller. A cross-tenant id (or unknown id)
   * returns 404, not 403 — existence isn't leaked.
   */
  async get(customerId: string, id: string): Promise<InvoiceView> {
    const inv = await this.invoices.findOne({ where: { id, customerId } });
    if (!inv) {
      throw new NotFoundException('invoice not found');
    }
    const lines = await this.lineItems.find({ where: { invoiceId: id } });
    return this.toView(inv, lines);
  }

  private async loadLines(invoiceIds: string[]): Promise<Map<string, InvoiceLineItem[]>> {
    const byInvoice = new Map<string, InvoiceLineItem[]>();
    if (invoiceIds.length === 0) {
      return byInvoice;
    }
    const lines = await this.lineItems.find({ where: { invoiceId: In(invoiceIds) } });
    for (const li of lines) {
      const bucket = byInvoice.get(li.invoiceId) ?? [];
      bucket.push(li);
      byInvoice.set(li.invoiceId, bucket);
    }
    return byInvoice;
  }

  private toView(inv: Invoice, lines: InvoiceLineItem[]): InvoiceView {
    return {
      id: inv.id,
      customerId: inv.customerId,
      periodStart: inv.periodStart.toISOString(),
      periodEnd: inv.periodEnd.toISOString(),
      status: inv.status,
      subtotalCents: inv.subtotalCents,
      creditsCents: inv.creditsCents,
      totalCents: inv.totalCents,
      issuedAt: inv.issuedAt ? inv.issuedAt.toISOString() : null,
      paidAt: inv.paidAt ? inv.paidAt.toISOString() : null,
      lineItems: lines.map(
        (li): LineItemView => ({
          id: li.id,
          description: li.description,
          units: li.units,
          rateMicroDollars: li.rateMicroDollars,
          amountCents: li.amountCents,
          overridden: li.overridden,
        }),
      ),
    };
  }
}
