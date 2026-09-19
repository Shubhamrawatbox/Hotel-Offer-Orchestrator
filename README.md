# Hotel Offer Orchestrator

Aggregates overlapping hotel offers from two suppliers, deduplicates them by hotel name and
returns the best-priced offer for each hotel. The comparison is orchestrated by a
[Temporal](https://temporal.io) workflow; the deduplicated result is cached in Redis, which also
performs the price-range filtering.

**Stack:** Node.js 20 · TypeScript · Express · Temporal · Redis · Docker Compose

---

## Contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Quick start (Docker)](#quick-start-docker)
- [Running locally without Docker](#running-locally-without-docker)
- [API reference](#api-reference)
- [How the orchestration works](#how-the-orchestration-works)
- [How price filtering happens inside Redis](#how-price-filtering-happens-inside-redis)
- [Mock supplier data](#mock-supplier-data)
- [Simulating a supplier outage](#simulating-a-supplier-outage)
- [Postman collection](#postman-collection)
- [Configuration](#configuration)
- [Project layout](#project-layout)
- [Tests](#tests)
- [Design decisions](#design-decisions)
- [Troubleshooting](#troubleshooting)

---

## What it does

`GET /api/hotels?city=delhi` triggers a Temporal workflow that:

1. calls **Supplier A** and **Supplier B** in parallel;
2. deduplicates hotels by name;
3. keeps the **cheaper** offer when a hotel appears in both feeds, and keeps the single offer when
   only one supplier has it;
4. writes the deduplicated list to Redis;
5. applies the `minPrice` / `maxPrice` filter **inside Redis** when one is requested;
6. returns the final list to the client.

If one supplier fails the workflow still returns the other supplier's offers and flags the response
as degraded. If both fail the request returns `502`.

---

## Architecture

```
                    ┌──────────────────────────────────────────────┐
  GET /api/hotels   │                  api container               │
  ────────────────► │  Express                                     │
                    │    ├── /api/hotels ──► Temporal client ──────┼──┐
                    │    ├── /supplierA/hotels  (mock supplier)    │  │
                    │    ├── /supplierB/hotels  (mock supplier)    │  │  start workflow
                    │    ├── /health            (Redis, Temporal,  │  │  + await result
                    │    │                       both suppliers)   │  │
                    │    └── /admin/...         (outage switches)  │  │
                    └──────────────────────────────────────────────┘  │
                                       ▲                              ▼
                       HTTP calls to   │                  ┌──────────────────────┐
                       the suppliers   │                  │   Temporal server    │
                                       │                  │   (+ PostgreSQL)     │
                    ┌──────────────────┴───────────────┐  └──────────────────────┘
                    │              worker container    │             ▲
                    │  hotelOfferWorkflow              │             │ polls task queue
                    │    ├── fetchSupplierOffers  (A)  │─────────────┘  "hotel-offers"
                    │    ├── fetchSupplierOffers  (B)  │   (run in parallel)
                    │    ├── selectBestOffers          │
                    │    ├── cacheOffers ──────────────┼──► ┌─────────┐
                    │    └── queryCachedOffers ────────┼──► │  Redis  │
                    └──────────────────────────────────┘    └─────────┘
```

The API and the worker run the **same image** with different entrypoints. The worker calls the mock
supplier endpoints over HTTP exactly as it would call a real third-party supplier.

---

## Quick start (Docker)

Requires Docker Desktop (or Docker Engine) with Compose v2.

```bash
docker compose up --build
```

First run takes a couple of minutes: it builds the app image and pulls Temporal, PostgreSQL and
Redis. The worker retries its Temporal connection while the server finishes its schema setup, so
startup ordering takes care of itself.

Once `hoo-api` and `hoo-worker` are up:

```bash
curl "http://localhost:3000/api/hotels?city=delhi"
```

| Service        | URL                     | Notes                              |
| -------------- | ----------------------- | ---------------------------------- |
| API            | http://localhost:3000   | the service itself                 |
| Temporal UI    | http://localhost:8080   | inspect every workflow execution   |
| Temporal gRPC  | localhost:7233          |                                    |
| Redis          | localhost:6379          |                                    |

Tear down:

```bash
docker compose down -v
```

> **Port 3000 already in use?** The host port is configurable — the container always listens on
> 3000 internally:
>
> ```bash
> API_PORT=3100 docker compose up --build
> ```

---

## Running locally without Docker

You still need Redis and Temporal. The lightest way to get them is:

```bash
docker compose up -d redis postgresql temporal temporal-ui
```

Then, in the project root:

```bash
npm install
cp .env.example .env     # on Windows: copy .env.example .env
npm run build
```

Start the two processes in separate terminals:

```bash
npm run start:worker
```

```bash
npm run start:api
```

For development with reload on change, use `npm run dev:worker` and `npm run dev:api` instead.

---

## API reference

### `GET /api/hotels`

| Query param | Required | Description                                        |
| ----------- | -------- | -------------------------------------------------- |
| `city`      | yes      | Destination, case-insensitive (`delhi`, `mumbai`, `goa`) |
| `minPrice`  | no       | Lower bound, inclusive                             |
| `maxPrice`  | no       | Upper bound, inclusive                             |

Either bound may be supplied on its own. `minPrice` must not exceed `maxPrice`.

**`200 OK`** — the body is a bare array, sorted by ascending price:

```json
[
  {
    "name": "Holtin",
    "price": 5340,
    "supplier": "Supplier B",
    "commissionPct": 20
  },
  {
    "name": "Radison",
    "price": 5900,
    "supplier": "Supplier A",
    "commissionPct": 13
  }
]
```

Everything else about the run travels in response headers, so the body stays exactly the documented
shape:

| Header                   | Meaning                                                   |
| ------------------------ | --------------------------------------------------------- |
| `x-request-id`           | Correlation id (echoed from the request, or generated)     |
| `x-workflow-id`          | Temporal workflow id — paste it into the Temporal UI       |
| `x-run-id`               | Temporal run id                                            |
| `x-offers-source`        | `suppliers`, or `redis` when a price filter was applied    |
| `x-total-before-filter`  | Deduplicated count before the price filter                 |
| `x-suppliers-succeeded`  | e.g. `A,B`                                                 |
| `x-degraded`             | `true` when at least one supplier failed                   |
| `x-suppliers-failed`     | e.g. `A`                                                   |

**Error responses** use a consistent envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid query parameters",
    "details": [{ "field": "city", "message": "city is required" }],
    "requestId": "91d23525-d45a-452b-b756-0cba64b54c88"
  }
}
```

| Status | Code                        | When                                            |
| ------ | --------------------------- | ----------------------------------------------- |
| `400`  | `VALIDATION_ERROR`          | Missing city, bad price, `minPrice > maxPrice`  |
| `404`  | `NOT_FOUND`                 | Unknown route                                   |
| `502`  | `ALL_SUPPLIERS_UNAVAILABLE` | Neither supplier could be reached               |
| `503`  | `ORCHESTRATOR_UNAVAILABLE`  | Temporal is unreachable                         |
| `503`  | `CACHE_UNAVAILABLE`         | Redis lost the cached city mid-request          |
| `500`  | `INTERNAL_ERROR`            | Anything unexpected                             |

A city that neither supplier covers is **not** an error — it returns `200` with `[]`.

### `GET /supplierA/hotels` · `GET /supplierB/hotels`

The mock supplier APIs. Optional `?city=` narrows the feed; omitting it returns the whole catalogue.
`?fail=true` makes that single call return `503`.

```json
[
  {
    "hotelId": "a1",
    "name": "Holtin",
    "price": 6000,
    "city": "delhi",
    "commissionPct": 10
  }
]
```

### `GET /health`

Reports Redis, Temporal **and both suppliers** individually.

```json
{
  "status": "degraded",
  "service": "hotel-offer-orchestrator",
  "uptimeSeconds": 54,
  "checkedAt": "2026-09-19T11:58:15.002Z",
  "durationMs": 63,
  "checks": {
    "redis":     { "status": "up",   "latencyMs": 2,  "url": "redis://redis:6379" },
    "temporal":  { "status": "up",   "latencyMs": 8,  "address": "temporal:7233", "namespace": "default", "taskQueue": "hotel-offers" },
    "supplierA": { "status": "down", "latencyMs": 12, "error": "HTTP 503", "url": "http://api:3000/supplierA/hotels" },
    "supplierB": { "status": "up",   "latencyMs": 6,  "url": "http://api:3000/supplierB/hotels" }
  }
}
```

| `status`   | HTTP  | Meaning                                                        |
| ---------- | ----- | -------------------------------------------------------------- |
| `ok`       | `200` | Everything reachable                                           |
| `degraded` | `200` | One supplier is down — results will be partial but still served |
| `down`     | `503` | Redis or Temporal is unreachable, or **no** supplier is reachable |

`GET /health/live` (process liveness, no dependencies) and `GET /health/ready` (Redis + Temporal
only) are also available for container probes.

### Admin / test helpers

| Endpoint                              | Description                                         |
| ------------------------------------- | --------------------------------------------------- |
| `GET /admin/suppliers`                | Current outage state of both suppliers              |
| `POST /admin/suppliers/:id/outage`    | Body `{"down": true}` / `{"down": false}`           |
| `DELETE /admin/cache/:city`           | Drop a city's cached offers                         |

---

## How the orchestration works

The workflow lives in [`src/temporal/workflows.ts`](src/temporal/workflows.ts) and all side effects
live in [`src/temporal/activities.ts`](src/temporal/activities.ts).

```
hotelOfferWorkflow(city, minPrice?, maxPrice?)
  │
  ├─ Promise.allSettled([                    ← both suppliers, in parallel
  │      fetchSupplierOffers('A', city),
  │      fetchSupplierOffers('B', city),
  │  ])
  │     • 3 attempts, 200ms initial backoff, x2, capped at 2s
  │     • 4xx / malformed feed → SupplierPermanentError, not retried
  │     • timeout / 5xx / 429  → SupplierTransientError, retried
  │
  ├─ 0 suppliers succeeded?  → ApplicationFailure('AllSuppliersUnavailable') → HTTP 502
  │  1 supplier succeeded?   → carry on with partial data, flag as degraded
  │
  ├─ selectBestOffers(results)               ← dedupe by name, cheapest wins
  ├─ cacheOffers(city, offers)               ← write to Redis
  └─ queryCachedOffers(city, min, max)       ← only when a price filter was requested
```

Each request starts one workflow with a readable id (`hotel-offers:delhi:<requestId>`), so any
response header can be pasted straight into the Temporal UI at http://localhost:8080 to see the full
execution history — every activity, every retry, every input and output.

**Selection rules** (`src/domain/selectBestOffers.ts`):

- names are matched case-insensitively with whitespace collapsed, so `"  holtin"` and `"Holtin"` are
  the same hotel;
- the cheaper offer wins;
- on an exact price tie the **higher commission** wins — the guest pays the same either way, so the
  higher-margin offer is the better one to book;
- the result is sorted by ascending price.

---

## How price filtering happens inside Redis

Each city is stored as three keys:

| Key                     | Type   | Contents                                  |
| ----------------------- | ------ | ----------------------------------------- |
| `hotels:{city}:meta`    | string | `{ city, count, cachedAt }` — also the "is this city cached" marker |
| `hotels:{city}:index`   | zset   | normalized hotel name → **price as the score** |
| `hotels:{city}:offers`  | hash   | normalized hotel name → offer JSON        |

Because the price is the sorted-set score, the range filter is a `ZRANGEBYSCORE`. The whole filter
runs server-side in one round trip via a Lua script
([`src/redis/client.ts`](src/redis/client.ts)) — Node never pulls the full list and filters it in
memory:

```lua
if redis.call('EXISTS', metaKey) == 0 then
  return {0, {}}                                  -- cache miss
end

local names = redis.call('ZRANGEBYSCORE', indexKey, ARGV[1], ARGV[2])
local offers = {}
for i = 1, #names do
  local offer = redis.call('HGET', dataKey, names[i])
  if offer then
    offers[#offers + 1] = offer
  end
end

return {1, offers}
```

An omitted bound becomes `-inf` / `+inf`. Writes go through `MULTI`, so a reader never sees a
half-written city, and all three keys expire together (`CACHE_TTL_SECONDS`, default 300s).

---

## Mock supplier data

Both catalogues live in [`src/suppliers/catalog.ts`](src/suppliers/catalog.ts) and overlap on
purpose. For `delhi`:

| Hotel               | Supplier A | Supplier B | Winner                    |
| ------------------- | ---------: | ---------: | ------------------------- |
| Holtin              |       6000 |   **5340** | Supplier B                |
| Radison             |   **5900** |       6100 | Supplier A                |
| Taj Palace          |      12500 |  **11990** | Supplier B                |
| Leela Kempinski     |       9800 |          — | Supplier A (only feed)    |
| Ibis Aerocity       |       4200 |          — | Supplier A (only feed)    |
| Novotel Aerocity    |          — |       5100 | Supplier B (only feed)    |
| Bloomrooms Janpath  |          — |       3100 | Supplier B (only feed)    |

`mumbai` and `goa` are populated the same way. Any other city returns `[]` from both suppliers —
useful for the "no results" case.

Prices are fixed by default so tests can assert exact values. Set `SUPPLIER_PRICE_JITTER_PCT=15` to
make each call vary and watch the winning supplier flip between runs.

---

## Simulating a supplier outage

**Sticky outage** — affects `/api/hotels`, visible to both the API and the worker (the flag is kept
in Redis):

```bash
curl -X POST http://localhost:3000/admin/suppliers/A/outage -H "Content-Type: application/json" -d "{\"down\":true}"
```

```bash
curl "http://localhost:3000/api/hotels?city=delhi" -i
```

Every offer now comes from Supplier B, the status is still `200`, and the response carries
`x-degraded: true` with `x-suppliers-failed: A`. Take Supplier B down as well and the same request
returns `502 ALL_SUPPLIERS_UNAVAILABLE`.

Restore with `{"down": false}`.

**One-off failure** — affects only that single call to the mock endpoint:

```bash
curl "http://localhost:3000/supplierA/hotels?city=delhi&fail=true"
```

**At boot** — set `SUPPLIER_A_DOWN=true` (or `SUPPLIER_A_LATENCY_MS=5000` to force a timeout and
watch Temporal retry).

---

## Postman collection

Import [`postman/hotel-offer-orchestrator.postman_collection.json`](postman/hotel-offer-orchestrator.postman_collection.json).
Set the `baseUrl` collection variable if the API is not on `http://localhost:3000`.

23 requests across 5 folders, each with assertions:

| Folder                   | Covers                                                                    |
| ------------------------ | ------------------------------------------------------------------------- |
| Health                   | Aggregate health incl. both suppliers, liveness, readiness                |
| Mock suppliers           | Both feeds, overlap check, one-off forced failure                         |
| Hotels                   | Delhi happy path, price range, open-ended bound, mumbai, empty city, empty range |
| Validation               | Missing city, inverted range, non-numeric price, unknown route            |
| Supplier outage scenario | Take A down → degraded → take B down → `502` → restore both               |

The collection is safe to run top to bottom in the Collection Runner: the outage folder restores
both suppliers at the end. With Newman:

```bash
npx newman run postman/hotel-offer-orchestrator.postman_collection.json
```

---

## Configuration

Every value has a working default; see [`.env.example`](.env.example). `docker-compose.yml` sets its
own values, so a `.env` file is only needed for non-Docker runs.

| Variable                           | Default                                    | Description                                   |
| ---------------------------------- | ------------------------------------------ | --------------------------------------------- |
| `PORT`                             | `3000`                                     | API port                                      |
| `LOG_LEVEL`                        | `info`                                     | `fatal`…`trace`                               |
| `LOG_PRETTY`                       | `false`                                    | Human-readable logs (dev only)                |
| `REDIS_URL`                        | `redis://localhost:6379`                   |                                               |
| `CACHE_TTL_SECONDS`                | `300`                                      | Lifetime of a cached city                     |
| `TEMPORAL_ADDRESS`                 | `localhost:7233`                           |                                               |
| `TEMPORAL_NAMESPACE`               | `default`                                  |                                               |
| `TEMPORAL_TASK_QUEUE`              | `hotel-offers`                             | Must match between API and worker             |
| `WORKFLOW_EXECUTION_TIMEOUT_MS`    | `60000`                                    |                                               |
| `SUPPLIER_A_URL` / `SUPPLIER_B_URL`| `http://localhost:3000/supplier{A,B}/hotels` | Where the worker finds the suppliers        |
| `SUPPLIER_TIMEOUT_MS`              | `3000`                                     | Per-attempt HTTP timeout                      |
| `SUPPLIER_A_DOWN` / `_B_DOWN`      | `false`                                    | Start with a supplier down                    |
| `SUPPLIER_A_LATENCY_MS` / `_B_`    | `0`                                        | Inject latency into the mock feeds            |
| `SUPPLIER_PRICE_JITTER_PCT`        | `0`                                        | Randomise mock prices by ±N%                  |
| `WORKER_MAX_CONCURRENT_ACTIVITIES` | `50`                                       |                                               |
| `API_PORT`                         | `3000`                                     | Host port in `docker-compose.yml` only        |

Invalid values fail fast at boot with a message naming the offending variable, rather than surfacing
later as a confusing runtime error.

---

## Project layout

```
src/
├── api/
│   ├── routes/
│   │   ├── admin.ts           outage switches + cache invalidation
│   │   ├── health.ts          /health, /health/live, /health/ready
│   │   ├── hotels.ts          GET /api/hotels
│   │   └── mockSuppliers.ts   GET /supplierA|B/hotels
│   ├── app.ts                 Express assembly
│   ├── errors.ts              AppError — status + code + message
│   ├── middleware.ts          request id, access log, async wrapper, error handler
│   ├── server.ts              bootstrap + graceful shutdown
│   └── validation.ts          zod schemas for every input
├── domain/
│   ├── normalize.ts           shared name/city normalization
│   ├── selectBestOffers.ts    the dedupe + best-price rule (pure, unit-tested)
│   └── types.ts               dependency-free shared types
├── redis/
│   ├── client.ts              ioredis + the Lua price-filter command
│   └── hotelCache.ts          key layout, atomic writes, filtered reads
├── suppliers/
│   ├── catalog.ts             static mock supplier data
│   ├── outage.ts              Redis-backed outage switches
│   └── supplierClient.ts      HTTP client, validation, transient/permanent errors
├── temporal/
│   ├── activities.ts          the four activities
│   ├── client.ts              lazy, memoised Temporal connection
│   ├── hotelSearchService.ts  starts the workflow, maps failures to HTTP
│   ├── shared.ts              task queue + workflow id helper
│   ├── worker.ts              worker process
│   └── workflows.ts           hotelOfferWorkflow (sandbox-safe)
├── config.ts                  zod-validated environment
└── logger.ts                  pino
```

---

## Tests

```bash
npm test
```

12 unit tests covering the deduplication rules (overlap, single-supplier hotels, name
normalization, price ties, sort order, empty feeds) and the query-validation schema.

Type-check without emitting:

```bash
npm run typecheck
```

End-to-end coverage lives in the Postman collection, which exercises the real workflow against a
running stack.

---

## Design decisions

**Why the dedupe runs in an activity, not in the workflow.** Both are valid in Temporal. Putting it
in an activity makes the merge step a first-class event in the workflow history — you can open the
Temporal UI and see exactly what went in and what came out — while the rule itself stays a pure
function in `src/domain/` that is trivial to unit-test.

**Why `Promise.allSettled` and not `Promise.all`.** One unreachable supplier should not cost the
caller the other supplier's inventory. `allSettled` lets the workflow return partial results and say
so via `x-degraded`. Only when *both* suppliers fail does the request become a `502`.

**Why transient and permanent supplier errors are distinguished.** A `500` or a timeout is worth
retrying; a `404` or a malformed feed is not. The activity tags the failure and the workflow's
retry policy lists `SupplierPermanentError` as non-retryable, so a broken contract fails in
milliseconds instead of burning three attempts.

**Why the response body is a bare array.** The brief specifies that shape exactly. Diagnostics that
would otherwise force a wrapper object (workflow id, source, degraded flag) go in headers instead.

**Why the filter runs in Redis rather than in Node.** The brief asks for it, and it is the right
call: storing price as the sorted-set score turns the filter into a `ZRANGEBYSCORE`, so only the
matching rows cross the wire. The Lua script keeps the whole read to a single atomic round trip.

**Why the worker calls the mock suppliers over HTTP.** It would be faster to read the catalogue
in-process, but then the supplier integration would not be exercised at all — no timeouts, no
retries, no outage handling. Calling them over the network means swapping in a real supplier is a
URL change.

**Why an unknown city returns `200 []`.** A destination neither supplier covers is an empty result,
not a failure. Reserving error statuses for actual errors keeps client logic simple.

---

## Troubleshooting

**`/api/hotels` hangs, then returns `503 ORCHESTRATOR_UNAVAILABLE`.**
The worker is not running or is polling a different task queue. Check `docker compose logs worker`
for `Worker started and polling` and confirm `TEMPORAL_TASK_QUEUE` matches on both processes.

**`ports are not available: ... bind: address already in use`.**
Something else holds port 3000. Start with `API_PORT=3100 docker compose up` and use
`http://localhost:3100`.

**Worker logs `Temporal not reachable yet, retrying`.**
Normal on a cold start — the Temporal server runs its schema setup first. The worker retries for
about a minute. If it never connects, check `docker compose logs temporal`.

**`502 ALL_SUPPLIERS_UNAVAILABLE` when nothing should be down.**
An outage switch is probably still set from an earlier test. Check `GET /admin/suppliers` and reset
with `{"down": false}`.

**Everything returns the same prices every time.**
That is the default. Set `SUPPLIER_PRICE_JITTER_PCT=15` for variation.
