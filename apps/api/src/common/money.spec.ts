import {
  computeTieredCharge,
  DEFAULT_TIERS,
  microDollarsToCents,
  MICRO_DOLLARS_PER_CENT,
  PriceTier,
} from './money';

describe('microDollarsToCents (round-half-up)', () => {
  it('rounds exact cents with no drift', () => {
    expect(microDollarsToCents(0)).toBe(0);
    expect(microDollarsToCents(MICRO_DOLLARS_PER_CENT)).toBe(1); // 1 cent
    expect(microDollarsToCents(100 * MICRO_DOLLARS_PER_CENT)).toBe(100); // $1.00
  });

  it('rounds half UP (the documented policy), not half-to-even', () => {
    // 0.5 cent => 5000 microdollars => rounds up to 1 cent
    expect(microDollarsToCents(MICRO_DOLLARS_PER_CENT / 2)).toBe(1);
    // 1.5 cents => rounds up to 2 cents (banker's rounding would give 2 too,
    // but 2.5 distinguishes them)
    expect(microDollarsToCents(2.5 * MICRO_DOLLARS_PER_CENT)).toBe(3); // not 2
  });

  it('rounds just-below-half down', () => {
    expect(microDollarsToCents(MICRO_DOLLARS_PER_CENT / 2 - 1)).toBe(0);
    expect(microDollarsToCents(1.5 * MICRO_DOLLARS_PER_CENT - 1)).toBe(1);
  });
});

describe('computeTieredCharge (default plan: free 10k / 90k @ $0.001 / beyond @ $0.0005)', () => {
  it('charges nothing inside the free tier', () => {
    const r = computeTieredCharge(5_000);
    expect(r.totalCents).toBe(0);
    expect(r.totalMicroDollars).toBe(0);
    // Free tier still emitted for transparency on the invoice.
    expect(r.charges[0]).toMatchObject({ unitsCharged: 5_000, rateMicroDollars: 0 });
  });

  it('charges nothing exactly at the free-tier boundary', () => {
    expect(computeTieredCharge(10_000).totalCents).toBe(0);
  });

  it('charges the second tier for units just past free', () => {
    // 10_001 units => 1 unit @ $0.001 = 1000 microdollars => 0 cents (rounds down)
    const r = computeTieredCharge(10_001);
    expect(r.totalMicroDollars).toBe(1000);
    expect(r.totalCents).toBe(0);
  });

  it('matches the documented worked example: 150k units => $115.00', () => {
    // free 10k = $0; 90k @ $0.001 = $90.00; 50k @ $0.0005 = $25.00 => $115.00
    const r = computeTieredCharge(150_000);
    expect(r.totalMicroDollars).toBe(90_000 * 1000 + 50_000 * 500);
    expect(r.totalCents).toBe(115_00);
    const charged = r.charges.map((c) => c.unitsCharged);
    expect(charged).toEqual([10_000, 90_000, 50_000]);
  });

  it('fills the middle tier exactly at its bound (100k units)', () => {
    // free 10k + 90k @ $0.001 = $90.00, nothing in the unbounded tier
    const r = computeTieredCharge(100_000);
    expect(r.totalCents).toBe(90_00);
    expect(r.charges).toHaveLength(2);
  });

  it('handles zero units', () => {
    const r = computeTieredCharge(0);
    expect(r.totalCents).toBe(0);
    expect(r.charges).toHaveLength(0);
  });

  it('is deterministic — same input, identical output', () => {
    expect(computeTieredCharge(123_456)).toEqual(computeTieredCharge(123_456));
  });

  it('supports a custom single unbounded tier', () => {
    const flat: PriceTier[] = [{ upToUnits: null, rateMicroDollars: 2000 }]; // $0.002
    const r = computeTieredCharge(1_000, flat);
    expect(r.totalMicroDollars).toBe(2_000_000);
    expect(r.totalCents).toBe(200); // $2.00
  });

  it('default tiers are the brief example', () => {
    expect(DEFAULT_TIERS).toEqual([
      { upToUnits: 10_000, rateMicroDollars: 0 },
      { upToUnits: 100_000, rateMicroDollars: 1000 },
      { upToUnits: null, rateMicroDollars: 500 },
    ]);
  });
});
