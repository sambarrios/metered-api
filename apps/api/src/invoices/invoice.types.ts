export interface LineItemView {
  id: string;
  description: string;
  units: number;
  rateMicroDollars: number;
  amountCents: number;
  overridden: boolean;
}

export interface InvoiceView {
  id: string;
  customerId: string;
  periodStart: string;
  periodEnd: string;
  status: 'draft' | 'issued' | 'paid';
  subtotalCents: number;
  creditsCents: number;
  totalCents: number;
  issuedAt: string | null;
  paidAt: string | null;
  lineItems: LineItemView[];
}

// Shared mock fixture used by customer + ops controllers in Phase 1.
export function mockInvoice(id: string, customerId: string): InvoiceView {
  return {
    id,
    customerId,
    periodStart: '2026-05-01T00:00:00.000Z',
    periodEnd: '2026-06-01T00:00:00.000Z',
    status: 'issued',
    subtotalCents: 9500,
    creditsCents: 0,
    totalCents: 9500,
    issuedAt: '2026-06-01T00:05:00.000Z',
    paidAt: null,
    lineItems: [
      {
        id: 'li_0001',
        description: 'Tier 2: units 10,001–100,000 @ $0.001',
        units: 90000,
        rateMicroDollars: 1000,
        amountCents: 9000,
        overridden: false,
      },
      {
        id: 'li_0002',
        description: 'Tier 3: units beyond 100,000 @ $0.0005',
        units: 10000,
        rateMicroDollars: 500,
        amountCents: 500,
        overridden: false,
      },
    ],
  };
}
