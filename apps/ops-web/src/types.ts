// Mirrors the ops API response shapes (apps/api .../ops.types.ts, invoice.types.ts).

export interface Page<T> {
  data: T[];
  page: { limit: number; offset: number; total: number };
}

export interface CustomerSummary {
  id: string;
  name: string;
  createdAt: string;
  activeKeyCount: number;
}

export interface UsageWindow {
  windowStart: string;
  totalUnits: number;
  eventCount: number;
  lastEventTs: string | null;
  version: number;
}

export interface Anomaly {
  windowStart: string;
  totalUnits: number;
  thirtyDayAvgUnits: number;
  ratio: number;
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

export interface CustomerDetail {
  customer: CustomerSummary;
  usage: UsageWindow[];
  invoices: Invoice[];
  anomalies: Anomaly[];
}

export interface CreditResult {
  id: string;
  customerId: string;
  amountCents: number;
  reason: string;
  idempotencyKey: string;
  createdAt: string;
  deduplicated: boolean;
}

export interface OverrideResult {
  invoiceId: string;
  lineItem: { id: string; amountCents: number; overridden: boolean };
  subtotalCents: number;
  totalCents: number;
}
