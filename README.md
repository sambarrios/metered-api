# metered-api

A small, self-contained **metered API billing** demo: ingest raw usage events, aggregate them into hourly windows, roll those up into monthly tiered invoices, and mark invoices paid via signed payment webhooks. Built to showcase the billing pipeline and its correctness properties (idempotent ingest, exactly-once webhooks, deterministic money math), **not** as a production billing system.

## What's in it

A non-workspace monorepo under `apps/` (each app installs and runs independently — there is no root `package.json`):

| App | Stack | Purpose |
|-----|-------|---------|
| `apps/api` | NestJS + TypeORM + Postgres | The backend: ingestion, aggregation, invoicing, ops, webhooks. |
| `apps/customer-web` | Vite + React | Customer dashboard — usage chart + invoice list/detail. Calls `/v1`. |
| `apps/ops-web` | Vite + React | Internal ops console — customers, credits, line-item overrides. Calls `/ops`. |

The pipeline: **`POST /v1/events` → `usage_events` → (job queue) → hourly `usage_windows` → (monthly job) → draft `invoices` → payment webhook marks paid.** Stages are decoupled by a Postgres-backed job queue (`FOR UPDATE SKIP LOCKED`), so workers are safe to overlap. See `CLAUDE.md` for the architecture in depth.

## Running it (demo)

Everything runs against Postgres, which ships in the compose file.

### Option A — one command (full stack in Docker)

```bash
docker compose up --build
```

That's it. Compose brings up the whole stack:

- **db** — Postgres (`:5432`), with a healthcheck the API waits on.
- **api** — the NestJS backend on **http://localhost:3000**. Its entrypoint **runs migrations automatically** (`migration:run:prod` against the compiled data source) before starting, so the schema is ready on first boot. Migrations are idempotent, so restarts are safe.
- **web-customer** — Vite dev server on **http://localhost:5173** (proxies `/v1` to the api container).
- **web-ops** — Vite dev server on **http://localhost:5174** (proxies `/ops` to the api container).

The dev servers reach the API over the Docker network via `VITE_PROXY_TARGET=http://api:3000`. To explore the UIs you still need to seed a customer/API key and mint a staff token. The seed/mint/generate scripts run from the **host** (they're ts-node tools and target the published ports `localhost:5432`/`localhost:3000`) — see [Seed sample data](#seed-sample-data-and-explore). For `mint:staff`, set `STAFF_JWT_SECRET` to match the compose value (`dev-staff-secret-change-me`) so the token verifies against the running API.

### Option B — API on the host

```bash
docker compose up db             # Postgres only
cd apps/api
npm install
npm run migration:run            # create the schema (synchronize is off)
npm run start:dev                # API on :3000
```

### Seed sample data and explore

All dev/demo scripts live in `apps/api` and are **dev-only** (never run in prod):

```bash
cd apps/api
npm run seed:dev                 # create a demo customer + API key (printed once)
npm run mint:staff -- you@ops    # mint a staff JWT for /ops + the ops console

# drive the whole pipeline with synthetic traffic:
npm run gen:events -- --key <apiKey> --events 5000 --hours 24 --late 0.03 --replay
#   --spike  concentrate a burst in one hour;  --replay  re-send a batch to show dedupe

npm run gen:invoice -- <customerId>   # generate a draft invoice now (skip the monthly cron)
```

### Use the UIs

```bash
cd apps/customer-web && npm install && npm run dev   # http://localhost:5173 (proxies /v1)
cd apps/ops-web      && npm install && npm run dev   # http://localhost:5174 (proxies /ops)
```

- **customer-web** authenticates with the seeded API key (`X-API-Key`) and shows usage + invoices.
- **ops-web** authenticates with the minted staff JWT (`Authorization: Bearer …`) and lets staff manage customers, grant credits, and override invoice line items.

Both proxy their API prefix to `:3000` in dev; set `VITE_API_URL` to point at a deployed API instead (CORS is enabled).

## Demo-only shortcuts

This repo deliberately trades production concerns for a clear demo. Notable simplifications:

- **No real identity for staff** — `mint:staff` stands in for an IdP issuing tokens; there is no staff user store, roles, or revocation.
- **Secrets are dev defaults** in `docker-compose.yml` (`WEBHOOK_SIGNING_SECRET`, `STAFF_JWT_SECRET`, DB password).
- **Workers run in-process** on cron timers inside the single API instance.
- **Credits are recorded but not yet applied** to invoice totals; late events for a *closed* period are not auto-adjusted (frozen invoices are documented as a next-period concern).
- **Migrations run automatically** on api container start (via the entrypoint); **seeding stays manual** so the demo data is explicit and opt-in.

## What it would take to make it production-ready

- **Secrets & config**: move all secrets to a secret manager; rotate the webhook/JWT secrets; per-environment config; never ship dev defaults.
- **Staff auth**: replace the minted-token script with real SSO/OIDC, roles/permissions, and token revocation. Rate-limit and lock down `/ops`.
- **Migrations on deploy**: run migrations as a gated deploy step (or init container/job), not by hand.
- **Job durability**: add retry/backoff, a dead-letter state, and visibility-timeout reclaim for jobs stuck in `running` (a crashed worker currently leaves them locked). Alert on queue depth and failed jobs.
- **Webhook hardening**: enforce timestamp tolerance / replay window in addition to the HMAC, and verify payment-provider event ordering.
- **Observability**: structured logs, metrics, tracing, and health/readiness probes wired to orchestration; dashboards for ingest lag, aggregation lag, and invoice generation.
- **API hardening**: request rate limiting/quotas per key, pagination limits, input size caps, and idempotency keys surfaced in the public contract.
- **Correctness for closed periods**: implement the credits-on-invoice path and the late-event next-period adjustment that are currently design-only.
- **Testing/CI**: run unit + integration suites in CI against ephemeral Postgres; add load tests around ingest and aggregation.

## How to scale it

The design already anticipates scale-out; the main moves:

- **Stateless API + separate workers**: the API is stateless behind a load balancer. Split the cron workers out of the API process into their own deployment so ingest throughput and background processing scale independently.
- **Horizontal workers, no re-architecture**: the job queue already claims with `FOR UPDATE SKIP LOCKED` and dedupes on insert, so you can run *many* worker replicas safely today. Increase replicas and batch sizes as volume grows.
- **Ingest throughput**: front `POST /v1/events` with a durable log/stream (e.g. Kafka/Kinesis) and persist asynchronously if write volume outgrows direct Postgres inserts; keep the `UNIQUE(request_id)` dedupe.
- **Database**: read replicas for the dashboards' read paths; connection pooling (PgBouncer); partition `usage_events`/`usage_windows` by time and archive cold partitions; consider a purpose-built store for high-cardinality usage if needed.
- **Aggregation**: the recompute is keyed per `(customer, hour)` and idempotent, so it shards naturally by customer and parallelizes without coordination.
- **Queue**: if Postgres becomes the bottleneck, the queue interface can be swapped for a dedicated broker while keeping the same enqueue/claim contract.

---

For build/test commands and the internal architecture, see [`CLAUDE.md`](./CLAUDE.md).
