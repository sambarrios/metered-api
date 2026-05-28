/** Truncate a timestamp to the start of its UTC hour (the usage-window bucket). */
export function floorToHourUtc(d: Date): Date {
  const out = new Date(d);
  out.setUTCMinutes(0, 0, 0);
  return out;
}

export const ONE_HOUR_MS = 60 * 60 * 1000;

/** Start of the UTC month containing `d` — the billing-period boundary. */
export function floorToMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

/** Start of the UTC month `n` months after `d`'s month (n may be negative). */
export function addMonthsUtc(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1, 0, 0, 0, 0));
}
