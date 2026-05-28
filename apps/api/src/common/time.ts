/** Truncate a timestamp to the start of its UTC hour (the usage-window bucket). */
export function floorToHourUtc(d: Date): Date {
  const out = new Date(d);
  out.setUTCMinutes(0, 0, 0);
  return out;
}

export const ONE_HOUR_MS = 60 * 60 * 1000;
