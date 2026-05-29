/** Integer cents -> "$1,234.56". The API is the source of truth for amounts. */
export function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

export function formatUnits(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

/** "$12.34" (dollars) -> 1234 cents, round-half-up. Returns null if invalid. */
export function dollarsToCents(input: string): number | null {
  const trimmed = input.trim().replace(/^\$/, '');
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  return Math.round(parseFloat(trimmed) * 100);
}

export function formatHourUtc(iso: string): string {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(d);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  return `${date}, ${hh}:00 UTC`;
}

export function formatDateUtc(iso: string): string {
  return (
    new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(iso)) + ' UTC'
  );
}
