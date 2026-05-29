import { InvoiceView } from '../invoices/invoice.types';

export interface CustomerSummary {
  id: string;
  name: string;
  createdAt: string;
  activeKeyCount: number;
}

export interface UsageWindowView {
  windowStart: string;
  totalUnits: number;
  eventCount: number;
  lastEventTs: string | null;
  version: number;
}

/** A usage window whose units spike >= 10x the customer's 30-day hourly average. */
export interface AnomalyView {
  windowStart: string;
  totalUnits: number;
  thirtyDayAvgUnits: number;
  ratio: number;
}

export interface CustomerDetail {
  customer: CustomerSummary;
  usage: UsageWindowView[];
  invoices: InvoiceView[];
  anomalies: AnomalyView[];
}

export interface CreatedCustomer {
  id: string;
  name: string;
  createdAt: string;
}

export interface CreatedApiKey {
  id: string;
  customerId: string;
  keyPrefix: string;
  /** Returned exactly once at creation; only the hash is stored thereafter. */
  plaintext: string;
  createdAt: string;
}
