# DESIGN

A metered-API billing core: usage events are ingested, aggregated into hourly windows, and rolled up into monthly tiered invoices that signed payment webhooks mark paid.

## Data model

Eleven tables, all keyed by prefixed base36 text ids (`cus_…`, `inv_…`, `job_…`) — greppable and self-describing in logs. Schema changes go through hand-written migrations only (`synchronize: false`).

The billing spine:

- **`customers`** → **`api_keys`** (sha256 `key_hash` UNIQUE; `key_prefix` for display; nullable `revoked_at`).
- **`price_plans`** → **`plan_tiers`** (`up_to_units` nullable = unbounded top tier, `rate_microdollars`, `sort_order` unique per plan). **`customer_plans`** binds a customer to a plan with `effective_from`, so pricing is effective-dated, not mutated in place.
- **`usage_events`** — raw append-only ledger. `request_id text UNIQUE` is the idempotency anchor; plus `customer_id`, `api_key_id` (the *authenticating* key), `endpoint`, `units` (CHECK `>= 0`), `event_ts` (when it happened) vs `received_at` (when we saw it — these differ for late events).
- **`usage_windows`** — one row per `(customer_id, window_start)` hour (UNIQUE): `total_units`, `event_count`, `last_event_ts`, `state`, `version`. Fully recomputable from events.
- **`invoices`** (`UNIQUE(customer_id, period_start)`, status `draft|issued|paid`, integer-cent `subtotal/credits/total`) → **`invoice_line_items`** (`amount_cents`, `overridden` flag).
- **`credits`** (`idempotency_key` UNIQUE, `actor`, CHECK `amount_cents > 0`), **`audit_log`** (append-only), **`payment_events`** (`delivery_id` UNIQUE), **`jobs`** (the queue).

**FK on-delete behavior is deliberate.** Tenant-owned rows cascade from `customers`. Financial cross-references *don't*: `usage_events.api_key_id` and `credits/payment_events.invoice_id` have no cascade, so you can't delete a key or invoice a financial record points at — history is never orphaned. `audit_log` has **no FK at all** (`entity_type`/`entity_id` are loose text), so an audit row outlives what it describes. Rules live in CHECK constraints and enums, not comments or app validation.

### Indexes — each matches a query we run

- `usage_events(request_id)` UNIQUE — *is* the ingest dedupe mechanism, not just a lookup.
- `usage_events(customer_id, event_ts)` — every read and the per-hour aggregation is a tenant-scoped time range.
- `usage_windows(customer_id, window_start)` UNIQUE — backs the idempotent aggregation upsert and the dashboard month query.
- `invoices(customer_id, period_start)` UNIQUE — one invoice per customer per period; backstop behind the advisory lock.
- `jobs(status, scheduled_for)` — exactly the claim query's filter.
- `uq_jobs_active_dedupe(dedupe_key) WHERE status IN ('pending','running')` — **partial** unique index: at most one *active* job per key, re-enqueue allowed once it completes. Lets ingest blindly enqueue an aggregation job per touched hour without coordinating.
- `api_keys(key_hash)` UNIQUE, plus FK indexes on `customer_plans`, `credits`, `invoice_line_items`, `audit_log(entity_type, entity_id)`.

### At 10× and 100×

Baseline: ~5k customers, 200 events/sec sustained / 2k peak, ~50M events/month.

- **10× (~500M/month) — scales with known fixes, no design change.** Range-partition `usage_events` by month + BRIN on `event_ts` (append-only time-correlated data = BRIN sweet spot: tiny index, cheap range scans); detach and archive cold partitions. Covering index for the dashboard read path. The aggregator already shards per `(customer, hour)`, so more worker replicas absorb load.
- **100× — two hard walls that won't scale as-is.** (a) The synchronous `INSERT … RETURNING` ingest saturates connections before storage fills → front `POST /v1/events` with a durable log (Kafka/Kinesis), persist async, keep `UNIQUE(request_id)` as final dedupe. (b) The Postgres `jobs` table becomes a hot-write bottleneck competing with billing reads → move the queue to SQS behind the same enqueue/claim contract. Still-tuning knobs: read replicas for the dashboards, PgBouncer for connection fan-in.

## Idempotency & concurrency

Every external entry point is replay-safe *by construction* — a UNIQUE constraint + `ON CONFLICT` in a transaction, sometimes plus an advisory lock.

**Ingestion replayed.** Intra-batch dups collapse in code (first `request_id` wins); cross-request replays collapse at `INSERT … ON CONFLICT (request_id) DO NOTHING RETURNING id`. `accepted` is counted from `RETURNING`, not input length, so two concurrent requests with the same batch each report only the rows *they* inserted. In the same transaction, an `aggregate_window` job is enqueued (deduped) per touched hour — so a replay that inserts zero events enqueues zero work.

**Aggregator runs twice.** `recomputeWindow` is a pure function of the hour's events: `INSERT … SELECT sum/count … ON CONFLICT (customer_id, window_start) DO UPDATE SET total_units = excluded.total_units, version = version + 1`. Twice → identical totals, only `version` bumps. Two workers can't both reach it: `claim()` does `SELECT … FOR UPDATE SKIP LOCKED` + flip to `running` in one transaction, so overlapping cron ticks grab disjoint jobs; the partial dedupe index makes re-enqueue a no-op while a job is live.

**Webhook delivered three times.** HMAC-SHA256 over raw bytes verified first (constant-time). Then dedupe insert and invoice state change share **one transaction**: `INSERT INTO payment_events … ON CONFLICT (delivery_id) DO NOTHING RETURNING id`. Zero rows → redelivery → 200 no-op. One row → flip invoice `WHERE status IN ('draft','issued')`. Three deliveries → one insert → exactly one transition. A distinct delivery for an already-paid invoice records the event but moves no money (empty status guard).

**Ops clicks "issue credit" twice.** The client mints one `idempotency_key` per modal-open, reused across retries. `INSERT INTO credits … ON CONFLICT (idempotency_key) DO NOTHING RETURNING *` — the second click returns the existing credit (`deduplicated: true`) and, because dedupe short-circuits before the audit insert, writes **no** second `audit_log` row. Credit + audit are one transaction: never money without a trail or vice versa. The same key reused for a *different* customer → 409, not a leak of the first tenant's credit.

## Aggregation pipeline

**Events → windows → line items**, three stages joined by the job queue, never direct calls.

- **Raw events** are immutable, append-only, the source of truth; correctness reduces to "everything else is a deterministic function of this table."
- **Windows** are fully recomputable derived state. The pipeline sums *windows* into invoices (never raw events), but a window itself rebuilds from raw events anytime — the reconciliation lever.
- **Invoices**: a draft is recomputable (regeneration re-sums windows, replaces lines, absorbs late aggregation). Once **issued/paid it is immutable** — frozen, never silently rewritten. Line items carry `overridden` so a manual correction is visibly distinct from a generated charge.

The pipeline is event-driven, not scan-watermark: ingest enqueues the aggregation job *in the same transaction* as the insert, so the worker needs no "last processed" cursor. Invoice generation runs from a monthly cron (`0 2 1 * *` UTC) enqueuing a `generate_invoice` job per customer with windows in the closed period; the worker drains on a 10-second tick.

**Reconciling drift.** A window is a pure aggregate, so drift is *detectable* (re-run, compare) and *self-healing* (re-run overwrites). A late event into an **open** window re-enqueues → re-aggregates → bumps `version`; the next invoice run picks it up. Hard case: a late event for an already-issued/paid period — the invoice is frozen, so the correction becomes a next-period adjustment line or credit (design-only). A periodic re-aggregation job could alert on any `version` bump that changes a closed window's total, catching silent drift before it reaches an invoice.

## Failure modes (first to break)

1. **Stuck `running` jobs after a worker crash.** `claim()` flips a job to `running`; a crash mid-task leaves it locked forever and that window/invoice never completes. *Fix:* visibility timeout — reclaim jobs `running` past N minutes to `pending`, `attempts++`, dead-letter after a retry ceiling; alert on queue depth + DLQ.
2. **Ingest write amplification on `jobs`.** Each batch enqueues a job per touched hour in-transaction; at 2k events/sec across many hours the `jobs` table becomes a hot write path contending with the events insert. *Fix:* debounce enqueues (the active-dedupe index already absorbs repeats), and at the top end move the queue off the billing DB.
3. **Monthly invoice thundering herd.** The 02:00-on-the-1st cron enqueues every customer at once; at 5k+ the drain spikes DB load and a single failure hides in the burst. *Fix:* jitter enqueues, cap worker concurrency, and a completeness check (every customer with windows got an invoice) with alerting.

## Threat model

**Hostile customer.** Worst case: read/bill against another tenant, or forge attribution. Stopped by **scoping that can't be forgotten** — `ApiKeyGuard` resolves `customer_id` from the sha256 of `X-API-Key` and attaches it; controllers take tenant scope *only* from that decorator, never a path/body param, and events are attributed to the authenticating key (can't bill another customer by passing their id). A guessed cross-tenant id → **404, not 403** (existence never leaks). API keys are stored only as sha256 hashes, shown plaintext once at creation — a DB read yields no usable key. Replay is contained by `UNIQUE(request_id)`.

**Hostile internal user.** Worst case: self-grant credits, tamper with invoices, cover tracks. Every privileged mutation records the **server-verified** staff `sub` (from the JWT) as actor — never client-supplied — so credits/overrides are always attributable. `audit_log` is **append-only via a BEFORE UPDATE OR DELETE trigger** that raises; even the table owner can't rewrite history in-band (multi-role deploy also `REVOKE`s UPDATE/DELETE from the app role). A line-item override locks the invoice `FOR UPDATE`, writes a before/after audit pair, and **can't touch a paid invoice** (409 — correct it with a credit, never a silent edit). Overrides are deliberately *not* idempotent (absolute set), but the before→after chain makes every change reconstructable.

**Compromised webhook source.** Worst case: forge a "paid" event, or replay a real one to double-effect. Stopped by HMAC-SHA256 over the *raw* bytes (re-serializing parsed JSON breaks on key order/whitespace), constant-time compare with length guard, **fail-closed** if the secret is unset (500, never accept unverified). `delivery_id` UNIQUE + state change in one transaction = N redeliveries flip an invoice once. The `status IN ('draft','issued')` guard bounds blast radius: a valid-but-malicious event moves an invoice forward at most once, never re-charges a paid one.

## API & UI craft

**REST shape.** Resources, not RPC: `POST /v1/events`, `GET /v1/usage`, `GET /v1/invoices[/:id]`; `/ops/customers` (list/get/create, `:id/api-keys`, `:id/credits`), `PATCH /ops/invoices/:id/line-items/:lineId`; `POST /webhooks/payments`. Tenant scope is never a URL param on `/v1` — derived from the key — so there's no id to tamper with. A strict global `ValidationPipe` (`whitelist` + `forbidNonWhitelisted`) rejects unknown fields instead of ignoring them.

**Pagination, with reasoning.** Lists take `limit` (default 50, cap 200) + `offset`, returning `{ data, page: { limit, offset, total } }`. Offset is the deliberate v1 choice: simple, gives the total the dashboards show, fine at this cardinality. Its honest limit — deep skips get linearly slower and can skip/repeat rows under concurrent insert — is why **keyset/cursor paging on `(event_ts, id)` is the documented scale path**. The 200 cap bounds worst-case query cost regardless.

**Money-moving UI, safe by design.** The credit modal mints one `idempotency_key` (`crypto.randomUUID`) per open and **reuses it across retries**, so a double-click credits exactly once (server dedupes); the key is shown for audit, submit disables in-flight, and `deduplicated: true` is surfaced honestly. The override modal — *not* idempotent — forces a confirm that **restates before → after** and requires a reason (both audited); a paid line is locked in-UI and a server 409 is surfaced if state changed underneath. Both consoles treat 401 as "clear creds, back to the gate." Amounts/dates are formatted client-side from the API's integer cents / ISO — **the SPA does no money math** beyond a dollars↔cents parse. Loading and error states are explicit on every fetch.

## Operational thinking

**Debugging a wrong invoice.** An operator works backward through three immutable layers. (1) `invoice_line_items` shows each tier's `units`, `rate_microdollars`, `amount_cents`, `overridden`. (2) If overridden, `audit_log` (by `entity_type='invoice'`, `entity_id`) holds the **before → after** pair, the `actor`, and the reason — fully reconstructable and attributable. (3) If the *generated* numbers look wrong, line units must equal the sum of `usage_windows` for the period; each window's `version` shows how often it re-aggregated, and since `recomputeWindow` is pure over `usage_events`, the operator re-runs it and diffs the stored window to prove whether the window or the raw events are at fault. Nothing in the chain can be silently rewritten.

**Migration story.** `synchronize: false` — schema changes only via ordered hand-written migrations that carry what an ORM can't (CHECKs, the audit trigger, the partial dedupe index, the REVOKE note). `data-source.ts` is shared by app and CLI, so dev (ts-node) and prod (compiled JS, `migration:run:prod`) run identical migrations. The demo entrypoint runs them on boot (idempotent); production makes this a **gated deploy step / init job** before the new version takes traffic — never by hand, never via `synchronize`.

**What we'd alert on.** Ingest lag (`received_at − event_ts`) and aggregation lag (oldest pending `aggregate_window` job); queue depth + oldest-job age per type; jobs stuck `running` past the visibility timeout, and DLQ count; **invoice completeness** after the monthly run; webhook signature-failure rate (a spike = misconfigured or hostile sender); any `version` bump that changes a closed window's total. Structured logs keyed by the prefixed ids make a request or job traceable end to end.

The ops console flags a usage window when its units ≥ 10× the customer's *own* 30-day hourly average (a per-customer baseline, so a naturally high-volume tenant isn't falsely flagged). Honest weakness: the spike is included in the average it's compared against, so one large isolated spike among few windows pulls the mean up and can hide itself — a robust version uses median/MAD or a trailing baseline that excludes the window under test. It's a useful ops *signal*, not an alarm.

## Two non-obvious decisions

**1. Per-line rounding, not round-the-total-once.** Money is integer cents stored, integer microdollars (1e-6 USD) for sub-cent rates like $0.001 — no floats. Each line rounds to cents (half-up); the subtotal is the sum of line cents. *Rejected:* compute one exact grand total in microdollars and round once — arguably more accurate by a fraction of a cent, but it yields an invoice whose lines don't add up to its total. Chose per-line because **every line must be a real amount a customer can check by hand**; the sub-cent total discrepancy is the documented cost.

**2. Event-driven enqueue in-transaction, not a periodic scan.** Ingest enqueues the aggregation job in the same transaction as the insert. *Rejected:* a worker that scans `usage_events` for an un-aggregated watermark — needs a reliable cursor, re-scans for late events, races writers. Enqueue-in-tx makes the worker stateless and never-misses; the cost is `jobs`-table write amplification (failure mode #2) — the better problem, because it's throughput tuning, not correctness.

## Testing

Two tiers, split by what they prove. **Unit** (`npm test`, no DB) covers pure logic where a mock means something: money round-half-up + tiered-charge boundaries (incl. the documented 150k → $115.00), staff-JWT rejections (`alg=none`, RS↔HS confusion, tamper, expiry), id format/collision. **Integration** (`npm run test:int`, real throwaway Postgres, `--runInBand`) covers the boundaries the grade weights — where a mock would prove nothing because the guarantees *are* engine behavior: idempotent ingest replay, concurrent aggregator claiming disjoint jobs via `SKIP LOCKED`, double-credit → one credit + one audit row, cross-tenant read → 404, webhook 3× → one effect, tiered math + per-line rounding invariant, and `UPDATE`/`DELETE` on `audit_log` blocked by the trigger. The harness migrates a real `metered_test` DB and truncates between tests, wiring real services *without* the `@Cron` workers. Tests cover what breaks in production, not getters. Gap: no CI yet; the suite assumes a local Docker Postgres.

## What's built vs. next

**Built:** the full pipeline with the job queue; tiered pricing on effective-dated plans; signed idempotent webhooks; staff JWT auth for `/ops` (HS256, algorithm-pinned, fail-closed); credits + line-item overrides with audit trail; append-only audit enforcement; per-customer anomaly flagging; two SPAs; two-tier tests.

**Next, in order:** (1) **Close the credits-on-invoice loop** — credits are recorded but account-level (`invoice_id` NULL), not yet subtracted into `total_cents` at generation. (2) **Late-event adjustment for closed periods** — a frozen invoice's late events should become a next-period adjustment line or credit (the one design-only correctness gap). (3) **Job durability** — visibility-timeout reclaim, retry/backoff, dead-letter (failure mode #1). (4) **Real staff identity** — SSO/OIDC + RBAC + revocation, replacing the dev token-minting script. (5) **Observability + CI** — lag metrics, readiness probes, suites in CI against ephemeral Postgres.
