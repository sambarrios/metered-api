// Mirrors the API response shapes (apps/api .../usage.dto.ts, invoice.types.ts).

export interface Page<T> {
  data: T[];
  page: { limit: number; offset: number; total: number };
}

export interface UsageWindow {
  windowStart: string;
  totalUnits: number;
  eventCount: number;
  lastEventTs: string | null;
  version: number;
}

export interface LineItem {
  id: string;
  description: string;
  units: number;
  rateMicroDollars: number;
  amountCents: number;
  overridden: boolean;
}

export interface Invoice {
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
  lineItems: LineItem[];
}
