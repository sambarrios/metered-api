import 'reflect-metadata';
import { randomUUID } from 'crypto';
import AppDataSource from '../src/database/data-source';
import { generateApiKey } from '../src/common/api-key';
import { ApiKey } from '../src/database/entities/api-key.entity';
import { Customer } from '../src/database/entities/customer.entity';
import { CustomerPlan } from '../src/database/entities/customer-plan.entity';
import { PricePlan } from '../src/database/entities/price-plan.entity';
import { PlanTier } from '../src/database/entities/plan-tier.entity';

/**
 * Dev-only demo seed: a spread of customers that each exercise a distinct
 * behaviour of the billing pipeline, so a demo has interesting data to walk
 * through without hand-crafting it. Complements the single-customer seed:dev.
 *
 *   npm run seed:demo                 # seed customers/plans/keys only
 *   npm run seed:demo -- --traffic    # also drive per-profile usage via the API
 *
 * Idempotent by customer name: re-running skips customers that already exist
 * (and mints a fresh key for them, since only the hash is stored). The second
 * price plan is upserted. --traffic requires the API running (API_URL, default
 * http://localhost:3000); after it, the 10s aggregation cron rolls events into
 * usage_windows, then `npm run gen:invoice -- <customerId>` builds an invoice.
 *
 * Not a migration, never runs in prod.
 */

const API_URL = process.env.API_URL ?? 'http://localhost:3000';

// Plans must be effective at or before the billing period start to be resolved
// by invoice generation (it picks the latest plan with effective_from <= period
// start, else falls back to pp_default). Date assignments from the start of the
// current UTC month so this month's invoice bills on the intended plan.
function currentMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

// A second plan alongside pp_default, to demonstrate plan variety + the
// effective-dated customer_plans lookup (a high-volume tenant on cheaper tiers).
const ENTERPRISE_PLAN_ID = 'pp_enterprise';
const ENTERPRISE_TIERS = [
  { id: 'pt_ent_0', upToUnits: 50_000, rateMicroDollars: 0, sortOrder: 0 },
  { id: 'pt_ent_1', upToUnits: 500_000, rateMicroDollars: 800, sortOrder: 1 },
  { id: 'pt_ent_2', upToUnits: null, rateMicroDollars: 400, sortOrder: 2 },
];

interface Profile {
  name: string;
  planId: string;
  blurb: string;
  // gen:events flags that reproduce this profile's traffic by hand.
  genFlags: string;
  // Inline traffic spec for --traffic.
  events: number;
  hours: number;
  late: number;
  spike: boolean;
}

const PROFILES: Profile[] = [
  {
    name: 'Acme Labs',
    planId: 'pp_default',
    blurb: 'Low volume — stays under the 10k free tier. Invoice should total $0.00.',
    genFlags: '--events 1800 --hours 48',
    events: 1800,
    hours: 48,
    late: 0,
    spike: false,
  },
  {
    name: 'Globex Corp',
    planId: 'pp_default',
    blurb: 'High volume — crosses all three default tiers (free / $0.001 / $0.0005).',
    genFlags: '--events 40000 --hours 72',
    events: 40000,
    hours: 72,
    late: 0.02,
    spike: false,
  },
  {
    name: 'Initech',
    planId: 'pp_default',
    blurb: 'Normal traffic plus a burst — the ops anomaly signal flags the spike hour.',
    genFlags: '--events 4000 --hours 48 --spike',
    events: 4000,
    hours: 48,
    late: 0,
    spike: true,
  },
  {
    name: 'Umbrella Corp',
    planId: ENTERPRISE_PLAN_ID,
    blurb: 'On the enterprise plan — same usage, different tier math vs pp_default.',
    genFlags: '--events 30000 --hours 72',
    events: 30000,
    hours: 72,
    late: 0,
    spike: false,
  },
  {
    name: 'Hooli',
    planId: 'pp_default',
    blurb: 'Late / out-of-order events + a replayed batch — exercises re-aggregation + dedupe.',
    genFlags: '--events 5000 --hours 48 --late 0.12 --replay',
    events: 5000,
    hours: 48,
    late: 0.12,
    spike: false,
  },
];

// --- traffic generation (compact port of scripts/generate-events.ts) ---------

const ENDPOINTS = [
  { path: '/v1/search', weight: 5, baseUnits: 1 },
  { path: '/v1/embeddings', weight: 3, baseUnits: 2 },
  { path: '/v1/completions', weight: 2, baseUnits: 8 },
  { path: '/v1/images', weight: 1, baseUnits: 20 },
];
const TOTAL_WEIGHT = ENDPOINTS.reduce((s, e) => s + e.weight, 0);

function pickEndpoint(): { path: string; baseUnits: number } {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const e of ENDPOINTS) {
    r -= e.weight;
    if (r <= 0) return e;
  }
  return ENDPOINTS[0];
}

function pickTimestamp(now: number, hours: number, lateFraction: number): string {
  if (Math.random() < lateFraction) {
    const daysBack = 1 + Math.random() * 19;
    return new Date(now - daysBack * 86_400_000).toISOString();
  }
  const ms = now - Math.random() * hours * 3_600_000;
  return new Date(ms).toISOString();
}

interface UsageEvent {
  requestId: string;
  endpoint: string;
  units: number;
  timestamp: string;
}

async function driveTraffic(apiKey: string, p: Profile): Promise<void> {
  const now = Date.now();
  const all: UsageEvent[] = [];
  for (let i = 0; i < p.events; i++) {
    const e = pickEndpoint();
    all.push({
      requestId: randomUUID(),
      endpoint: e.path,
      units: Math.max(1, Math.round(e.baseUnits * (0.5 + Math.random()))),
      timestamp: pickTimestamp(now, p.hours, p.late),
    });
  }
  if (p.spike) {
    const spikeCount = Math.ceil(p.events * 0.4);
    const spikeTs = new Date(now - 90 * 60_000).toISOString();
    for (let i = 0; i < spikeCount; i++) {
      all.push({ requestId: randomUUID(), endpoint: '/v1/images', units: 20, timestamp: spikeTs });
    }
  }

  const batchSize = 200;
  let accepted = 0;
  let duplicates = 0;
  let lastBatch: UsageEvent[] = [];
  for (let i = 0; i < all.length; i += batchSize) {
    lastBatch = all.slice(i, i + batchSize);
    const res = await fetch(`${API_URL}/v1/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ events: lastBatch }),
    });
    if (!res.ok) throw new Error(`ingest failed ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { accepted: number; duplicates: number };
    accepted += body.accepted;
    duplicates += body.duplicates;
  }
  // Replay the final batch for the Hooli profile to show idempotent dedupe.
  if (p.late >= 0.1 && lastBatch.length > 0) {
    await fetch(`${API_URL}/v1/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ events: lastBatch }),
    });
    duplicates += lastBatch.length;
  }
  console.log(`    traffic: accepted=${accepted} duplicates=${duplicates}`);
}

// --- seeding ------------------------------------------------------------------

async function upsertEnterprisePlan(): Promise<void> {
  const plans = AppDataSource.getRepository(PricePlan);
  const tiers = AppDataSource.getRepository(PlanTier);
  const existing = await plans.findOne({ where: { id: ENTERPRISE_PLAN_ID } });
  if (existing) {
    console.log(`Plan ${ENTERPRISE_PLAN_ID} already present — leaving as is.`);
    return;
  }
  // PricePlan/PlanTier ids are normally prefix-generated; force the fixed ids so
  // the seed is deterministic and referenceable, matching the migration's style.
  await plans.save(plans.create({ id: ENTERPRISE_PLAN_ID, name: 'Enterprise Plan' } as Partial<PricePlan>));
  for (const t of ENTERPRISE_TIERS) {
    await tiers.save(
      tiers.create({
        id: t.id,
        planId: ENTERPRISE_PLAN_ID,
        upToUnits: t.upToUnits,
        rateMicroDollars: t.rateMicroDollars,
        sortOrder: t.sortOrder,
      } as Partial<PlanTier>),
    );
  }
  console.log(`Seeded plan ${ENTERPRISE_PLAN_ID} (free 50k / next 450k @ $0.0008 / beyond @ $0.0004).`);
}

interface Seeded {
  profile: Profile;
  customerId: string;
  apiKey: string;
  created: boolean;
}

async function seedCustomer(p: Profile): Promise<Seeded> {
  const customers = AppDataSource.getRepository(Customer);
  const plans = AppDataSource.getRepository(CustomerPlan);
  const keys = AppDataSource.getRepository(ApiKey);

  let customer = await customers.findOne({ where: { name: p.name } });
  const created = !customer;
  if (!customer) {
    customer = await customers.save(customers.create({ name: p.name }));
  }
  // Ensure exactly the intended plan, effective from the current month start, so
  // re-runs converge (and an existing customer's plan date gets corrected).
  const existingPlan = await plans.findOne({ where: { customerId: customer.id, planId: p.planId } });
  if (existingPlan) {
    existingPlan.effectiveFrom = currentMonthStart();
    await plans.save(existingPlan);
  } else {
    await plans.save(
      plans.create({ customerId: customer.id, planId: p.planId, effectiveFrom: currentMonthStart() }),
    );
  }
  // Always mint a fresh key (only the hash is stored, so an existing customer's
  // prior key can't be reprinted) so the demo always has a usable key in hand.
  const { plaintext, keyHash, keyPrefix } = generateApiKey();
  await keys.save(keys.create({ customerId: customer.id, keyHash, keyPrefix }));

  return { profile: p, customerId: customer.id, apiKey: plaintext, created };
}

async function main(): Promise<void> {
  const traffic = process.argv.includes('--traffic');
  await AppDataSource.initialize();

  await upsertEnterprisePlan();

  const seeded: Seeded[] = [];
  for (const p of PROFILES) {
    const s = await seedCustomer(p);
    console.log(`${s.created ? 'Created' : 'Exists '} ${p.name} -> ${s.customerId} (${p.planId})`);
    if (traffic) {
      await driveTraffic(s.apiKey, p);
    }
    seeded.push(s);
  }

  console.log('\n=== Demo customers ===');
  for (const s of seeded) {
    console.log(`\n${s.profile.name}  [${s.profile.planId}]`);
    console.log(`  ${s.profile.blurb}`);
    console.log(`  customerId: ${s.customerId}`);
    console.log(`  apiKey:     ${s.apiKey}`);
    if (!traffic) {
      console.log(`  traffic:    npm run gen:events -- --key ${s.apiKey} ${s.profile.genFlags}`);
    }
    console.log(`  invoice:    npm run gen:invoice -- ${s.customerId}`);
  }

  if (traffic) {
    console.log('\nEvents posted. The 10s aggregation cron will roll them into usage_windows;');
    console.log('then run the per-customer gen:invoice commands above to build invoices.');
  } else {
    console.log('\nNo traffic posted (pass --traffic to drive events through a running API).');
  }

  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
