# Quota-aware architecture — free-plan limits, safeguards, failure behavior

Verified against official provider documentation on **2026-10-22**. The
non-negotiable goal of this setup is **zero unexpected billing**: every service
stays on its Free plan, nothing in this repository can upgrade a plan or enable
a paid add-on, and the code fails closed (controlled errors) before spending
quota it knows it does not have.

The runtime policy lives in [`functions/_lib/quota.ts`](../functions/_lib/quota.ts);
its admin snapshot endpoint is `GET /api/admin/quota`; its tests are
[`tests/quota.test.ts`](../tests/quota.test.ts) and
[`tests/quota-endpoints.test.ts`](../tests/quota-endpoints.test.ts).

## 1. Why this shape (service selection)

| Service                                         | Used for                                                                                                                                                                               | Why and not something else                                                                                                                                                                      |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cloudflare Pages Functions** (`functions/**`) | Every HTTP server-side operation: admin API, payments, webhooks, file serving, CSP/Turnstile                                                                                           | The Astro build is fully **static** (no adapter), so Astro API routes and Astro Actions do not exist in this deployment. Pages Functions give platform routing, the R2 binding and secret vars. |
| **Astro static assets**                         | All pages/UI                                                                                                                                                                           | Static requests are free and unlimited on Pages — the entire page surface sits outside the Workers quota.                                                                                       |
| **Appwrite SDK from the browser**               | Auth only: sign-in/out and JWT minting (`createJWT` is the bearer every `/api/*` call carries)                                                                                         | Session creation belongs in the browser. Row CRUD no longer goes direct: since multi-tenancy every tenant-scoped list/write passes `requireOrg` server-side (see §2) — `docs/multi-tenancy.md`. |
| **Appwrite REST from Functions (API key)**      | Tenant-scoped CRUD (`/api/data/*`), organizations/memberships, admin operations, private tables (`payments`, `support`, `audit_logs`), public invoice capability reads, profile writes | Row permissions are bypassed deliberately, server-side, behind `requireOrg`/`requireAdmin`/ownership checks — the membership row is re-read on every request.                                   |
| **Appwrite Functions**                          | **Not used**                                                                                                                                                                           | No genuinely async/scheduled/isolated work exists yet; an unused execution quota cannot be assumed available later.                                                                             |

**Shared quota rule:** every `/api/*` route and shell route here is a Pages
Function on the _same_ Cloudflare account and therefore consumes the _same_
Workers Free request quota (100,000 requests/day). There is no independent
"Pages Functions quota". Appwrite Functions (unused) would have their own
separate execution quota — also never treated as spare capacity.

## 2. Endpoint classification

| Endpoint                                                                                        | Class (per service rules)          | Server-side because                                                                                                                                  |
| ----------------------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET/PATCH /api/admin/users`, `PATCH/GET /api/admin/users/[id]`                                 | Privileged admin (Pages Function)  | Team-membership gate, API-key reads/writes, suspend capability, audit writes                                                                         |
| `GET/POST /api/admin/content`                                                                   | Privileged admin                   | Ownership-enforced writes as another user, zod validation, audit                                                                                     |
| `GET /api/admin/audit`, `GET /api/admin/support`, `PATCH /api/admin/support/[id]`               | Privileged admin                   | API-key reads of permission-less rows; audit trail                                                                                                   |
| **`GET /api/admin/quota`** (new)                                                                | Privileged admin                   | Quota counters/policy snapshot                                                                                                                       |
| `POST /api/payments/checkout`                                                                   | Secret-dependent billing mutation  | DOKU credentials, server-side pricing, duplicate-order guard                                                                                         |
| `POST /api/payments/doku-notify`                                                                | Webhook verification               | HMAC signature over raw body; settlement state machine                                                                                               |
| `GET /api/payments/status`                                                                      | Secret-dependent reconciliation    | Signed DOKU Check Status probe; throttled + breaker-protected                                                                                        |
| `GET /api/payments/portal`                                                                      | Server read of private data        | `payments` rows have empty permissions; only the API key can read them                                                                               |
| `GET /api/invoice/[id]`                                                                         | Server read with business gate     | Pro-plan 402 gate + owner-scoped row reads by API key                                                                                                |
| `GET/POST /api/quota/invoices`                                                                  | Session-scoped billing gate        | Free tier's 10-invoices-a-month counted server-side **per organization**; 402 when the month is spent                                                |
| `GET/POST/PATCH/DELETE /api/data/[resource]`                                                    | Session-scoped tenant CRUD         | `requireOrg` re-verifies membership per request; validated bodies, bulk-delete caps, org-scoped rows                                                 |
| `GET/POST /api/orgs`, `PATCH/DELETE /api/orgs/[id]`, members endpoints, `POST /api/orgs/accept` | Session-scoped tenant API          | Membership/ownership gates; org delete cascades rows server-side                                                                                     |
| `GET/PATCH /api/profile`                                                                        | Session-scoped tenant write        | The org's business profile (`profiles/<orgId>`), gated by `requireOrg`                                                                               |
| `POST /api/invoice/[id]/proof`                                                                  | File write (R2 binding)            | Turnstile verification, one-shot guard, R2 only exists in Functions                                                                                  |
| `POST /api/logo`, `GET/DELETE /api/logo/[key]`                                                  | File read/write (R2 binding)       | Session + ownership checks; private bucket                                                                                                           |
| `GET/DELETE /api/proof/[key]`                                                                   | File read/write (R2 binding)       | Capability URL + owner check; clears row reference                                                                                                   |
| `POST /api/support`                                                                             | Public write                       | Turnstile + validation + rate fence; permission-less row                                                                                             |
| `POST /api/turnstile`                                                                           | Public verification                | Secret lives only in Functions                                                                                                                       |
| `POST /api/csp-report`                                                                          | Public diagnostics                 | Rate-fenced log sink                                                                                                                                 |
| `/invoice/[id]`, `/templates/[id]` shells                                                       | Platform routing                   | Serve built shells under dynamic URLs; no redirects                                                                                                  |
| Invoice/template/customer/catalog CRUD                                                          | **`/api/data/*` (Pages Function)** | One transport for all tenant CRUD: org membership, quotas, validation and bulk caps enforced server-side (`src/app/data-api.ts` is the browser half) |

Nothing is duplicated across services: each operation has exactly one
implementation, and no handler was moved off its current runtime.

## 3. Verified Free-plan limits (official docs, 2026-10-22)

### Cloudflare

| Item                               | Free limit                                               | Behavior at the limit                                                       |
| ---------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------- |
| Workers / Pages Functions requests | **100,000/day** (shared quota; resets 00:00 UTC)         | Requests fail (Error 1027); **never converted to paid usage on Free**       |
| CPU per invocation                 | **10 ms** (wall-clock network wait excluded)             | Worker terminated (Error 1102)                                              |
| Pages builds                       | **500/month**, 1 concurrent, 20 min timeout              | Builds fail                                                                 |
| R2 storage                         | **10 GB-month**                                          | ⚠️ **Overage above the free allowance is metered and billed automatically** |
| R2 Class A ops                     | **1 million/month**                                      | ⚠️ billed at $4.50/million beyond                                           |
| R2 Class B ops                     | **10 million/month**                                     | ⚠️ billed at $0.36/million beyond                                           |
| R2 egress                          | free                                                     | —                                                                           |
| Turnstile                          | **unlimited challenges** (20 widgets, 10 hostnames each) | —                                                                           |
| Workers KV / Durable Objects       | not used by this project                                 | Operations fail at quota, not billed on Free                                |

Sources: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Pages limits](https://developers.cloudflare.com/pages/platform/limits/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [Turnstile plans](https://developers.cloudflare.com/turnstile/plans/).

### Appwrite Cloud (Free organization)

| Item                | Free limit                                                            | Behavior at the limit                      |
| ------------------- | --------------------------------------------------------------------- | ------------------------------------------ |
| Database reads      | **500,000/month** (counted **per row returned**, not per call)        | Throttled; no auto-charge                  |
| Database writes     | **250,000/month** (per row written)                                   | Throttled                                  |
| Storage             | **2 GB**, **3 buckets**                                               | Uploads refused                            |
| Bandwidth           | **5 GB/month**                                                        | API access denied until next cycle/upgrade |
| Realtime            | **2M messages/month, 250 connections** (enforcement since 2026-04-30) | Subscriptions disabled                     |
| Function executions | **750,000/month** + 100 GB-hours compute (unused here)                | Executions disabled                        |
| Plan changes        | **Free never auto-upgrades or charges**; Free orgs cannot buy add-ons | —                                          |

Sources: [Free plan](https://appwrite.io/docs/advanced/billing/free), [database reads/writes](https://appwrite.io/docs/advanced/billing/database-reads-and-writes), [pricing](https://appwrite.io/pricing).

**Usage measurement reality:** Appwrite Free exposes **no usage API** — the
Console's organization _Usage_ tab is the source of truth. Cloudflare exposes
Workers metrics and a GraphQL Analytics API, but Cloudflare states analytics
must not be used as a measure of billable usage. Therefore:

- `GET /api/admin/quota` reports **measured, isolate-local counters** (requests
  served, retries, rate-limit hits, breaker trips) labelled `single-isolate`,
  **never** a claim of remaining monthly quota.
- Monthly totals are **provider-dashboard numbers** (labelled as such in the
  endpoint: `dashboards.cloudflare`, `dashboards.appwrite`).
- Anything not directly measurable is documented as estimate/unknown — the
  endpoint contains no field that pretends otherwise.

## 4. Zero-billing safeguards

1. **Nothing here can change billing.** No API token in this repo has billing
   scope (deploy token = Pages Edit + R2 Edit), no plan-upgrade API is called,
   and Cloudflare/Appwrite do not auto-upgrade Free when quotas are hit —
   documented above and enforced by the providers.
2. **R2 is the one metered-overage risk** (free tiers are _included amounts_,
   not hard caps). Mitigations in code: 2 MB logo / 5 MB proof hard caps with
   early 413s, per-user upload rate fences (`logo-upload` 10/hour,
   `proof-upload` 6/hour anonymous, 30/hour owner), client-side delete of the
   superseded logo on replace (upload → persist → delete), proof delete clears
   both object and row, immutable caching on reads. **Residual risk + manual
   step:** see §6.
3. **Cost fences before provider calls.** `enforceLimit()` (sliding window,
   per-IP or per-user, `QUOTA_LIMIT_*` overrides) runs _before_ Turnstile
   siteverify, Appwrite reads/writes and R2 writes on: `support`, `turnstile`,
   `csp-report`, `proof` upload, `logo` upload, `checkout`. Over-budget callers
   get `429` + `retry-after` (client maps 429 to a non-retriable
   rate-limited error — no retry storms).
4. **DOKU circuit breaker.** After `QUOTA_DOKU_FAILURE_THRESHOLD` (default 5)
   consecutive transport/5xx failures the breaker opens for
   `QUOTA_DOKU_BREAKER_COOLDOWN_MS` (default 30 s): the status endpoint stops
   probing entirely (polls keep answering from our own row), and checkout
   fails fast with `503` + `retry-after` **before writing a payment row** —
   no stranded orders, no probe storms against a struggling gateway. One
   half-open probe per cooldown, success closes.
5. **Bounded, deduplicated, cached work.**
   - Session probe (`GET /account`) cached per isolate 60 s (keyed by token
     SHA-256) and single-flighted → one Appwrite call per burst of parallel
     requests; failures never cached.
   - Admin membership cached 60 s (mirrors the client's 10-minute cache).
   - `nextNumber` (the admin API's most expensive read: one read per invoice
     row) cached 30 s, invalidated on create, page-bounded by
     `QUOTA_NEXT_NUMBER_MAX_PAGES` with an honest `partial` flag; scans
     project only `$id` + `invoiceNumber`.
   - DOKU Check Status probes single-flighted per order; webhook settlements
     single-flighted per order (duplicates coalesce; state-machine
     idempotency still guards cross-isolate and sequential duplicates).
   - Appwrite GET reads retry once on transport/5xx errors with exponential
     backoff (`QUOTA_APPWRITE_READ_RETRIES`); **writes are never retried** —
     that is what prevents duplicate invoices/orders/webhook processing.
6. **Client-side dedup/caching already in place** (unchanged): TanStack Query
   `staleTime`/`gcTime` per datatype, no refetch on focus, non-retriable 429s,
   mutation retry disabled, session-keyed cache clearing on account switch.
7. **Fail closed for security.** Missing Turnstile secret → error (never
   "passed"); missing DOKU credentials → controlled 500; session probe failure
   → 401; breaker open → 503 with guidance, not a silent fallback to another
   provider.

## 5. Failure behavior at quota exhaustion

| Limit reached                      | What users see                                                                           | What the code does                                                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Cloudflare Workers 100k req/day    | Cloudflare's own Error 1027 on `/api/*` + dynamic shells (static pages keep working)     | Nothing to do in-code; cost safety beats availability. Rate fences make a legitimate day unlikely to reach it        |
| Cloudflare CPU 10 ms/invocation    | Error 1102 on that request                                                               | Backoff sleeps are I/O wait (not CPU); work was kept light; retries bounded at 1 by default                          |
| R2 overage threshold (storage/ops) | Requests keep succeeding — **and start incurring charges**                               | Code cannot see this; manual dashboard monitoring + alert is required (§6)                                           |
| Appwrite reads/writes exhausted    | Requests throttled by Appwrite → 429/5xx to the client                                   | Queries stop retrying on 429; reads retry 5xx once; mutations are not replayed; user sees the rate-limited copy      |
| Appwrite bandwidth exhausted       | API denied until next cycle                                                              | Failures surface as generic connection errors; no auto-retry loops                                                   |
| DOKU unreachable/failing           | Polls keep showing the order as it stands; checkout answers 503 "try again in N minutes" | Breaker stops probe spend; row state and webhook reconciliation resume when DOKU recovers; paid rows never roll back |
| Turnstile siteverify unreachable   | Upload/support answer 502, nothing stored                                                | Fail closed (gate cannot be bypassed by unreachability)                                                              |

## 6. Remaining risks, unsupported safeguards, manual configuration

**No code can do these — they need the provider dashboards:**

- [ ] **Cloudflare:** Workers & Pages → notain → confirm **Free plan** stays
      selected; R2 → set up a **spend/usage notification** for the `notain` bucket
      (Cloudflare's billing area → notifications/alerts). R2 has no hard
      spend-cap API on Free: the supported alternatives are alerts + keeping usage
      under the free allowances (the code's size caps and rate fences exist for
      exactly this).
- [ ] **Cloudflare:** confirm no Workers Paid subscription exists on the
      account (Billing → subscriptions). The repo's deploy token cannot create
      one; only a human can — do not add one.
- [ ] **Cloudflare:** budget/spend alert on the account if offered on Free, so
      an accidental paid resource is caught on day one.
- [ ] **Appwrite:** Console → organization **Usage** tab: check reads/writes
      trend against 500k/250k per month (no API for this exists on Free).
- [ ] **Appwrite:** confirm the org is on **Free** and no payment method /
      paid plan is attached (Billing settings).
- [ ] **DOKU:** sandbox credentials only; notification URL configured to
      `/api/payments/doku-notify`; re-verify after any domain change.

**Known limitations (honest list):**

- Quota state is **per isolate**: rate limits, caches and breakers reset when
  Cloudflare recycles an isolate, so they are burst protection, not
  fleet-global guarantees. No KV/D1 was added to persist them because that
  would spend quota to save quota (KV = 100k reads/day shared with everything
  else).
- No durable queue exists on this stack; retryable noncritical work is
  therefore **not queued** — the webhook is the only at-least-once source and
  it is DOKU's own retry mechanism, which is durable on DOKU's side.
- Cloudflare GraphQL analytics require an API token with Analytics read; that
  token is deliberately not in the repo. Use the dashboard for totals.
- Turnstile tokens are single-use and expire after 300 s — unrelated to
  quotas but verified alongside the above.
- This cannot promise unlimited compute, guaranteed zero downtime, or perfect
  zero-billing protection: the R2 overage risk is inherent to R2's
  included-amounts model, and a runaway viral invoice link consumes Worker
  requests until the daily free quota ends the day (with Error 1027, not a
  charge).

## 7. Tuning knobs

All optional Pages variables (unencrypted, defaults are safe): see the
`QUOTA_*` block in [`functions/_lib/types.ts`](../functions/_lib/types.ts)
and the defaults in [`functions/_lib/quota.ts`](../functions/_lib/quota.ts) —
`QUOTA_SESSION_CACHE_TTL_MS` (`0` disables), `QUOTA_ADMIN_CACHE_TTL_MS`,
`QUOTA_NEXT_NUMBER_CACHE_TTL_MS`, `QUOTA_NEXT_NUMBER_MAX_PAGES`,
`QUOTA_APPWRITE_READ_RETRIES`, `QUOTA_APPWRITE_RETRY_BASE_MS`,
`QUOTA_DOKU_FAILURE_THRESHOLD`, `QUOTA_DOKU_BREAKER_COOLDOWN_MS`, and the
`QUOTA_LIMIT_*` rate-fence family (`SUPPORT_PER_HOUR`, `TURNSTILE_PER_MINUTE`,
`CSP_PER_MINUTE`, `PROOF_PER_HOUR`, `PROOF_OWNER_PER_HOUR`, `LOGO_PER_HOUR`,
`CHECKOUT_PER_HOUR`).
