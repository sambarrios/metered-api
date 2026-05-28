/**
 * Money rules (see DESIGN.md):
 *  - Invoice/line amounts persisted + returned as integer CENTS (minor units).
 *  - Per-unit rates are sub-cent ($0.001), so rates + intermediate products are
 *    held in integer MICRO-DOLLARS (1e-6 USD). $0.001 => 1000 microdollars.
 *  - Round to cents once, at the line/invoice boundary. No floats in money math.
 */

export const MICRO_DOLLARS_PER_CENT = 10_000; // 1 cent = $0.01 = 10_000 microdollars

export interface PriceTier {
  /** inclusive upper bound in units; null = unbounded final tier */
  upToUnits: number | null;
  /** price per unit in integer microdollars */
  rateMicroDollars: number;
}

/** Example plan from the brief: first 10k free, next 90k @ $0.001, beyond @ $0.0005 */
export const DEFAULT_TIERS: PriceTier[] = [
  { upToUnits: 10_000, rateMicroDollars: 0 },
  { upToUnits: 100_000, rateMicroDollars: 1000 }, // $0.001
  { upToUnits: null, rateMicroDollars: 500 }, // $0.0005
];

/** Round-half-up microdollars -> integer cents. Documented, deterministic. */
export function microDollarsToCents(micro: number): number {
  return Math.floor((micro + MICRO_DOLLARS_PER_CENT / 2) / MICRO_DOLLARS_PER_CENT);
}

export interface TierCharge {
  upToUnits: number | null;
  unitsCharged: number;
  rateMicroDollars: number;
  microDollars: number;
}

/**
 * Spread `units` across tiers. Returns per-tier charges in microdollars (exact)
 * plus the total rounded to integer cents. Pure + deterministic.
 */
export function computeTieredCharge(
  units: number,
  tiers: PriceTier[] = DEFAULT_TIERS,
): { charges: TierCharge[]; totalMicroDollars: number; totalCents: number } {
  const charges: TierCharge[] = [];
  let remaining = units;
  let prevBound = 0;
  let totalMicroDollars = 0;

  for (const tier of tiers) {
    if (remaining <= 0) break;
    const capacity =
      tier.upToUnits === null ? remaining : Math.max(0, tier.upToUnits - prevBound);
    const unitsCharged = Math.min(remaining, capacity);
    const microDollars = unitsCharged * tier.rateMicroDollars;
    charges.push({
      upToUnits: tier.upToUnits,
      unitsCharged,
      rateMicroDollars: tier.rateMicroDollars,
      microDollars,
    });
    totalMicroDollars += microDollars;
    remaining -= unitsCharged;
    prevBound = tier.upToUnits ?? prevBound + unitsCharged;
  }

  return {
    charges,
    totalMicroDollars,
    totalCents: microDollarsToCents(totalMicroDollars),
  };
}
