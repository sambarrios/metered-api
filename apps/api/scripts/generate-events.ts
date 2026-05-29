import 'reflect-metadata';
import { randomUUID } from 'crypto';

/**
 * Dev-only load/event generator — simulates a customer's product traffic by
 * posting batched usage events to POST /v1/events. Drives the whole pipeline:
 * ingest -> usage_windows -> monthly invoice. Not used in prod.
 *
 *   npm run gen:events -- --key mk_xxx [options]
 *
 * Options (flags or env):
 *   --key     <API key>      (or API_KEY)        required
 *   --url     <base url>     (or API_URL)        default http://localhost:3000
 *   --events  <n>            total events        default 5000
 *   --hours   <n>            spread over last N hours   default 24
 *   --batch   <n>            events per request   default 200
 *   --late    <0..1>         fraction backdated up to 20 days (late events)  default 0.03
 *   --spike                  concentrate a burst in one recent hour (for anomaly testing)
 *   --replay                 re-send the final batch to demonstrate idempotent dedupe
 */

interface Args {
  key: string;
  url: string;
  events: number;
  hours: number;
  batch: number;
  late: number;
  spike: boolean;
  replay: boolean;
}

function parseArgs(argv: string[]): Args {
  const flags = new Map<string, string>();
  const bools = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const name = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      bools.add(name);
    } else {
      flags.set(name, next);
      i++;
    }
  }
  const num = (name: string, def: number) =>
    flags.has(name) ? Number(flags.get(name)) : def;

  const key = flags.get('key') ?? process.env.API_KEY ?? '';
  if (!key) {
    console.error('Missing API key. Pass --key mk_xxx or set API_KEY.');
    process.exit(1);
  }
  return {
    key,
    url: flags.get('url') ?? process.env.API_URL ?? 'http://localhost:3000',
    events: num('events', 5000),
    hours: num('hours', 24),
    batch: num('batch', 200),
    late: num('late', 0.03),
    spike: bools.has('spike'),
    replay: bools.has('replay'),
  };
}

interface UsageEvent {
  requestId: string;
  endpoint: string;
  units: number;
  timestamp: string;
}

// Endpoints with rough relative weight + a typical unit cost, so the mix looks
// like a real metered product rather than uniform noise.
const ENDPOINTS: { path: string; weight: number; baseUnits: number }[] = [
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

/**
 * Pick an event time in the last `hours`, weighted toward a diurnal "business
 * hours" hump so windows aren't flat. `late` events are backdated well beyond
 * the span to exercise the late/out-of-order aggregation path.
 */
function pickTimestamp(now: number, hours: number, lateFraction: number): string {
  if (Math.random() < lateFraction) {
    const daysBack = 1 + Math.random() * 19; // 1..20 days late
    return new Date(now - daysBack * 86_400_000).toISOString();
  }
  // Rejection-sample a diurnal weight (peak mid-day UTC) within the window.
  for (let attempt = 0; attempt < 8; attempt++) {
    const ms = now - Math.random() * hours * 3_600_000;
    const hourOfDay = new Date(ms).getUTCHours();
    const weight = 0.3 + 0.7 * Math.sin((Math.PI * hourOfDay) / 24); // 0.3..1.0
    if (Math.random() < weight) return new Date(ms).toISOString();
  }
  return new Date(now - Math.random() * hours * 3_600_000).toISOString();
}

function makeEvent(now: number, a: Args): UsageEvent {
  const e = pickEndpoint();
  // Units jitter around the endpoint's base cost.
  const units = Math.max(1, Math.round(e.baseUnits * (0.5 + Math.random())));
  return {
    requestId: randomUUID(),
    endpoint: e.path,
    units,
    timestamp: pickTimestamp(now, a.hours, a.late),
  };
}

async function postBatch(a: Args, events: UsageEvent[]): Promise<{ accepted: number; duplicates: number }> {
  const res = await fetch(`${a.url}/v1/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': a.key },
    body: JSON.stringify({ events }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ingest failed ${res.status}: ${text}`);
  }
  const body = (await res.json()) as { accepted: number; duplicates: number };
  return body;
}

async function main(): Promise<void> {
  const a = parseArgs(process.argv.slice(2));
  const now = Date.now();
  console.log(
    `Generating ${a.events} events over ${a.hours}h -> ${a.url} (batch ${a.batch}, late ${a.late}${a.spike ? ', +spike' : ''})`,
  );

  const all: UsageEvent[] = [];
  for (let i = 0; i < a.events; i++) {
    all.push(makeEvent(now, a));
  }

  // Optional burst: a large block of heavy-endpoint calls crammed into one
  // recent hour, sized to dominate the per-customer baseline so the ops anomaly
  // signal (>=10x the 30-day hourly avg) reliably fires. The hour's units must
  // clear ~10x the average including itself; ~40% of total volume at 20 units
  // each comfortably does for typical runs.
  if (a.spike) {
    const spikeCount = Math.ceil(a.events * 0.4);
    const spikeUnits = 20;
    const spikeTs = new Date(now - 90 * 60_000).toISOString(); // ~90 min ago
    for (let i = 0; i < spikeCount; i++) {
      all.push({
        requestId: randomUUID(),
        endpoint: '/v1/images',
        units: spikeUnits,
        timestamp: spikeTs,
      });
    }
    console.log(`  + spike: ${spikeCount} events x${spikeUnits}u (${spikeCount * spikeUnits} units) at ${spikeTs}`);
  }

  let accepted = 0;
  let duplicates = 0;
  let lastBatch: UsageEvent[] = [];
  for (let i = 0; i < all.length; i += a.batch) {
    const batch = all.slice(i, i + a.batch);
    lastBatch = batch;
    const r = await postBatch(a, batch);
    accepted += r.accepted;
    duplicates += r.duplicates;
    process.stdout.write(`\r  sent ${Math.min(i + a.batch, all.length)}/${all.length} (accepted ${accepted}, dup ${duplicates})`);
  }
  process.stdout.write('\n');

  if (a.replay && lastBatch.length > 0) {
    const r = await postBatch(a, lastBatch);
    console.log(
      `Replayed final batch of ${lastBatch.length}: accepted ${r.accepted}, duplicates ${r.duplicates} (expect all duplicates)`,
    );
  }

  console.log(`Done. accepted=${accepted} duplicates=${duplicates}`);
  console.log('Aggregation cron (10s) will roll these into usage_windows.');
}

main().catch((err) => {
  console.error('\n', err);
  process.exit(1);
});
