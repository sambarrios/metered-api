import type {
  CreditResult,
  CustomerDetail,
  CustomerSummary,
  OverrideResult,
  Page,
} from './types';

// Empty base => same-origin relative paths (dev proxy forwards /ops to the API).
const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
const TOKEN_STORAGE = 'metered.staffToken';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE);
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_STORAGE, token.trim());
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_STORAGE);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  if (!token) {
    throw new ApiError(401, 'No staff token set');
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    // Surface the server's message when present — it carries the safety-relevant
    // reason (e.g. "cannot override a line on a paid invoice; issue a credit").
    let detail = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      if (j && typeof j.message === 'string') detail = j.message;
      else if (Array.isArray(j?.message)) detail = j.message.join('; ');
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export function fetchCustomers(): Promise<Page<CustomerSummary>> {
  return request<Page<CustomerSummary>>('GET', '/ops/customers?limit=100');
}

export function fetchCustomer(id: string): Promise<CustomerDetail> {
  return request<CustomerDetail>('GET', `/ops/customers/${encodeURIComponent(id)}`);
}

export interface CreditInput {
  amountCents: number;
  reason: string;
  idempotencyKey: string;
}
export function issueCredit(customerId: string, input: CreditInput): Promise<CreditResult> {
  return request<CreditResult>(
    'POST',
    `/ops/customers/${encodeURIComponent(customerId)}/credits`,
    input,
  );
}

export interface OverrideInput {
  amountCents: number;
  reason: string;
}
export function overrideLineItem(
  invoiceId: string,
  lineId: string,
  input: OverrideInput,
): Promise<OverrideResult> {
  return request<OverrideResult>(
    'PATCH',
    `/ops/invoices/${encodeURIComponent(invoiceId)}/line-items/${encodeURIComponent(lineId)}`,
    input,
  );
}
