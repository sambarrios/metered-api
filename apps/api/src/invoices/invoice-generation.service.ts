import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { generateId } from '../common/id';
import {
  computeTieredCharge,
  DEFAULT_TIERS,
  microDollarsToCents,
  PriceTier,
} from '../common/money';
import { addMonthsUtc } from '../common/time';

export interface GenerateInvoiceResult {
  invoiceId: string;
  status: 'draft' | 'issued' | 'paid';
  periodStart: string;
  units: number;
  subtotalCents: number;
  totalCents: number;
  lineItems: number;
  /** True when an issued/paid invoice already existed and was left untouched. */
  frozen: boolean;
}

interface ChargeLine {
  description: string;
  units: number;
  rateMicroDollars: number;
  amountCents: number;
}

/**
 * Builds a customer's draft invoice for one monthly billing period from the
 * aggregated usage_windows (events -> windows -> invoice). The whole build runs
 * in one transaction under a per-(customer, period) advisory lock, so two
 * concurrent jobs can't race; UNIQUE(customer_id, period_start) is the backstop.
 *
 * Idempotent + recomputable:
 *  - no invoice yet            -> insert a fresh draft
 *  - draft invoice exists      -> replace its line items + totals (picks up
 *                                 late aggregation)
 *  - issued/paid invoice exists-> frozen, left untouched (late events for a
 *                                 closed period are a next-period adjustment;
 *                                 design-only for now)
 */
@Injectable()
export class InvoiceGenerationService {
  private readonly logger = new Logger(InvoiceGenerationService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async generateInvoice(customerId: string, periodStartIso: string): Promise<GenerateInvoiceResult> {
    const periodStart = new Date(periodStartIso);
    const periodEnd = addMonthsUtc(periodStart, 1);
    const startIso = periodStart.toISOString();
    const endIso = periodEnd.toISOString();

    return this.dataSource.transaction(async (em) => {
      // Serialize concurrent generation for the same customer+period. Released
      // automatically at transaction end.
      await em.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [
        `inv:${customerId}:${startIso}`,
      ]);

      const existing = await em.query<
        { id: string; status: 'draft' | 'issued' | 'paid' }[]
      >(`SELECT id, status FROM invoices WHERE customer_id = $1 AND period_start = $2`, [
        customerId,
        startIso,
      ]);

      if (existing.length > 0 && existing[0].status !== 'draft') {
        const inv = existing[0];
        this.logger.log(`invoice ${inv.id} is ${inv.status}; skipping regeneration (frozen)`);
        return this.describeExisting(em, inv.id, inv.status, startIso);
      }

      const [usage] = await em.query<{ units: string }[]>(
        `SELECT COALESCE(SUM(total_units), 0)::bigint AS units
           FROM usage_windows
          WHERE customer_id = $1 AND window_start >= $2 AND window_start < $3`,
        [customerId, startIso, endIso],
      );
      const units = Number(usage.units);

      const tiers = await this.loadTiers(em, customerId, startIso);
      const lines = this.buildLines(units, tiers);
      const subtotalCents = lines.reduce((s, l) => s + l.amountCents, 0);
      const creditsCents = 0; // credits feature lands later; total = subtotal for now
      const totalCents = subtotalCents - creditsCents;

      const invoiceId = existing[0]?.id ?? generateId('inv');
      if (existing.length === 0) {
        await em.query(
          `INSERT INTO invoices
             (id, customer_id, period_start, period_end, status,
              subtotal_cents, credits_cents, total_cents)
           VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7)`,
          [invoiceId, customerId, startIso, endIso, subtotalCents, creditsCents, totalCents],
        );
      } else {
        // Regenerate the draft: drop old lines, refresh totals.
        await em.query(`DELETE FROM invoice_line_items WHERE invoice_id = $1`, [invoiceId]);
        await em.query(
          `UPDATE invoices
              SET subtotal_cents = $2, credits_cents = $3, total_cents = $4, period_end = $5
            WHERE id = $1`,
          [invoiceId, subtotalCents, creditsCents, totalCents, endIso],
        );
      }

      for (const l of lines) {
        await em.query(
          `INSERT INTO invoice_line_items
             (id, invoice_id, description, units, rate_microdollars, amount_cents, overridden)
           VALUES ($1, $2, $3, $4, $5, $6, false)`,
          [generateId('li'), invoiceId, l.description, l.units, l.rateMicroDollars, l.amountCents],
        );
      }

      return {
        invoiceId,
        status: 'draft',
        periodStart: startIso,
        units,
        subtotalCents,
        totalCents,
        lineItems: lines.length,
        frozen: false,
      };
    });
  }

  /**
   * One line per charged tier (including the free tier when units fall in it,
   * so the breakdown is transparent). Rounding policy: each line is rounded to
   * cents independently, and the subtotal is the sum of the line cents — every
   * line is a self-consistent charge. With sub-cent rates this can differ from
   * rounding the grand total once; the per-line choice is the documented policy.
   */
  private buildLines(units: number, tiers: PriceTier[]): ChargeLine[] {
    const { charges } = computeTieredCharge(units, tiers);
    const lines: ChargeLine[] = [];
    let lowerBound = 0; // units already covered by previous tiers
    for (const c of charges) {
      const upper = lowerBound + c.unitsCharged;
      const rangeLabel = `units ${(lowerBound + 1).toLocaleString('en-US')}–${upper.toLocaleString('en-US')}`;
      const rateLabel =
        c.rateMicroDollars === 0
          ? 'included'
          : `@ ${formatRate(c.rateMicroDollars)}/unit`;
      lines.push({
        description: `${c.unitsCharged.toLocaleString('en-US')} ${rangeLabel} (${rateLabel})`,
        units: c.unitsCharged,
        rateMicroDollars: c.rateMicroDollars,
        amountCents: microDollarsToCents(c.microDollars),
      });
      lowerBound = upper;
    }
    return lines;
  }

  /** Tiers for the plan in effect at the period start; falls back to pp_default. */
  private async loadTiers(
    em: EntityManager,
    customerId: string,
    periodStartIso: string,
  ): Promise<PriceTier[]> {
    const [plan] = await em.query<{ plan_id: string }[]>(
      `SELECT plan_id FROM customer_plans
        WHERE customer_id = $1 AND effective_from <= $2
        ORDER BY effective_from DESC
        LIMIT 1`,
      [customerId, periodStartIso],
    );
    const planId = plan?.plan_id ?? 'pp_default';

    const tiers = await em.query<
      { up_to_units: number | null; rate_microdollars: number }[]
    >(
      `SELECT up_to_units, rate_microdollars FROM plan_tiers
        WHERE plan_id = $1 ORDER BY sort_order ASC`,
      [planId],
    );

    if (tiers.length === 0) {
      this.logger.warn(`no plan_tiers for plan ${planId}; using DEFAULT_TIERS`);
      return DEFAULT_TIERS;
    }
    return tiers.map((t) => ({ upToUnits: t.up_to_units, rateMicroDollars: t.rate_microdollars }));
  }

  private async describeExisting(
    em: EntityManager,
    invoiceId: string,
    status: 'draft' | 'issued' | 'paid',
    periodStartIso: string,
  ): Promise<GenerateInvoiceResult> {
    const [inv] = await em.query<
      { subtotal_cents: number; total_cents: number; units: string; lines: string }[]
    >(
      `SELECT i.subtotal_cents, i.total_cents,
              COALESCE(SUM(li.units), 0)::bigint AS units,
              COUNT(li.id)::int                  AS lines
         FROM invoices i
         LEFT JOIN invoice_line_items li ON li.invoice_id = i.id
        WHERE i.id = $1
        GROUP BY i.id, i.subtotal_cents, i.total_cents`,
      [invoiceId],
    );
    return {
      invoiceId,
      status,
      periodStart: periodStartIso,
      units: Number(inv.units),
      subtotalCents: inv.subtotal_cents,
      totalCents: inv.total_cents,
      lineItems: Number(inv.lines),
      frozen: true,
    };
  }
}

/** Render an integer-microdollar rate as a dollar string, trimming zeros. */
function formatRate(microDollars: number): string {
  const dollars = microDollars / 1_000_000;
  return `$${dollars.toFixed(6).replace(/0+$/, '').replace(/\.$/, '.0')}`;
}
