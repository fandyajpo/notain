# Notain — Comprehensive Static Codebase Audit

- **Date of audit:** 2026-11 (static analysis of the working tree at `main`)
- **Companion documents:** [`TEST_SCENARIOS.md`](./TEST_SCENARIOS.md) (runtime verification plan), [`CODEBASE_REMEDIATION.md`](./CODEBASE_REMEDIATION.md) (tracking list)
- **Remediation status:** the CRITICAL and HIGH findings below, plus the code-fixable MEDIUM/LOW ones, have since been **remediated in code** — see [`CODEBASE_REMEDIATION.md`](./CODEBASE_REMEDIATION.md) for per-finding status and the runtime verification (TS-01…TS-23) still required to close them.

---

## 1. Executive summary

Notain is an Astro 7 **static site** with Cloudflare **Pages Functions** acting as the entire server-side API. Tenancy is enforced by an Appwrite `memberships` row per request, not by row permissions; the browser talks to Appwrite only through a same-origin proxy and to tenant data only through the Functions.

The codebase is unusually disciplined for its size: strict TypeScript with `noUncheckedIndexedAccess`, an allowlist HTML sanitizer for all rich text, fail-closed gates everywhere, explicit `no-store` defaults on every JSON response, bounded retries, upstream timeouts, a circuit breaker, and documentation at the site of every deliberate trade-off. Most "classic" Astro/SPA problems (accidental SSR of user data, unauthenticated client-side-only authorization, secret leakage into the bundle) are demonstrably absent.

That said, the audit found **one confirmed critical logic flaw** and a cluster of related concurrency/cost findings that all share one root cause: **state that must be global (sessions, rate limits, idempotency) is implemented in per-isolate memory**, which Cloudflare explicitly does not guarantee to be shared or consistent.

**Top findings, in order of severity:**

| # | Finding | Severity | Confidence |
|---|---------|----------|------------|
| 1 | Cross-user session confusion in the session single-flight (all JWTs share one in-flight key) | **CRITICAL** | CONFIRMED (logic), exploitability NEEDS-VERIFICATION |
| 2 | Payment settlement read-modify-write without compare-and-swap → possible double plan extension across isolates | HIGH | HIGH CONFIDENCE |
| 3 | Checkout duplicate-submission guard is non-atomic across isolates → duplicate DOKU orders possible | HIGH | HIGH CONFIDENCE |
| 4 | Free-tier invoice quota claim is advisory; the create endpoint does not re-count | MEDIUM | CONFIRMED (documented trade-off) |
| 5 | Invoice-quota meter paginates the org's **entire** invoice history on every read, including paid orgs | MEDIUM | CONFIRMED |
| 6 | Public invoice endpoint has no rate limit (unlike the site endpoint) → Appwrite read-quota amplification | MEDIUM | CONFIRMED |
| 7 | All rate limiting and caching are per-isolate; resets on recycle; not fleet-wide | MEDIUM | CONFIRMED (documented) |
| 8 | Upstream error detail (Appwrite/DOKU response bodies) is echoed to clients in several endpoints | LOW | CONFIRMED |

Findings 2 and 3 deserve emphasis because they touch money: the idempotency design is genuinely good *within one isolate* (`singleFlight`, state-based transitions, paid-before-activate anchor), but two isolates handling the same webhook and the same status poll can both pass the `pending → paid` transition before either observes the other's write. Nothing in Appwrite TablesDB provides a conditional write to close that window.

---

## 2. Repository architecture overview

```
Browser (static Astro build, islands in React/Vue/Svelte/Solid)
  │
  ├─ /api/appwrite/*      → functions/api/appwrite/[[path]].ts   (transparent same-origin relay to Appwrite)
  ├─ /api/data/*          → functions/api/data/[resource].ts     (THE tenant CRUD path; requireOrg gate)
  ├─ /api/orgs, /profile, /quota/*, /payments/*, /invoice/[id], /site/[id],
  │  /logo, /proof, /support, /turnstile, /csp-report, /admin/* → Pages Functions
  └─ /invoice/<id>, /templates/<id>, /site/<ownerId> → shell-serving Functions (functions/invoice|templates|site)
```

- **Rendering:** fully static (`astro build` → `dist/`), every page hydrates islands. No SSR, no `Astro.locals` request state, no server middleware — the "server" is the Pages Functions layer.
- **Tenancy model** (`docs/multi-tenancy.md`, implemented in `functions/_lib/orgs.ts`): the *only* authority for "may this caller touch org X" is an **active `memberships` row** resolved per request (`requireOrg`, never cached). The browser's `orgId` is a hint, verified server-side; `orgId`/`ownerId`/plan columns are stamped server-side and dropped from request bodies (`FORBIDDEN_BODY_KEYS`).
- **Row security:** tenant rows are created with `permissions: []` — API-key-only. Row permissions exist only on legacy/profile rows. Membership revocation is therefore enforced on the very next Function call.
- **Auth:** Appwrite email/password + Google OAuth (token flow with a client-side `state` cookie check — see §10). The browser mints a short-lived JWT (`src/appwrite/client.ts`) and sends it as `Authorization: Bearer`; Functions verify it against `GET /account` with a per-isolate TTL cache.

### Technology stack (verified from `package.json` / configs)

| Concern | Choice |
|---|---|
| Framework | Astro `^7.3.7`, static output, `prefetch: true` |
| UI frameworks | React 19, Vue 3.5, Svelte 5, Solid 1.9 — via custom-element islands (ADR 0001/0004) |
| Styling | Tailwind CSS 4 (Vite plugin) |
| Data/validation | Zod 4; TanStack Query/Form/Store/Table/Pacer/Hotkeys; TipTap 3 |
| Backend | Appwrite Cloud `^28.1.0` (TablesDB `notain_db`, region `sgp`) |
| Storage | Cloudflare R2 bucket `notain` (private; logos + payment proofs) |
| Hosting | Cloudflare Pages (`notain.pages.dev`), Functions from `functions/`, `wrangler.toml` `[vars]` + R2 binding |
| Payments | DOKU Checkout sandbox only (`api-sandbox.doku.com` hardcoded, deliberately) |
| Bot gate | Cloudflare Turnstile (siteverify verified server-side) |
| Testing | Vitest (`vp test`), Playwright, Appwrite smoke suite |
| Tooling | vite-plus (lint/format/typecheck), `astro check`, ESLint astro plugin |

**Deployment:** GitHub Actions (`.github/workflows/deploy.yml`) runs format check → tests → typecheck → build → `wrangler pages deploy` on push to `main`, with a deploy `concurrency` group and a fail-fast missing-secret check. Secrets are correctly kept out of the repo (`TURNSTILE_SECRET_KEY`, `APPWRITE_API_KEY`, `DOKU_*` are encrypted Pages variables; `wrangler.toml` documents this).

---

## 3. Audit scope and methodology

**Read in full (line-by-line):** all configuration (`astro.config.mjs`, `wrangler.toml`, `tsconfig.json`, `vite.config.ts`, `package.json`, `public/_headers`, `.env.example`, CI workflow); every file under `functions/_lib/`; every Pages Function route file (auth/tenancy gates, data CRUD, payments incl. webhook/status/portal, orgs + members + accept + cascade delete, logo/proof storage, public invoice/site reads, quota, profile, support, turnstile, CSP report, admin users list/patch/suspend/drill-down, Appwrite proxy); the Appwrite client + config, auth repository, session/JWT modules, TanStack Query client/policies/session handling, HTML sanitizer, draft storage, toast, tour manager, both layouts.

**Reviewed by targeted pattern search** (rather than line-by-line): the ~150 React/Vue/Svelte/Solid components (`dangerouslySetInnerHTML`, `innerHTML`, `addEventListener`, `setInterval/setTimeout`, `as any`/`@ts-ignore`), and `tests/`, `e2e/`, `smoke/`, `scripts/` as evidence of intended behavior.

**Not audited in depth:** `functions/api/admin/content.ts` (767 lines — skimmed for structure only), `NOTAIN_MVP.md` and most `docs/`, build scripts (`scripts/*.mjs`), and the full bodies of large components (`admin-content-panel.tsx`, `invoice-builder.tsx`, `customers-app.tsx`, …). This is a scope limitation, not a clean bill of health for those files.

**Classification legend:**

- **CRITICAL** — immediate security/data-integrity risk
- **HIGH** — significant security/reliability/concurrency risk
- **MEDIUM** — performance, maintainability, operational weakness
- **LOW** — minor code-quality issue
- **INFO** — observation or recommendation
- **CONFIRMED** — demonstrated directly by source; **HIGH CONFIDENCE** — strong static evidence, runtime not fully established; **NEEDS VERIFICATION** — requires runtime testing

---

## 4. Code quality & type safety

**Overall: very good.** The lint config (`vite.config.ts`) bans `no-explicit-any`, unused vars, unsafe optional chaining, etc., with type-aware rules on; the search found **zero** `any`, `@ts-ignore`, or unsafe assertions in production code (the few `as unknown as` hits are in tests plus two commented, intentional narrow casts in `astro.config.mjs:120` and `src/components/shared/use-ce-element.ts:20`).

| ID | Severity | Confidence | Finding |
|----|----------|------------|---------|
| QUAL-001 | LOW | CONFIRMED | **Error-code mislabel in the admin wall.** `functions/_lib/admin.ts:77` returns `apiError(403, 'unauthenticated', 'Kamu bukan admin.')` — a 403 carrying the `unauthenticated` code. The client's session-expiry handler (`src/lib/query/session-expiry.ts:44`) signs the user out on any `unauthenticated` error, so a de-promoted admin (or any non-admin probing admin routes) can be logged out by a response that should merely be a 403. Code is unambiguous; whether the AppError mapping routes it to the sign-out path is NEEDS-VERIFICATION (depends on `src/appwrite/errors.ts` status→code mapping). Fix is one token: `'forbidden'`. |
| QUAL-002 | LOW | CONFIRMED | **Duplicated status normalizers.** `functions/_lib/payment-settle.ts:71` (`'pending' \| 'paid' \| 'expired'`) and `functions/api/payments/portal.ts:33` (`… \| 'failed'`) implement slightly different `normalizeStatus` functions. A new status added to one and not the other silently changes what the portal displays vs. what settlement acts on. |
| QUAL-003 | LOW | CONFIRMED | **Stale docstring on CSP reporting.** `functions/api/csp-report.ts:26-29` states the site sends the CSP as *Report-Only*, but `public/_headers:38` ships it **enforcing**. The header comment in `_headers` is current; the Function's is not. A reader triaging violations from the Function docs would draw the wrong conclusion about what is being blocked. |
| QUAL-004 | INFO | CONFIRMED | `resource0()` in `functions/api/data/[resource].ts:480` does a reverse `Object.keys(RESOURCES)` lookup on every GET solely to find the default-order attributes; a string key on the config object would be simpler and allocation-free. Cosmetic. |
| QUAL-005 | INFO | CONFIRMED | Naming and file organization are consistent (ports/infra/app/core layering, kebab-case files, Indonesian user-facing copy, English code comments). No dead code or unreachable branches surfaced in the audited files. |

---

## 5. Astro architecture

| ID | Severity | Confidence | Finding |
|----|----------|------------|---------|
| ASTRO-001 | INFO | CONFIRMED | **Deliberate four-framework islands.** Every page is static; all interactivity lives in islands behind custom elements (ADR 0001, 0004). Registration modules for Svelte/Vue/Solid are dynamically imported (`src/components/shared/use-ce-element.ts:59-83`) specifically to keep the three framework runtimes off the invoice routes' critical path — a well-executed mitigation of the bundle cost this architecture inherently carries. |
| ASTRO-002 | LOW | CONFIRMED | **Edit-route logic is duplicated by necessity and guarded by tests.** The `astro.config.mjs:26-145` dev middleware must mirror `functions/invoice/[[id]].ts`, `functions/templates/[[id]].ts`, `functions/site/[[id]].ts` and `src/lib/edit-route.ts` (Node ESM cannot import the TS). The header comment acknowledges the drift risk and `e2e/edit-routes.spec.ts` covers both halves — but a future change that forgets the dev twin will ship a dev/prod behavioral difference that only e2e catches. |
| ASTRO-003 | INFO | CONFIRMED | No `Astro.locals`, no `Astro.cookies`, no middleware, no SSR — so the usual static-site leakage classes (request state rendered into static HTML, secrets read at build time per-request) cannot occur by construction. The only `Astro.request`-adjacent surface is `Astro.url.pathname` for SEO meta in `Layout.astro`, which is safe. |
| ASTRO-004 | INFO | CONFIRMED | **Client/server boundary is clean.** `src/appwrite/config.ts` exposes only `PUBLIC_*` values (endpoint, project id, database id — all designed to be public). Server secrets (`APPWRITE_API_KEY`, `TURNSTILE_SECRET_KEY`, `DOKU_*`) appear only in `functions/_lib/types.ts` as optional `Env` fields and are read exclusively inside `functions/`. Nothing in the static build imports them. |
| ASTRO-005 | LOW | CONFIRMED | **`_headers` applies to static assets, not Function responses.** Cloudflare Pages `_headers` rules decorate asset responses; JSON responses produced by `functions/*` rely on `json()`'s defaults (`content-type`, `no-store` — good) but carry no `X-Content-Type-Options`/CSP. The image routes set their own hardened headers (`functions/_lib/http.ts:55-59`), so the practical exposure is minimal, but the "site-wide" comment in `_headers:32` is slightly broader than the mechanism. |
| ASTRO-006 | INFO | CONFIRMED | Hydration behavior is tuned, not accidental: `optimizeDeps.include` pins `@tanstack/react-hotkeys` (with a written incident report in `astro.config.mjs:181-198`), the Vue alias strips the runtime template compiler to stay inside the CSP (no `unsafe-eval`), and `ignoreOutdatedRequests` fixes dev-toolbar churn. |

---

## 6. Memory management & resource lifecycle

The runtime is two very different environments: long-lived browser tabs (React islands) and short-lived Cloudflare isolates (module-level state per Function).

**Browser side — no confirmed leaks.** All React `addEventListener` usages found (`menu.tsx`, `select.tsx`, `modal.tsx`, `table.tsx`, `org-switcher-island.tsx`, `use-ce-event.ts`, `use-unsaved-changes-guard.ts`, `landing/site-header.tsx`) are inside `useEffect` bodies with the corresponding cleanup in the same effect, and each is covered by a unit test that would catch a duplicate-listener regression. `toast()` self-removes with timers; the tour manager tears down its single active Driver instance on navigation; `Layout.astro`'s global `unhandledrejection`/`offline`/`online` listeners are intentionally attached once per session and never removed (correct — they are document-lifetime by design).

| ID | Severity | Confidence | Finding |
|----|----------|------------|---------|
| MEM-001 | LOW | NEEDS VERIFICATION | **Layout module scripts retain swapped-out DOM nodes.** `src/components/ui/SiteHeader.astro:303-336` and `src/layouts/DashboardLayout.astro:240-324` attach document/window-level listeners once per session (Astro dedupes bundled scripts across ClientRouter navigations). The closures capture specific elements (`sidebar`, `navToggle`, `mobileHeader` in DashboardLayout) that the ClientRouter replaces on soft navigation, so the old nodes are retained until full reload. The delegated handlers were *written* for this (they re-resolve the backdrop per event; see DashboardLayout:251-258), but the captured `sidebar`/`navToggle` references are not re-resolved. Impact is a handful of detached nodes per session — negligible, listed for completeness. |
| MEM-002 | LOW | NEEDS VERIFICATION | **Unbounded growth between sweeps in the Function caches.** `functions/_lib/quota.ts` bounds nothing by size, only by TTL-with-sweep: `windows` (rate-limit keys, sweep at >2000 entries, `:219`), `entries` (TTL cache, sweep at >1000, `:269`). A sweep removes only *expired* entries, so a flood of distinct fresh keys (rotating IPs for rate limiting; distinct valid token hashes for the session cache) grows the maps past the sweep threshold for up to a full window/TTL. Under Workers' memory limits this is unlikely to matter (60 s window × realistic request rates), but it is the one place isolate memory can be pushed by an attacker, and it deserves a hard cap (e.g. evict-oldest when `size > N`). |
| MEM-003 | INFO | CONFIRMED | All other module-level state is properly lifecycle-managed: `inflight` single-flight promises delete themselves in `finally` (`quota.ts:294`); the breaker map is keyed by a fixed name set; `counters` is keyed by a fixed name set; client-side JWT/session caches are cleared on account change (`src/app/session.ts`, `src/appwrite/client.ts` with epoch guards that prevent a stale mint from overwriting a newer account's state). |
| MEM-004 | INFO | CONFIRMED | No timers/intervals without teardown on the client (`use-payment.ts`'s `refetchInterval` is TanStack-managed and stops when status ≠ pending; `org-gate.tsx` clears its switch caps); no WebSockets, streams, file handles or DB connections are held by application code (Appwrite SDK is stateless HTTP; R2 bodies are streamed straight through). |

---

## 7. Cache management

**This is one of the strongest areas of the codebase.** The default policy is correct-by-construction:

- `functions/_lib/http.ts:1-20` — every JSON response defaults to `Cache-Control: no-store`; a route must *explicitly* opt out, so a new endpoint cannot leak into a shared cache by omission.
- Personalized reads re-assert `no-store` even where the default already covers it (`payments/status.ts:129`, `payments/portal.ts:127`, `profile.ts:97`, `site/[id].ts:120`, `invoice/[id].ts:111`).
- Mutable binary assets (logos, proofs) are served **immutable with fresh keys per upload** — the cache key never outlives the content (`logo/[key].ts:37`, `proof/[key].ts:44`), with `nosniff` + a `sandbox` CSP + `cross-origin-resource-policy: same-origin` (correct for user-uploaded SVG/HTML-capable content).
- Static hashed assets: `/_astro/*` → `public, max-age=31536000, immutable`; HTML stays revalidatable so deploys go live immediately (`public/_headers:44-45`).
- Client-side: TanStack policies are declared per datatype with rationale (`src/lib/query/policies.ts`), the whole cache is cleared on account switch (`session-cache.ts:25-28`) so one user's data is never handed to the next account on the same device — a cache-isolation measure many apps miss.
- The Appwrite proxy sets `no-store` on all session-bearing JSON and strips upstream caching headers (`functions/api/appwrite/[[path]].ts:144-146`).

| ID | Severity | Confidence | Finding |
|----|----------|------------|---------|
| CACHE-001 | MEDIUM | CONFIRMED | **Per-isolate TTL cache honors revoked sessions/admins for up to 60 s.** `functions/_lib/appwrite.ts:40-43,57-59` caches a verified session (keyed by token SHA-256) for `QUOTA_SESSION_CACHE_TTL_MS` (default 60 s); `functions/_lib/admin.ts:174-190` caches admin-team membership (including a *denial*) similarly. This is documented in-code as a bounded, deliberate trade-off, and org membership lookups are deliberately never cached — but the practical effect is: a logged-out or suspended user may keep making authenticated calls for ≤60 s on the same isolate, and a removed admin keeps admin power ≤60 s. Verify the TTL matches your revocation SLO (test scenario TS-11). |
| CACHE-002 | LOW | CONFIRMED | **Cache-key consistency is good but asymmetric.** The session cache is keyed by `sha256Hex(token)` (token never a map key — good), but the *single-flight* wrapper for the same lookup is keyed by `token.slice(0,8)` (`appwrite.ts:45`) — see the CRITICAL finding SEC-001. |
| CACHE-003 | INFO | CONFIRMED | The public invoice/site payloads are `no-store` — correct for edit-visibility, but it means every visitor re-pays 3–5 Appwrite reads per page view. A short `s-maxage` + `stale-while-revalidate` on `/api/site/<id>` (purely org-published data) would cut read-quota burn meaningfully; for invoices, edge caching must remain off while proofs/status change underneath. Recommendation only; cross-user contamination risk is low for site data, real for invoice data (invoice payload embeds the org's letterhead). |
| CACHE-004 | INFO | CONFIRMED | No `ETag`/`Last-Modified` anywhere; all validation is either "no-store" or "immutable". For this app that dichotomy is defensible (JSON is cheap to revalidate server-side; assets are hashed), noted so it is a decision rather than an omission. |

---

## 8. Rate limiting & abuse protection

`functions/_lib/quota.ts` implements a sliding-window limiter with per-endpoint defaults (support 5/h, proof 6/h, logo 10/h, checkout 10/h, org-create 10/h, org-invite 30/h, data-write 120/min, site 60/min, invoice-quota 60/min, csp-report & turnstile 30/min), all overridable via `QUOTA_LIMIT_*` env vars, with `retry-after` on 429s and keys of `cf-connecting-ip` (edge-assigned, cannot be forged by the client) or user id for authenticated endpoints. The code is honest that this is **burst protection, not a security boundary**.

| ID | Severity | Confidence | Finding |
|----|----------|------------|---------|
| RATE-001 | MEDIUM | CONFIRMED (documented) | **All rate limits are per-isolate.** `windows` lives in module memory (`quota.ts:194`); Cloudflare may run N isolates, so the effective limit is N× the configured one, and everything resets on recycle. Documented extensively (`quota.ts:6-17`), and the Free plan has no KV/D1 to persist state. Consequence: the *cost fences* (checkout, proof, logo, org-create) can be exceeded by ~the isolate count, and the Turnstile-independent protections (support, csp-report) are correspondingly weaker. If abuse ever becomes real, the fix is a Workers KV / Durable Object counter or a WAF rate-limiting rule at the edge. |
| RATE-002 | MEDIUM | CONFIRMED | **`GET /api/invoice/<id>` has no rate limit.** It is fully unauthenticated (capability-URL model), performs 3–5 Appwrite reads per hit (invoice + org + profile + template), and returns `no-store`, so every probe pays full price against the Appwrite Free read quota (500k/month). The sibling public endpoint `GET /api/site/<id>` *is* fenced (`site` limit, 60/min/IP) and its docstring explains exactly why (`site/[id].ts:42-44`) — the invoice endpoint simply never got the same treatment. An anonymous loop over guessed ids burns read quota with no fence at all. |
| RATE-003 | LOW | CONFIRMED | **Authenticated list reads are unfenced.** `GET /api/data/<resource>` applies `data-write` (120/min) only to POST/PATCH/DELETE; GETs are unlimited per user. A member loop-fetching their own invoices at 100 rows/request can burn ~500k reads in a few hours. Same pattern on `GET /api/orgs` (N+1 reads — see DB-001). Low severity because it is authenticated and self-harming, but it is the cheapest quota-exhaustion path available to a legitimate account. |
| RATE-004 | MEDIUM | HIGH CONFIDENCE | **No application-level brute-force protection on sign-in/sign-up/recovery.** The Turnstile gate is enforced on `/api/support` and proof upload server-side, but the login/register/recovery flows call Appwrite **directly through the proxy** (`/api/appwrite/account/sessions/*`), which adds nothing. Protection therefore rests entirely on (a) the client-side widget on the auth forms and (b) Appwrite Cloud's own (undocumented, non-configurable) rate limits. A scripted login attack through `/api/appwrite` sees no Turnstile at all. Appwrite does throttle, but treating that as the only line is worth a deliberate decision: a proxy-level fence on session-creating paths (counting per IP in the same per-isolate way, or KV-backed) would restore parity with the rest of the API. |
| RATE-005 | INFO | CONFIRMED | Key design is sound: authenticated fences key on `session.userId` (proof-owner, checkout, invoice-quota, org-create), anonymous fences on `cf-connecting-ip`; the mixed case (proof upload) uses `proof-upload-owner`/`proof-upload` names so the two buckets cannot collide. `retry-after` is computed from the actual freeing hit (`quota.ts:211-214`) — a detail most implementations get wrong. |

---

## 9. Request concurrency & race conditions

| ID | Severity | Confidence | Finding |
|----|----------|------------|---------|
| CONC-001 | HIGH | HIGH CONFIDENCE | **Checkout duplicate guard is non-atomic across isolates.** `functions/api/payments/checkout.ts:185-226` implements "one pending row per org+plan" by *querying* for a pending row and refusing/retiring/reusing. Two concurrent checkouts for the same org+plan landing on different isolates both see no pending row, both mint distinct `invoiceNumber`s (`makeInvoiceNumber` is not org-deterministic), and both create DOKU orders → two pending payment rows and two hosted checkout pages for one org. The unique-`$id` 409 (`:258-262`) only catches the *identical-id* race, not this one. Impact: duplicate orders (only one can be paid, but the UI can present two; settlement is idempotent per row so no double activation — the harm is confusion and DOKU/order clutter). Mitigations that fit the stack: a deterministic payment row id (`checkout:{orgId}:{plan}`) so the 409 path *is* the guard, or a KV/DO lock. |
| CONC-002 | HIGH | HIGH CONFIDENCE | **Plan settlement has no compare-and-swap → double extension.** `functions/_lib/payment-settle.ts:136-171` flips the row to `paid`, reads the org row, computes expiry from the *read* `planExpiresAt`, and patches. `singleFlight` (`doku-notify.ts:94`, `status.ts:160`) coalesces only **within one isolate**; the webhook and the status poll (or two webhook deliveries) on different isolates can both read `status: 'pending'`, both pass `decideTransition`, and both patch the org. If the two reads of `organizations` straddle the first patch, the second computes its expiry from the already-extended value → the plan is extended twice (paid-for duration ×2). The code's own comment ("expiry math can never run twice for one payment") holds per-isolate and per-row-observe, not across isolates. A deterministic fix: make the expiry extension a *function of the payment row only* (`max(currentExpiry, paidAt) + duration`, computed from a re-read *after* the paid-flip with the flip as the fence) plus a post-activation re-read verifying the org patch landed with the expected value; or write `activatedExpiry` into the payment row and make the org patch idempotent on that value. |
| CONC-003 | LOW | CONFIRMED | **Proof one-shot is check-then-write.** `functions/api/invoice/[id]/proof.ts:126-169` reads the invoice, checks `paymentProofKey`/status, writes the R2 object, then patches the row. Two concurrent customer uploads (different isolates) both pass the empty-key check → two objects stored, one row write wins, the loser's object is orphaned (R2 storage is the one automatically-billed overage in this stack — `quota.ts:413-419`). Probability is low (Turnstile adds a round trip before the race window), impact is a few cents and a stray object. |
| CONC-004 | LOW | CONFIRMED | **Org-create compensation is not verified.** `functions/api/orgs.ts:241-245`: if the owner-membership create fails, the just-created org row is deleted — but `deleteRow`'s boolean result is ignored. If that delete fails (transient Appwrite error), an ownerless org persists (undeletable by design, since only owners can delete). One retry/audit line closes it. |
| CONC-005 | INFO | CONFIRMED | Good concurrent-by-design patterns worth keeping: sequential (not `Promise.all`) writes where ordering matters (`orgs/accept.ts:20-22`, cascade delete), bounded loops everywhere (bulk delete ≤20, cascade budget 30, invite accept ≤50), reads that are safe to parallelize are parallelized (`checkout.ts:154`, `invoice/[id].ts:61`, `site/[id].ts:64`, admin drill-down's six parallel reads), `singleFlight` for in-flight dedup, and a real circuit breaker with half-open probing on DOKU. Mutations are never retried client-side (`client.ts:52-55`) — the correct call for non-idempotent writes. |
| CONC-006 | INFO | CONFIRMED | No unbounded `Promise.all` was found anywhere; the largest fan-out is the admin drill-down (6 fixed reads) and admin user list (2 fixed reads). No request-cancellation/AbortController gaps server-side (every outbound call goes through `fetchUpstream`'s 10 s deadline or an explicit `AbortSignal.timeout`); client-side fetches are TanStack-managed. |

---

## 10. Security audit

**Posture: strong, with one critical exception.** Authorization is enforced server-side on every tenant path via `requireOrg`/`requireOrgOwner` (session + active membership row, re-verified per request); the admin wall re-checks team membership with the API key; row-in-tenant checks re-read the row and compare stored `orgId` (`data/[resource].ts:229,352,380`, `members/[membershipId].ts:44`); unknown-vs-foreign resources both answer 404 so ids cannot be probed (`orgs.ts` gate, `rows.ts:46-50`, logo/proof delete); ownership for payment status is checked against the session (`status.ts:101`); plan/price fields are server-derived (checkout looks the amount up in the catalog, plan columns are stripped from every writable body); payment state is moved only by DOKU-signed data.

| ID | Severity | Confidence | Finding |
|----|----------|------------|---------|
| SEC-001 | **CRITICAL** | CONFIRMED (logic) / exploitability NEEDS-VERIFICATION | **Cross-user session confusion in the session single-flight.** `functions/_lib/appwrite.ts:45`: `singleFlight(\`session:${token.slice(0, 8)}\`, …)`. A JWT's first 8 characters are the base64 of the *header* (`{"alg":…,"typ":"JWT"}`), which is **identical for every token** Appwrite issues. Therefore any two concurrent `verifySession` calls with **different tokens** that both miss the 60 s cache coalesce onto **one** flight, and every coalesced caller awaits and receives **the first caller's `Session`** — i.e. user B's request proceeds as user A (their `userId` then drives `requireOrg` membership checks, `ownerId` stamping, and payment-status ownership). The window recurs naturally: whenever an isolate's cache is cold or a token expires past the TTL, a burst of first-requests from different users (e.g. morning traffic, a deployed-edge burst, or any attacker deliberately batching concurrent first requests with victim-coordinated timing) shares one flight. The in-code comment ("Concurrent probes for the same token are coalesced") describes the *intent*; the key does not implement it. **Fix:** key the single-flight by the same `sha256Hex(token)` as the cache (or drop single-flight here — the cache already collapses repeats; only same-token concurrency needs dedup). This is the single most important change in this audit. |
| SEC-002 | LOW | CONFIRMED | **Upstream error bodies are echoed to clients.** `support.ts:128-129`, `checkout.ts:264-265,328,344-346`, `admin/users.ts:346,350,375`, `admin/users/[id].ts:105` slice the first 200–500 chars of the Appwrite/DOKU error body into the API `message`. This leaks internal error shapes (collection names, provider messages) to any caller triggering the failure. Low severity, easy to scrub behind a generic message + `console.error`. |
| SEC-003 | LOW | CONFIRMED | **Upload MIME verification trusts the filename only.** `logo.ts:67-74` and `invoice/[id]/proof.ts:117-124` map `file.name` extension → content type; no magic-byte sniffing. Compensating controls are real and documented (`http.ts:45-59`): `nosniff`, a `default-src 'none'; sandbox` CSP on the serving routes, SVG never accepted for proofs, and images render only inside `<img>`. Residual risk: a mislabeled polyglot served with a trusted content type from the same origin — the sandbox CSP keeps script inert even on direct navigation. Acceptable; add a length-prefixed magic check if you ever serve these outside `<img>`. |
| SEC-004 | LOW | CONFIRMED | **CSRF surface is the Appwrite proxy, protected only by cookie attributes.** All `/api/*` Functions are Bearer-token authenticated (immune to CSRF by design). The session-cookie-authenticated surface is `/api/appwrite/*`, where the proxy deliberately strips `Origin`/`Referer` (`[[path]].ts:48-62`) so Appwrite cannot apply origin checks, and rewrites the Appwrite cookie to be host-only (`:89-91`) — preserving its `HttpOnly`/`Secure`/`SameSite` attributes, which are then the *only* CSRF defense for account-mutating calls (password change, session deletion, etc.). SameSite=Lax/Strict blocks the classic cross-site form POST; subdomain-based cookie injection or a future relaxed SameSite setting would remove that. Worth an explicit decision: either forward `Origin` and let Appwrite judge, or document SameSite=Strict as a hard requirement. |
| SEC-005 | INFO | CONFIRMED | **OAuth login-CSRF is handled correctly**: `src/app/auth.ts:132-153` validates the Appwrite `state` against a short-lived cookie written before the redirect, clears both cookies either way, and passes the stored `next` through `isSafeRedirectPath`. The OAuth *start* intentionally bypasses the proxy so Appwrite's own state cookie works (`appwrite-auth-repository.ts:114-139`) — documented and correct. |
| SEC-006 | INFO | CONFIRMED | **Headers/CSP are strong**: enforcing CSP with no `unsafe-eval` (Vue alias and build-time hashes specifically engineered for it), `frame-ancestors 'none'` + `X-Frame-Options: DENY`, HSTS with `includeSubDomains` (preload deliberately omitted and justified), `object-src 'none'`, form-action 'self', a report endpoint with per-IP cap and body cap, `Permissions-Policy` locking camera/mic/geolocation/payment. `style-src 'unsafe-inline'` is the one relaxation, justified by Astro inline styles. |
| SEC-007 | INFO | CONFIRMED | **Secrets hygiene verified**: `wrangler.toml` contains only public-by-design values and *documents* every secret it excludes; CI fails if `PUBLIC_TURNSTILE_SITE_KEY` is missing rather than shipping a silently ungated site; `.env.example` repeatedly warns that DOKU sandbox keys must never be treated as safe. The DOKU integration is hardcoded to `api-sandbox.doku.com` (`doku.ts:27-34`) so production credentials cannot even be used by this build. |
| SEC-008 | LOW | CONFIRMED | **`requireAdmin` mislabel** — see QUAL-001; security-relevant because the client may react to a 403 as an authentication failure (forced logout), which is an availability annoyance, not a privilege issue (the gate itself fails closed correctly on every path, including missing env and upstream errors). |
| SEC-009 | INFO | CONFIRMED | **Injection surfaces are covered**: no SQL anywhere (Appwrite REST with whitelisted query grammar — `data/[resource].ts:395-477` builds only fixed `method/attribute/values` objects from a per-resource whitelist); rich-text HTML passes through an allowlist sanitizer whose tokenizer *never echoes input tag/attribute names* and escapes all text/attribute output (`sanitize.ts`), with scheme validation performed on the entity-decoded, control-stripped value (`safeHref:268-280`); ids validated against anchored patterns before any lookup; the only `innerHTML` in app code (toast) interpolates a static icon plus `escapeHtml(message)`. |
| SEC-010 | INFO | CONFIRMED | **No SSRF/open-redirect/path-traversal paths**: outbound URLs are fixed constants (Appwrite endpoint from env, DOKU sandbox, Turnstile), redirects go through `isSafeRedirectPath`, R2 keys are server-generated (`logos_…`, `proofs_…` prefixes + 14 hex) with prefix validation on read (`proof/[key].ts:23`), and `logo/[key].ts` accepts any key but only reads (capability model, 56-bit random, never listed). |
| SEC-011 | LOW | NEEDS VERIFICATION | **Public invoice capability strength depends on client-chosen ids.** `POST /api/data/invoices` accepts a client-supplied `rowId` (`data/[resource].ts:308-314`) and the public endpoint treats the id as the credential (`invoice/[id].ts:22-24`). If invoice ids follow the documented deterministic pattern (orgId + invoice number), an org on a paid plan has invoice documents whose ids are *guessable* to anyone who has seen one invoice number — compounded by RATE-002 (no rate limit). Verify the actual id format in production rows; if ids are `unique()` Appwrite ids the entropy is adequate; if they are derived from invoice numbers, consider pairing the public read with an unguessable share token column. |
| SEC-012 | INFO | CONFIRMED | **Session isolation on shared devices is handled**: query cache cleared per account (`session-cache.ts`), drafts keyed by owner (`draft-storage.ts`), JWT cleared on account change with epoch guards. |

---

## 11. Database & data integrity

Appwrite TablesDB has no transactions; the codebase compensates explicitly (documented per call site). Reviewed against the actual query patterns:

| ID | Severity | Confidence | Finding |
|----|----------|------------|---------|
| DB-001 | MEDIUM | CONFIRMED | **N+1 org reads in `GET /api/orgs`.** `functions/api/orgs.ts:109-126` walks each membership (≤100) and each pending invite (≤50) with a sequential `getRow` each — up to 150 sequential Appwrite reads per switcher load, on a path every authenticated page hits. The project already built the batched pattern for this exact shape (`primaryOrgIds` in `functions/_lib/admin.ts:128-152`, and the admin users list's parallel `equal $id IN […]` fetches); reusing it here removes ~98% of the reads. |
| DB-002 | MEDIUM | CONFIRMED | **The invoice-quota meter paginates the org's entire history per read.** `functions/_lib/invoice-quota.ts:79-120` walks up to 100 pages × 100 rows of `invoices` (10,000 rows) on **every** `GET`/`POST /api/quota/invoices` — including paid orgs, whose meter is hidden anyway (`remaining: null`), and including the admin path. The comment says free accounts are "capped at a handful a month", but nothing exits early once the current month is found, and paid orgs have unbounded histories. Concretely: a paid org with 2 years of invoices burns ~7,300 reads every time the builder mounts. An early exit (stop when the page's month is older than the current month, given `orderDesc date`) or an org-level running counter column would fix the class, not the symptom. |
| DB-003 | LOW | CONFIRMED | **Index coverage is consciously aligned with query shapes** (`docs/` + comments reference `org_date` index; the data endpoint's `defaultOrder` exists precisely to match Appwrite indexes; the templates config documents a real 400-error incident with a phantom `order` attribute). Residual risks: `search=` over `items` (invoices) is full-text over a large JSON-ish column — cost per search grows with row size; `equal $id IN […]` in admin is unindexed-by-definition but bounded to ≤50 ids. |
| DB-004 | INFO | CONFIRMED | **Multi-row writes rely on documented compensation, not transactions**: org create (org → membership → profile, with compensation on the second step and tolerated failure on the third), cascade delete (budgeted, client-driven loop, root-last ordering), settle (paid-anchor before activation with audit trail for manual resolution). Every failure mode leaves a *visible* state and an audit row — the right pattern for a transaction-less store. |
| DB-005 | LOW | CONFIRMED | **Admin drill-down counts by `ownerId`.** `admin/users/[id].ts:226-247` counts invoices/customers/templates `equal ownerId` — since multi-tenancy, rows are org-stamped *and* member-stamped (`data/[resource].ts:295-296` stamps both), so counts reflect only the primary member's personal creations, not the org's totals. Probably intended ("their data"), but it will read low for multi-member orgs; worth a deliberate confirmation. |
| DB-006 | INFO | CONFIRMED | Pagination is consistently bounded and cursor-based (keyset `cursorAfter`, over-fetch-by-one in admin lists, `MAX_PAGES=100` hard ceiling in the quota walk), `total` is read from Appwrite's matched-set count rather than shipping rows for counts, and projections (`select`) are used on hot paths (quota walk selects two short fields; site catalog projects 5 fields; drill-down projects named columns). No unbounded queries found. |

---

## 12. API & network reliability

| ID | Severity | Confidence | Finding |
|----|----------|------------|---------|
| API-001 | INFO | CONFIRMED | **Every outbound call is deadline-bounded.** `fetchUpstream` (10 s, abort reason `TimeoutError`, timer cleared in `finally`) is imported *aliased as* `fetch` across `functions/`, so no call site can silently use an unbounded fetch; DOKU calls add explicit `AbortSignal.timeout`. This is a genuinely good pattern. |
| API-002 | INFO | CONFIRMED | **Retries are typed by safety**: reads (network error/5xx) get bounded exponential backoff (`rows.ts:67-88`, default 1 retry, base 250 ms); writes are never retried (documented at `rows.ts:201-207` — a timed-out write that applied would double-fire on retry); the client retries only `network`/`unknown` errors, never 4xx, with half-jitter backoff (`policies.ts:163-181`); mutations never retry. No retry-storm shape exists. |
| API-003 | INFO | CONFIRMED | **Downstream failures are distinguished from empty data**: `listRows` returns `null` (outage) vs `[]` (empty) and callers preserve that distinction (`invoice-quota.ts:67-71`, `orgs.ts:86-88`, `data/[resource].ts:238-241` map outage to 503, never to a false "no rows"/"quota is 0"). The webhook acknowledges with `received/applied` semantics instead of treating business outcomes as delivery failures. |
| API-004 | LOW | CONFIRMED | **DOKU is sandbox-hardcoded** (`doku.ts:27-34`, `.env.example:57-59`) — deployment-blocking if production is ever intended, but currently a safety feature. The notification override URL requires a matching Back Office configuration (`doku.ts:209-218`) — the Check Status reconciliation path exists precisely because of that operational dependency; verify it is actually configured (test scenario TS-14). |
| API-005 | INFO | CONFIRMED | The Appwrite proxy is a faithful relay (hop-by-hop stripping, `set-cookie` handling via `getSetCookie`, manual redirects, identity-encoding forced by dropping `accept-encoding`) with a 10 s upstream deadline — the buffering of large responses (`await upstream.arrayBuffer()`) is the one memory-relevant behavior, bounded by Appwrite's response sizes in practice. |

---

## 13. Performance & optimization

| ID | Severity | Confidence | Finding |
|----|----------|------------|---------|
| PERF-001 | MEDIUM | CONFIRMED | **Authenticated request cost: 2+ Appwrite round trips minimum.** Every authenticated Function pays `verifySession` (1 read, cached 60 s per token) + a membership lookup (1 read, deliberately never cached) + its own work. Combined with DB-001 and DB-002, an ordinary dashboard load (session + orgs list + quota meter + stats) can cost tens of reads. Within the 500k/month Free tier this is the dominant burn; the fixes in DB-001/DB-002 plus a longer session TTL would roughly halve it. |
| PERF-002 | LOW | CONFIRMED | **Bundle weight is inherent but managed**: four framework runtimes, TipTap, xlsx, jspdf, heic2any (WASM), motion, driver.js. Mitigations already in place: dynamic registration imports for the three non-React runtimes (`use-ce-element.ts:44-58`), lazy TipTap (`lazy-rich-editor.tsx`), the Vue runtime-compiler alias, modulepreload stamping at build. The landing page's animated sections SSR hidden with a `noscript` fallback (`Layout.astro:76-86`) — content is never JS-locked. |
| PERF-003 | INFO | CONFIRMED | `resource0()` reverse lookup (QUAL-004), `localeCompare` sorts on the site catalog (≤100 rows), and the cascade-delete leftovers scan (8 × limit-1 reads per invocation) are all micro-costs; no hot loop is algorithmically wrong. |
| PERF-004 | INFO | CONFIRMED | Build-time assets are handled well: hashed `/_astro/*` immutable-cached, modulepreload post-processing, sitemap and CSP-hash stamping as build steps, `prefetch: true` for warm navigation. |

---

## 14. Dependency & configuration review

| ID | Severity | Confidence | Finding |
|----|----------|------------|---------|
| DEP-001 | MEDIUM | HIGH CONFIDENCE | **`xlsx` is a CDN tarball dependency** (`"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"`) — SheetJS's distribution model, but it means the package is outside the npm audit/registry ecosystem and its provenance rests on the lockfile's recorded integrity hash. It also parses untrusted user CSV/Excel imports client-side. Recommend: (a) confirm the lockfile integrity entry exists, (b) consider SheetJS's own security-advisory channel for 0.20.3, (c) isolate the parse in a Web Worker if import files grow. |
| DEP-002 | INFO | CONFIRMED | **`vite` is overridden to `@voidzero-dev/vite-plus-core@1.3.0`** (`package.json:97-99`) — the entire vite runtime is a third-party repackaging to enable the vite-plus toolchain. This is deliberate and documented in the scripts, but it is a deep supply-chain trust decision worth recording as an accepted risk: a compromise of that package would affect the build of everything. |
| DEP-003 | INFO | CONFIRMED | Three `lucide` packages (astro/react/svelte) are separate icon sets per framework — duplication is inherent to the four-framework architecture; tree-shaking keeps only used icons. |
| DEP-004 | LOW | CONFIRMED | `tsconfig` extends Astro `strict` *plus* `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `allowUnreachableCode: false`, unused checks — stricter than the framework default, and CI runs `astro check && tsc --noEmit`. `engines` pins Node 22/24/26; CI uses Node 22 with npm cache. No version conflicts observed between Astro 7 integrations and React 19/Vue 3.5/Svelte 5/Solid 1.9 (the pinned `include` globs per integration prevent JSX-source collisions). |
| DEP-005 | INFO | CONFIRMED | Env-var validation is minimal but appropriate: `readEnv` with hardcoded safe fallbacks (`config.ts`), server env failures fail closed at every gate (`tableAuth`, `requireAdmin`, checkout, webhook — "not configured" is a 500, never a bypass), and the CI comment chain documents that the test suite passes on the same defaults production uses. |

---

## 15. Finding classification summary

| Severity | Count | IDs |
|----------|-------|-----|
| CRITICAL | 1 | SEC-001 |
| HIGH | 2 | CONC-001, CONC-002 |
| MEDIUM | 9 | RATE-001, RATE-002, RATE-004, CACHE-001, DB-001, DB-002, PERF-001, DEP-001, QUAL-001 (security-adjacent) |
| LOW | 12 | QUAL-002, QUAL-003, ASTRO-002, ASTRO-005, MEM-001, MEM-002, CACHE-002, RATE-003, CONC-003, CONC-004, SEC-002, SEC-003, SEC-004, SEC-008, DB-005, DEP-004 |
| INFO | 15 | remaining IDs |

(Confidence per finding is stated inline in its row; the CRITICAL and both HIGH findings carry concrete code evidence with the exploit/impact window spelled out, and each has a matching runtime-verification scenario in `TEST_SCENARIOS.md`.)

---

## 16. Recommended remediation (priority order)

1. **SEC-001 (fix immediately, ~2 lines):** key the session single-flight by `sha256Hex(token)` — identical to the cache key — or remove single-flight from `verifySession` entirely (the TTL cache already collapses repeats; only same-token concurrency benefits, and a token-prefix key must never be the dedup key). Add a regression test asserting two *different* tokens verified concurrently yield their own sessions.
2. **CONC-002:** make plan activation idempotent across isolates — carry the computed expiry in the payment row (written in the same patch that flips it to `paid`), then make the org patch a pure projection of that value; re-read after activation and audit on divergence.
3. **CONC-001:** derive the payment row id deterministically (`checkout:{orgId}:{plan}` or `{orgId}:{plan}:{month}`) so the existing unique-id 409 becomes the duplicate-submission guard across all isolates.
4. **RATE-002:** add the same `site`-style per-IP fence to `GET /api/invoice/[id]`.
5. **DB-002:** exit the quota walk once the page's month precedes the current month; skip the walk entirely for paid orgs on the GET path.
6. **DB-001:** batch `GET /api/orgs` org/invite reads with the `equal $id IN […]` pattern already proven in the admin code.
7. **RATE-001 / RATE-004:** decide where fleet-wide enforcement is required (edge WAF rule or KV counter), at minimum for checkout and the Appwrite-proxy session-creating paths.
8. **QUAL-001 / SEC-002 / CONC-004 / MEM-002:** small mechanical fixes (error-code token, generic error messages + server-side logging, check the compensation delete result, hard cap the cache/ratelimit maps).
9. **DEP-001/DEP-002:** record the xlsx CDN and vite-plus override as reviewed accepted risks; monitor SheetJS advisories.

---

## 17. Overall architectural assessment

This is a well-engineered codebase whose documentation quality matches its code quality — nearly every deliberate trade-off (per-isolate rate limiting, advisory quota, uncached membership lookups, capability URLs, print-based PDF, sandbox-only payments) is written down next to the code that embodies it, with the failure modes of each decision spelled out. The layering (core → ports → infra → app), the fail-closed posture, and the cache-hygiene defaults are better than what most production apps of this size achieve.

The audit's central theme is singular: **every remaining significant risk lives at the boundary the architecture deliberately left to per-isolate memory.** Sessions, idempotency, rate limits and the plan-activation transition are all "single-isolate correct, fleet-incorrect." SEC-001 shows that boundary can produce an outright security defect, not just degraded enforcement; CONC-001/CONC-002 show it can affect money. Closing those three — one key change, one deterministic id, one idempotent activation write — would remove the critical finding and most of the residual payment risk while leaving the architecture otherwise intact.