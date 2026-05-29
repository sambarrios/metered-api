# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Metered API billing demo: a NestJS API plus two React SPAs. Raw usage events are ingested, aggregated into hourly windows, then rolled up into monthly tiered invoices that payment webhooks mark paid. The repo is a non-workspace monorepo under `apps/` — each app has its own `package.json` and is installed/run independently (no root `package.json`).

- `apps/api` — NestJS + TypeORM + Postgres. The whole backend (ingestion, aggregation, invoicing, ops, webhooks).
- `apps/customer-web` — Vite/React customer dashboard (usage chart + invoices). Calls `/v1`.
- `apps/ops-web` — Vite/React internal ops console (customers, credits, line-item overrides). Calls `/ops`.

## Commands

All API commands run from `apps/api`. Postgres must be up first: `docker compose up db` from the repo root.

```bash
# api (from apps/api)
npm run start:dev          # watch-mode dev server on :3000 (requires Postgres)
npm run build              # nest build -> dist/
npm run typecheck          # tsc --noEmit
npm run lint               # eslint src/**/*.ts
npm test                   # unit tests only (*.spec.ts, no DB)
npm run test:int           # integration tests (*.int-spec.ts) against real Postgres, serial
npm run test:all           # unit then integration
npm test -- money.spec     # run a single test file by name pattern

# migrations (TypeORM CLI via ts-node, from apps/api)
npm run migration:run
npm run migration:generate src/database/migrations/<Name>
npm run migration:revert

# helper scripts (from apps/api)
npm run seed:dev           # seed a dev customer + api key
npm run mint:staff         # mint a staff JWT for /ops + ops-web
npm run gen:events         # synthesize usage events
npm run gen:invoice        # generate an invoice on demand

# frontends (from apps/customer-web or apps/ops-web)
npm run dev                # vite dev server (customer-web :5173, ops-web :5174)
npm run build              # tsc --noEmit && vite build
```

Full stack via Docker: `docker compose up` builds and runs the API against Postgres. The API **requires Postgres to boot**.

### Tests

- Unit tests (`*.spec.ts`) use the default jest config in `package.json` (`rootDir: src`) and touch no DB.
- Integration tests (`*.int-spec.ts`) use `test/jest-int.json`, run `--runInBand`, and talk to a **real throwaway Postgres** (`metered_test`). The harness (`test/harness.ts`) creates+migrates the DB on demand and truncates mutable tables between tests, so the actual correctness mechanisms (UNIQUE/ON CONFLICT, `FOR UPDATE SKIP LOCKED`, advisory locks, the append-only audit trigger) are exercised against the engine, not mocks. Override the DB via `TEST_PG_*` env vars.

## Architecture

### Data pipeline: events → windows → invoices

The billing pipeline is three stages connected by a Postgres-backed job queue, not direct calls:

1. **Ingest** (`events/`, `POST /v1/events`): batch insert of `usage_events`, deduped by `UNIQUE(request_id)` + `ON CONFLICT DO NOTHING`. In the *same transaction*, an `aggregate_window` job is enqueued (deduped) for every hour bucket touched — so the aggregation worker never needs a scan watermark.
2. **Aggregate** (`aggregation/`): `AggregationWorker` cron drains `aggregate_window` jobs; `AggregationService.recomputeWindow` recomputes one hourly `usage_windows` row as a pure idempotent upsert of `usage_events` for that hour (the `version` counter just records re-aggregation from late events).
3. **Invoice** (`invoices/`): `InvoiceWorker.closePreviousMonth` cron (02:00 UTC on the 1st) enqueues a `generate_invoice` job per customer with usage in the closed month; `drain` processes them. `InvoiceGenerationService` sums the windows, applies tiered pricing, and writes a draft invoice + line items.

### Job queue (`jobs/`)

`JobQueueService` is the concurrency backbone. Jobs live in the `jobs` table. `claim()` selects due rows `FOR UPDATE SKIP LOCKED` and flips them to `running` in one transaction, so overlapping cron ticks / multiple workers never grab the same job. `enqueue()` uses `ON CONFLICT DO NOTHING` on an active-dedupe index keyed by `dedupeKey` (e.g. `agg:<customer>:<window>`, `inv:<customer>:<period>`), and accepts a caller's `EntityManager` to enqueue atomically with the rows that produced the work. Both workers run on `@Cron(EVERY_10_SECONDS)`.

### Idempotency & correctness (the point of the demo)

Every external entry point is replay-safe by construction — usually via a UNIQUE constraint + `ON CONFLICT` inside a transaction, sometimes plus an advisory lock:

- **Ingest**: intra-batch dups collapse in code (first wins); cross-request replays collapse at `UNIQUE(request_id)`. `accepted` is counted from `RETURNING`, so concurrent dup inserts report correctly.
- **Invoice generation**: runs under `pg_advisory_xact_lock` per `(customer, period)` with `UNIQUE(customer_id, period_start)` as backstop. No invoice → insert draft; draft exists → replace line items/totals (picks up late aggregation); **issued/paid → frozen, left untouched**.
- **Webhooks**: HMAC verified over the raw body, then the dedupe insert (`UNIQUE(delivery_id)`) and the invoice state change share one transaction, so N redeliveries flip the invoice exactly once. Paid transition is idempotent; failed payments are recorded but don't move the invoice.

### Money math (`common/money.ts`)

No floats in money. Amounts persisted/returned as **integer cents**; per-unit rates and intermediate products in **integer microdollars** (1e-6 USD, since rates are sub-cent like $0.001). Tiered pricing via `computeTieredCharge` (pure). Rounding policy is **per-line, round-half-up** at the line boundary, then the subtotal is the sum of line cents — so each line is self-consistent (this can differ from rounding the grand total once; that's the documented choice).

### Auth — two fully separate paths

- **Customer** (`/v1/*`): `ApiKeyGuard` checks the `X-API-Key` header by sha256 → `api_keys` lookup. On success it attaches `customerId`/`apiKeyId` to the request — **the single source of tenant scope** (read via `current-customer.decorator`). Events are attributed to the authenticating key, never a client value. 401s leak nothing about which keys exist.
- **Staff** (`/ops/*`): `StaffGuard` verifies an HS256 JWT (`STAFF_JWT_SECRET`) from `Authorization: Bearer`. Both guards **fail closed** when their secret is unset (500, never silently open). Ops mutations (credits, line-item overrides) record the staff `sub` as the actor in `audit_log`.

### Route surface

- `POST /v1/events` — ingest (api key)
- `GET /v1/usage`, `GET /v1/invoices`, `GET /v1/invoices/:id` — customer reads (api key)
- `ops/customers` (list/get/create, `:id/api-keys`, `:id/credits`), `PATCH /ops/invoices/:id/line-items/:lineId` — staff JWT
- `POST /webhooks/payments` — payment webhook (HMAC, no guard)
- `GET /health`

### Persistence

TypeORM, `synchronize: false` — **schema changes go through migrations only** (`src/database/migrations/`). `data-source.ts` holds the shared `dataSourceOptions` used by both the app and the migration CLI, and lists every entity explicitly (robust across ts-node and compiled dist). `DATABASE_URL` defaults to the local Docker Postgres. IDs are prefixed base36 (`cus_…`, `inv_…`, `job_…`) from `common/id.ts` — greppable and type-encoding. `main.ts` boots with `rawBody: true` (needed for webhook HMAC) and a strict global `ValidationPipe` (`whitelist` + `forbidNonWhitelisted`).

### Frontends

Both SPAs are plain Vite/React (no router/state library). In dev each proxies its API prefix to `:3000` (customer-web proxies `/v1`, ops-web proxies `/ops`) so the client uses same-origin relative paths; set `VITE_API_URL` to point at the API directly for other deployments (the API has CORS enabled). ops-web runs on `:5174` so both consoles run side by side.

## Notes

`notes/` is gitignored (private take-home brief + implementation plan) — don't commit it or copy its contents into tracked files. There is a deferred `DESIGN.md` deliverable; `common/money.ts` already references it for the money rules.
