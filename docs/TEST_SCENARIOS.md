# Notain — Test Scenarios for Runtime Verification

> **Status and safety:** This is an audit-oriented scenario set, not a complete functional test plan; use [`BUSINESS_FLOWS.md`](./BUSINESS_FLOWS.md) for current product behavior and flow-level good/bad candidates. Several scenarios below had assumptions superseded by later code; TS-04, TS-10, and TS-13 are updated below. Nothing in this document was executed during this documentation work. Run only with isolated test accounts/data in preview or staging. Never use real payment credentials, send test webhooks to production, or delete production organizations.

Companion to [`CODEBASE_AUDIT.md`](./CODEBASE_AUDIT.md). These scenarios cover findings that **cannot be confirmed by static analysis alone** — they require running Pages Functions or the live Appwrite project. Nothing here was executed during the audit; everything below is a design, not a result.

Conventions:

- **DEV** = a local or preview environment exercising `functions/` via `npx wrangler pages dev dist` (the only local way to run Functions; `astro dev` proxies `/api` to production instead — `astro.config.mjs:199-216`). Use it for anything that must not touch production data.
- **PROD** = the deployed site with production Appwrite + R2 + (sandbox) DOKU.
- **Admin credentials** = an account on the Appwrite `admins` team; **owner** = an org owner; **member** = a non-owner member.
- Multi-isolate behavior (TS-01, TS-04, TS-05, TS-06) requires the deployed site — `wrangler pages dev` runs one isolate.

Priority legend: **P1** = do before next payment/launch milestone; **P2** = next hardening pass; **P3** = when convenient.

---

## A. Authentication & session isolation

### TS-01 — Cross-user session confusion (SEC-001) · P1 · integration testing

- **Related finding:** SEC-001 — `singleFlight(\`session:${token.slice(0,8)}\`)`in`functions/_lib/appwrite.ts:45` shares one in-flight verification across _different_ tokens.
- **Objective:** Prove (or refute) that two users verifying concurrently on a cold isolate receive their own sessions.
- **Preconditions:** Two independent accounts (A, B), each owner of its own org with at least one invoice. Deployed site (multiple isolates in the fleet). A way to force cache misses: fresh isolate after a deploy, or tokens older than `QUOTA_SESSION_CACHE_TTL_MS` (60 s).
- **Test steps:**
  1. Deploy (or wait out the TTL) so session caches are cold.
  2. From two machines (or two browser profiles), simultaneously (within the same network round trip) fire `GET /api/orgs` for account A and account B. Repeat the burst several times, varying which account fires first.
  3. Inspect each response: account A's org list must contain only A's orgs; likewise B.
  4. In a controlled variant on a single isolate (`wrangler pages dev` with a stub `GET /account` that logs the `X-Appwrite-JWT` per request), issue two concurrent `/api/orgs` calls with different JWTs and record which JWT the shared flight used.
- **Expected result:** Each caller's response reflects only its own account. The controlled variant shows one upstream `GET /account` per _distinct_ token — not one per _token prefix_.
- **Failure indicators:** Either response contains the other account's orgs; or the controlled variant shows both calls resolved from a single verification keyed by the shared `eyJ…` prefix (proving coalescence).
- **Note:** Even a "clean" result must be treated carefully — the shared-key structure is confirmed by code; the scenario establishes whether the timing window is reachable in practice.

### TS-02 — Session revocation lag vs cache TTL (CACHE-001) · P2 · manual testing

- **Related finding:** CACHE-001.
- **Objective:** Measure how long a signed-out/suspended account can still make authenticated `/api/*` calls.
- **Preconditions:** One test account; access to Appwrite console (to delete sessions / change status); deployed site.
- **Test steps:**
  1. Sign in, load the dashboard (warms the session cache on the isolate serving you).
  2. Delete all sessions for the account in the Appwrite console (or suspend the user).
  3. Immediately and then every 10 s up to 90 s, call `GET /api/orgs` from the still-open tab.
- **Expected result:** Calls begin failing with 401 at or before ~60 s (the configured TTL), never later; org membership removal (a different mechanism) takes effect on the very next call.
- **Failure indicators:** Authenticated responses persist past `QUOTA_SESSION_CACHE_TTL_MS +` slack.

### TS-03 — Session isolation on shared device (SEC-012) · P3 · manual testing

- **Objective:** Confirm no cross-account data bleed through the query cache, drafts, or the minted JWT on one browser.
- **Steps:** Sign in as A, browse invoices, open the invoice builder, sign out, sign in as B on the same tab, reopen the builder and dashboard.
- **Expected:** B sees only B's data; the draft area is B's or empty; no request carries A's JWT (Network tab).
- **Failure indicators:** A's invoice list/draft appears under B; an `Authorization` header with A's token after switching.

---

## B. Payments (P1 — money)

### TS-04 — Concurrent duplicate checkout backstop · P1 · integration testing (sandbox)

- **Status:** The old CONC-001 assumption that the duplicate guard is only a non-atomic query is superseded. Checkout now derives a deterministic payment-row ID per organization, plan, and month; Appwrite's unique document ID is the cross-isolate backstop, in addition to pending-row reuse/conflict handling.
- **Objective:** Regression-check that concurrent submissions do not create duplicate live DOKU orders.
- **Preconditions:** DOKU sandbox credentials; an isolated test organization owned by the test account; preview/staging deployment. Never use production credentials or a real paid checkout.
- **Test steps:**
  1. Fire `POST /api/payments/checkout` twice concurrently for the same org and `plan: 'pro'`.
  2. Repeat with staggered starts (0 ms, 50 ms, 250 ms), checking each response and the test organization's payment history.
  3. Repeat with two organizations to confirm the pending order is not shared across orgs.
- **Expected result:** One live pending order per org+plan submission window. The second request reuses the same checkout URL or receives a controlled 409 while creation is in flight. Different orgs remain isolated.
- **Failure indicators:** Two distinct live DOKU orders for the same concurrent org+plan submissions, or one org receiving another org's checkout URL.
- **Cleanup:** Use only sandbox test rows/orders and the provider's sandbox cleanup/expiry process; do not manipulate production payments.

### TS-05 — Webhook/status double settlement → double plan extension (CONC-002) · P1 · integration testing (sandbox)

- **Related finding:** CONC-002 — `settlePayment` read-modify-write without CAS across isolates.
- **Objective:** Prove whether a DOKU notification and a status-poll settlement landing on different isolates can both extend `planExpiresAt`.
- **Preconditions:** Sandbox DOKU; ability to (a) deliver a signed webhook (or trigger it from the sandbox back office) and (b) hit `GET /api/payments/status?invoice=…` from an authorized tab, near-simultaneously; the order must be older than `RECONCILE_MIN_AGE_MS` (60 s) so the status path will settle.
- **Test steps:**
  1. Create a checkout via the UI; pay in the DOKU sandbox; wait > 60 s but keep the row `pending` (block the webhook by pointing `override_notification_url` at a sink during setup, or temporarily misconfigure the Back Office URL).
  2. Record `planExpiresAt` of the org row.
  3. Deliver the signed webhook and, in the same second, fire the status endpoint (which reconciles and settles).
  4. Re-read `planExpiresAt`; also re-run step 3 five times.
- **Expected result (desired):** Expiry advanced exactly once (one plan duration from `paidAt`), regardless of how many settlements raced; repeat invocations are `noop`.
- **Failure indicators:** `planExpiresAt` advanced by two durations (double extension), or audit log shows two `payment.paid` rows for one payment id.
- **Variants:** two webhook deliveries in the same second (DOKU's documented retries).

### TS-06 — Webhook idempotency under DOKU retries (CONC-005 context, payment-settle docstring) · P1 · integration testing

- **Objective:** Confirm the documented idempotency claim end-to-end: the same SUCCESS notification delivered 3× activates once.
- **Steps:** Deliver the identical signed notification three times with 1–2 s gaps; check payment row status, org `planExpiresAt`, and audit rows.
- **Expected:** First delivery `applied: true`; second/third `applied: false` (`noop`); one `payment.paid` audit row; expiry moved once.
- **Failure indicators:** Any second `applied: true`, or expiry moved more than once.

### TS-07 — Amount mismatch refuses activation (payment-settle) · P1 · integration testing

- **Objective:** A signed notification whose `order.amount` differs from the stored row must not activate the plan, and must be audited.
- **Steps:** Create a checkout; deliver a signed notification with a tampered-but-validly-signed amount (re-sign with the sandbox secret in a test harness) or simulate by editing the row's `amount` between checkout and delivery.
- **Expected:** 200 with `applied: false`; row stays `pending`; an audit row `payment.amount-mismatch` exists.
- **Failure indicators:** Plan activated; or 500 (would make DOKU retry forever).

### TS-08 — Payment status ownership & probe throttling (API/RATE context) · P2 · integration testing

- **Objective:** (a) One account cannot poll another's order; (b) the Check-Status throttle actually bounds DOKU calls.
- **Steps:** (a) Owner A creates an order; signed-in account B calls `GET /api/payments/status?invoice=<A's order>` — expect 404. (b) While A's row is pending, poll every 3 s for 5 min from two tabs; count outbound `orders/v1/status` calls via DOKU sandbox logs or the Function logs (`doku.probe` counter).
- **Expected:** (a) 404; (b) probe frequency ≈ 2 per 15 s (the `inReconcileWindow` design), not 1 per 3 s.
- **Failure indicators:** B receives the row; probe rate tracks the poll rate.

---

## C. Rate limiting & abuse (needs live infra)

### TS-09 — Per-isolate rate-limit effectiveness (RATE-001) · P2 · load testing (staging only)

- **Objective:** Quantify how much the `checkout`/`proof-upload`/`logo-upload` limits drift from their configured values across the fleet.
- **Preconditions:** A staging deployment; a scripted client with a stable IP; `QUOTA_LIMIT_*` set to tiny values (e.g. checkout=3/hour) as ordinary Pages variables on the staging project only.
- **Steps:** Fire 20 sequential checkout attempts in one minute. Note which attempts return 429.
- **Expected (staging, single isolate):** requests 4+ are 429 with `retry-after`. On production (fleet): measure the same script — the number of allowed requests ≈ limit × (number of distinct isolates hit) reveals the multiplier.
- **Failure indicators:** On staging, more than limit requests succeed (limiter not working at all).

### TS-10 — Public invoice endpoint rate fence and cost · P2 · manual testing (staging)

- **Status:** The old “no rate fence” assumption is outdated. `GET /api/invoice/<id>` currently uses the `invoice-read` per-IP fence (60/minute by default), like the public site read.
- **Objective:** Verify the configured fence and bound read behavior without generating avoidable production traffic.
- **Preconditions:** Preview/staging test invoice in an active paid test organization, or an admin-owned test org; use only a controlled test IP.
- **Steps:** Make a small number of successful reads, then exceed the staging limit (lower it only in staging) and verify the rate-limited response and `retry-after`. Separately check malformed/unknown IDs return 404 and do not bypass the fence.
- **Expected:** Requests below the configured limit return the public payload; excess requests are rate-limited. Payload remains narrow and `no-store`.
- **Failure indicators:** The configured staging limit is not applied, foreign/internal data leaks, or the rate-limited response shape is uncontrolled.
- **Safety:** Do not run a high-volume loop against production or use provider usage counters as a justification for generating production reads.

### TS-11 — Turnstile bypass resilience on auth flows (RATE-004) · P2 · manual testing

- **Objective:** Establish what actually protects sign-in from a scripted client.
- **Steps:** From a script (no browser, no Turnstile token), attempt `POST /api/appwrite/account/sessions/email` with wrong-then-right credentials 30× in a minute against production; record status codes and any throttling behavior.
- **Expected (per the audit's assumption):** Appwrite Cloud applies its own (undocumented) throttle at some point; no notain-side fence exists.
- **Failure indicators:** All 30 attempts processed without any 429 — the app has zero effective brute-force protection beyond Appwrite's defaults; escalate the proxy-level fence recommendation.

---

## D. Quota & data integrity

### TS-12 — Free-tier quota bypass via direct create (QUOTA-001, documented) · P2 · integration testing

- **Objective:** Confirm the documented gap end-to-end: a client that skips the claim can still create invoices past the free limit.
- **Preconditions:** Fresh free org; `wrangler pages dev` with production-shaped env, or a throwaway org on production.
- **Steps:** Create 12 invoices by calling `POST /api/data/invoices` directly (script with the member's JWT), never calling `POST /api/quota/invoices`.
- **Expected:** All 12 succeed (documented behavior — the meter refuses via the claim, the endpoint does not re-count); `GET /api/quota/invoices` afterwards reports `used: 12, remaining: 0`.
- **Failure indicators:** Create #11+ is refused by the endpoint (finding does not exist as described); or `used` never reaches 12 (count walk broken).

### TS-13 — Quota meter read cost by plan · P2 · manual testing (staging)

- **Status:** The old paid-org full-history-walk assumption is outdated. Active paid organizations skip invoice-history counting; their quota response is unlimited (`remaining: null`). Free organizations perform the paginated count using invoice creation timestamps.
- **Objective:** Verify that the active-paid path stays cheap and that a Free meter reports the right calendar-month count.
- **Preconditions:** An isolated staging organization with an active paid test entitlement and a separate Free test organization. No production seed data.
- **Steps:** Read the quota for the paid org with a large synthetic invoice history, then read the Free org's quota with a small known set of invoices created in the current and prior months. Inspect scoped query behavior or staging-only provider counters.
- **Expected:** Paid org reports `remaining: null` without a history count walk. Free org counts current-month invoices by `$createdAt`, not invoice-entered date; a provider read failure returns 503 rather than zero remaining.
- **Failure indicators:** Paid org triggers a full invoice-history walk; Free monthly count includes the wrong month/date field; an outage is presented as an empty quota.
- **Safety:** Keep any large-history fixture and usage measurement in staging. Do not create large production datasets for this test.

### TS-14 — Org cascade delete completeness (CONC-004 context, orgs/[id]) · P2 · integration testing

- **Objective:** The client-driven budgeted loop leaves zero orphan rows.
- **Steps:** Seed an org with >100 rows spread over all cascade tables (memberships, invoices, customers, catalog, templates, stats, payments, audit) plus a profile row and a logo. Drive `DELETE /api/orgs/<id>` from the UI until it answers `{done: true}`. Then query each table `equal orgId` from the Appwrite console.
- **Expected:** Every table returns 0 rows; the `organizations` row is gone; the R2 logo object is deleted; an `org.delete` audit row exists.
- **Failure indicators:** Any leftover row (loop terminated early / budget accounting wrong); org row missing before dependants (would break the continuation authorization on a retry).
- **Variant:** kill the tab mid-loop, then resume from another tab as the owner — continuation must succeed via Path B (`org.ownerId`) and end `{done: true}`.

### TS-15 — Member revocation takes effect immediately (tenancy core) · P1 · manual testing

- **Objective:** The uncached-membership guarantee holds: removal cuts access on the next request even while the revoked user's session cache is warm.
- **Steps:** Member signs in, loads invoices (requests succeed). Owner removes the member (`DELETE /api/orgs/<id>/members/<membershipId>`). Member immediately (within 2 s) calls `GET /api/data/invoices?orgId=…`.
- **Expected:** 404 `not_found` on the first post-removal call, and 404 for every org-scoped endpoint.
- **Failure indicators:** One or more post-removal calls succeed (a membership cache would have been introduced somewhere — check `requireOrg`).

### TS-16 — Bulk delete tenant isolation (data/[resource]) · P2 · integration testing

- **Objective:** A member of org A cannot delete org B's rows even when supplying B's row ids.
- **Steps:** Obtain (or construct) ids of org B rows; call `POST /api/data/invoices?action=bulk-delete` from an org-A member with those ids mixed among A's.
- **Expected:** Response `deleted` counts only A's rows; org B rows intact.
- **Failure indicators:** B's rows deleted (row-in-tenant check bypassed).

---

## E. Uploads, storage & caching

### TS-17 — Upload validation & serving isolation (SEC-003) · P2 · manual testing

- **Objective:** Confirm the compensating controls for filename-trust MIME handling.
- **Steps:**
  1. Upload an HTML file renamed `logo.svg` via `POST /api/logo` (owner session).
  2. Open the returned `/api/logo/<key>` URL directly (top-level navigation) — the response must carry `content-security-policy: default-src 'none'; …; sandbox` and `x-content-type-options: nosniff`; confirm no script executes.
  3. Upload a polyglot (valid PNG header + embedded JS) as `x.png` and repeat step 2.
  4. Repeat for a payment proof (jpeg/png/webp only; verify an `.svg` proof is refused 400).
  5. Verify logo/proof deletes: user A cannot delete user B's object (404), the owner can (204), and a proof delete clears the invoice row's `paymentProofKey`.
- **Expected:** No script execution in any direct-navigation case; refusals per extension policy; delete authorization per `customMetadata.owner`.
- **Failure indicators:** Script executes; proof endpoint accepts SVG; cross-user delete succeeds.

### TS-18 — Image cache immutability vs replacement (CACHE context) · P3 · manual testing

- **Objective:** Fresh-key-per-upload means stale logos/proofs never outlive their object.
- **Steps:** Upload a logo, note its URL, replace it via the profile form, confirm the new response's URL differs and both URLs keep serving their original bytes after 24 h (or with a forced cache-bypassing reload comparison).
- **Expected:** Old URL still serves the old object (immutable caching is safe because keys are unique); new URL serves the new object immediately.
- **Failure indicators:** Old URL serves the new object (key reuse would make immutable caching a correctness bug).

### TS-19 — Public page cache hygiene (CACHE-003) · P3 · manual testing

- **Objective:** Confirm no intermediary caches personalized payloads.
- **Steps:** Fetch `GET /api/invoice/<id>` and `GET /api/site/<id>` through a cache-comparison (direct vs via a proxy with different `Authorization` irrelevant for these public endpoints); verify response headers contain `cache-control: no-store` and no `etag`; confirm two different orgs' pages never return mixed content after rapid alternating fetches.
- **Expected:** `no-store` present on all Function JSON; no cross-org payload observed.
- **Failure indicators:** Any `max-age`/`s-maxage` on personalized endpoints, or an edge cache hit (would mean the `no-store` default was bypassed).

---

## F. Client-side resource lifecycle & UX-critical flows

### TS-20 — Long-session memory in the dashboard (MEM-001) · P3 · manual profiling

- **Objective:** Check for listener/detached-node accumulation across ClientRouter navigations.
- **Steps:** In Chrome DevTools → Memory, take a heap snapshot on `/dashboard`, navigate dashboard → invoices → settings → dashboard ×20, take another snapshot, compare detached HTMLElement counts and listener counts.
- **Expected:** Detached nodes attributable to the sidebar/header closures stay bounded (a handful), listeners on `document`/`window` remain constant per session.
- **Failure indicators:** Detached node count grows linearly with navigations.

### TS-21 — Session expiry mid-edit (session-expiry handler) · P2 · manual testing

- **Objective:** A 401 during an invoice edit produces one clean sign-out with `next` return, not scattered errors or a redirect loop.
- **Steps:** Open the invoice builder; delete the session server-side (Appwrite console); wait for the next save/refetch; observe toasts/redirects; confirm `/login?next=/invoice/new…` and that after re-login the builder reloads cleanly.
- **Expected:** Single info toast, one redirect, no error cascade.
- **Failure indicators:** Multiple simultaneous toasts (guard `handling` broken); bounce loop between page and `/login` (the `user_unauthorized`-on-missing-table distinction broken).

### TS-22 — Draft isolation & autosave resilience (draft-storage) · P3 · manual testing

- **Objective:** Drafts survive reload, never cross accounts, never break the builder on quota errors.
- **Steps:** Fill half an invoice, hard-reload (draft restored), sign out, sign in as another account, open `/invoice/new` (no restore), simulate `localStorage.setItem` throwing (fill storage in devtools) and edit an invoice (builder must function, autosave silently skipped).

---

## G. Webhook & upstream failure handling

### TS-23 — Upstream outage degradation (API-001/002/003) · P2 · integration testing (staging)

- **Objective:** Every Function degrades on Appwrite/DOKU unreachability exactly as documented.
- **Steps (staging with a blackholed Appwrite endpoint via `PUBLIC_APPWRITE_ENDPOINT` pointing at a hanging server):**
  1. `GET /api/orgs` → 503 `unavailable` (never an empty org list).
  2. `GET /api/quota/invoices` → 503 (never "you have 0 left").
  3. `POST /api/data/invoices` → 503 after bounded retries; no row created.
  4. DOKU unreachable → checkout 502 + breaker opens: next attempt 503 immediately (`checkout.breaker-rejected`), and after `dokuBreakerCooldownMs` exactly one probe passes (half-open).
  5. `/api/appwrite/*` proxy → 502.
- **Expected:** All responses match the documented shapes; retry counts per request ≤ `QUOTA_APPWRITE_READ_RETRIES` (default 1); each request completes within ~10 s (upstream deadline), not hanging.
- **Failure indicators:** Empty lists rendered as data; quota "0 remaining" during outage; requests hanging to the 30 s worker cap; breaker never opening or never closing.

---

## Priority ordering

| P1 (before payments go live / next deploy) | P2                         | P3                         |
| ------------------------------------------ | -------------------------- | -------------------------- |
| TS-01 session confusion                    | TS-02 revocation lag       | TS-03, TS-18, TS-20, TS-22 |
| TS-04 duplicate checkout                   | TS-08, TS-09, TS-10, TS-11 |                            |
| TS-05 double settlement                    | TS-12, TS-13, TS-14, TS-16 |                            |
| TS-06, TS-07 webhook correctness           | TS-17, TS-21, TS-23        |                            |

All P1 scenarios are integration tests against a deployed Functions environment (preview deployment recommended); none require load-testing infrastructure except TS-09, which should stay on staging.
