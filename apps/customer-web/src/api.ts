import type { Invoice, Page, UsageWindow } from './types';

// Empty base => same-origin relative paths (dev proxy forwards /v1 to the API).
// Override with VITE_API_URL to point at the API directly (CORS is enabled).
const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

const KEY_STORAGE = 'metered.apiKey';

export function getApiKey(): string | null {
  return localStorage.getItem(KEY_STORAGE);
}
export function setApiKey(key: string): void {
  localStorage.setItem(KEY_STORAGE, key.trim());
}
export function clearApiKey(): void {
  localStorage.removeItem(KEY_STORAGE);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function get<T>(path: string): Promise<T> {
  const key = getApiKey();
  if (!key) {
    throw new ApiError(401, 'No API key set');
  }
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'x-api-key': key },
  });
  if (!res.ok) {
    if (res.status === 401) {
      throw new ApiError(401, 'API key rejected');
    }
    if (res.status === 404) {
      throw new ApiError(404, 'Not found');
    }
    throw new ApiError(res.status, `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function fetchUsage(fromIso: string, toIso: string): Promise<Page<UsageWindow>> {
  const q = new URLSearchParams({ from: fromIso, to: toIso, limit: '200' });
  return get<Page<UsageWindow>>(`/v1/usage?${q.toString()}`);
}

export function fetchInvoices(): Promise<Page<Invoice>> {
  return get<Page<Invoice>>('/v1/invoices?limit=100');
}

export function fetchInvoice(id: string): Promise<Invoice> {
  return get<Invoice>(`/v1/invoices/${encodeURIComponent(id)}`);
}
