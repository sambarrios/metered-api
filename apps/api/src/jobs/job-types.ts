/** Recompute one hourly usage_window for a customer from raw usage_events. */
export const AGGREGATE_WINDOW_JOB = 'aggregate_window';

export interface AggregateWindowPayload {
  customerId: string;
  /** ISO timestamp of the hour bucket start (UTC). */
  windowStart: string;
}

/** Generate (or regenerate) a customer's draft invoice for one billing period. */
export const GENERATE_INVOICE_JOB = 'generate_invoice';

export interface GenerateInvoicePayload {
  customerId: string;
  /** ISO timestamp of the billing period start (UTC month boundary). */
  periodStart: string;
}

/** A job to enqueue. `dedupeKey` collapses duplicate pending/running work. */
export interface NewJob {
  type: string;
  payload?: Record<string, unknown>;
  dedupeKey?: string;
  scheduledFor?: Date;
}
