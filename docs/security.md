# Security

This document records what the system defends against, which controls are in
place, where each control lives, and which risks are knowingly accepted. The
original audit is in `CODEBASE_AUDIT.md`; `audit/verification-2026-11.md` says
which of its findings are fixed in the current source.

## Trust boundaries

- **Browser** — untrusted. Every value it sends is a hint or an input to be
  validated. Its disabled buttons and gated pages are usability features only.
- **Pages Functions** — trusted for enforcement. They hold the Appwrite API key,
  the Turnstile secret, the DOKU credentials and R2 access.
- **Appwrite** — trusted for identity (sessions, JWT verification, the `admins`
  team, account status). Notain does not trust Appwrite row permissions for
  tenant isolation; it uses them as a second layer only where rows are readable
  by sessions at all.
- **DOKU** — trusted only through HMAC signatures on webhooks and on the Check
  Status reconciliation, and only when the reply names the order we asked about.
- **Cloudflare Turnstile** — trusted through server-side siteverify. A missing
  secret fails closed.

## Threat model

Assets, in order of importance: payment state and plan entitlements; tenant
business data (invoices, customers, catalog, templates); personal data
(account identity, the login email); logos and payment proofs; the Appwrite
admin capability.

Principal threats considered in the code:

- a member of one organization reading or changing another's data;
- a plain member escalating to owner, or a removed member retaining access;
- a forged or replayed payment notification activating a plan;
- a client-chosen price or plan on checkout;
- a session token from one account authenticating another (session confusion);
- login CSRF through the OAuth callback;
- cost-amplification: floods that burn Workers requests, Appwrite reads, DOKU
  orders or R2 operations;
- a public capability URL enumerated or leaked;
- stored content injection through rich text, uploaded files, or the CSV import.

## Implemented controls

### Identity and sessions

- Bearer JWTs verified against Appwrite `GET /account` on every Function call
  (`functions/_lib/appwrite.ts`). The verified identity is cached 60 seconds per
  isolate, keyed by the token's SHA-256. The single-flight map uses the same
  key, so two different tokens never share a verification (fixed SEC-001).
- Failures are not cached; an unreachable Appwrite fails closed.
- Browser JWTs are never persisted and are dropped on every account change.
- The OAuth state cookie is compared with the callback's `state`, then cleared.
- Redirect targets are validated as same-origin paths
  (`src/lib/redirect.ts`).
- A 403 from the admin wall carries `forbidden`, not `unauthenticated`, so a
  demoted admin is denied rather than signed out (fixed QUAL-001).

### Authorization

- Every tenant route calls `requireOrg` or `requireOrgOwner` before any read or
  write. Membership is re-read per request and never cached.
- Unknown and foreign resources both answer 404.
- Row-level checks re-read the row and compare its stored `orgId` for every
  `PATCH` and `DELETE`, and for single-row `GET`.
- The admin wall requires a session and `admins` membership on every route.
- `ownerId` on a payment row is checked against the session before a status is
  returned.
- Forbidden columns are dropped from every tenant write body: `orgId`, `ownerId`,
  `plan`, `planExpiresAt`, `$id`, `$createdAt`, `$updatedAt`, `$permissions`.
- Plan columns are writable only by settlement and the admin API, both with the
  API key.

### Payments

- Prices come from `PAID_PLANS` on the server. A tampered client amount has no
  effect.
- The `business` plan is refused before any authentication or provider call
  while it is announced but not sold.
- Webhooks are verified against the raw body: `Client-Id`, `Request-Id`,
  `Request-Timestamp`, `Request-Target` and `Digest` are signed with HMAC-SHA256
  using the Back Office secret, compared in constant time.
- A browser redirect never activates a plan. Only a verified notification or an
  authenticated reconciliation with DOKU can.
- Settlement is a state machine (`src/core/billing/payment-state.ts`).
  `paid` is terminal for duplicate notifications. A `FAILED` channel state is
  ignored, as DOKU requires.
- Amount mismatch is never activated; it is audited as `payment.amount-mismatch`.
- The expiry baseline is frozen at checkout (`planAtCheckout`,
  `planExpiresAtSnapshot`), and activation is persisted as a fixed target
  (`activationPlan`, `activationExpiresAt`) before the organization is patched,
  so a retry cannot extend a plan twice.
- Checkout is deduplicated across isolates by a deterministic payment id, so the
  unique-id conflict decides the winner (fixed CONC-001).
- The DOKU endpoint is hardcoded to the sandbox, so production credentials
  cannot be used by this build.

### Public surfaces

- Capability ids must match one path segment (`ID_SEGMENT_PATTERN`) before any
  read.
- Public invoice reads are fenced per IP (60/minute), answer `no-store`, and
  return a projection rather than the row.
- The public site is fenced per IP (60/minute) and omits plan data, internal ids
  and the login email.
- Payment-proof uploads require Turnstile for customers, a per-invoice R2 lock
  for one-shot writes (fixed CONC-003), 5 MB and jpeg, png or webp only.
- Logo and proof objects are served with `nosniff`, `default-src 'none'; sandbox`
  and `cross-origin-resource-policy: same-origin`, so an uploaded SVG cannot
  run script when opened directly.
- Object deletion requires a session and owner metadata; another owner's key
  answers 404.

### Email

- SMTP credentials (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`) exist
  only in the `mailer/` process' environment. No Function, no bundle and no
  browser ever sees them; the Pages side holds only a URL and a shared bearer
  token, the token encrypted. `@sendust/ts` refuses plaintext SMTP and always
  verifies the relay's certificate and hostname — there is no option to turn
  that off.
- Mailing a nota requires a session **and** an active membership of the
  invoice's organization, checked after the row is read and before anything is
  sent; a foreign or missing id answers 404, so ids cannot be probed. The plan
  gate matches the public invoice link, because that link is what the email
  carries.
- The welcome mail cannot be aimed: the recipient is the verified session's own
  address, never a body field.
- Password reset is the one deliberately anonymous write with real power, so it
  is built to leak nothing and to be unusable when stolen:
  - 256-bit token, stored only as a SHA-256, valid 30 minutes, one row per
    account (re-requesting invalidates the previous link), deleted the moment it
    is redeemed;
  - every outcome of the request endpoint is 204 — unknown address, over-limit
    address, provider failure and mailer failure are indistinguishable from
    success, and no `user_not_found`/`invalid_credentials` code escapes;
  - the password is validated with the same Zod schema the forms use, then
    written with the API key (`users.updatePassword`), and every other session of
    the account is ended afterwards;
  - `Origin` (not configuration) builds the link, and it must be https outside
    loopback, so a token is never mailed as a plain-http URL.
- The mailer's HTTP surface is `/send` plus `/healthz`, no CORS, bearer-only,
  compared in constant time after hashing both sides; its `MAIL_SERVICE_TOKEN`
  is required at boot, so a misconfigured deploy fails loudly instead of running
  open.

### Input handling

- Zod schemas (`src/core/**/schema.ts`) validate every form on the client and
  again in the Functions for invoices, customers, catalog, templates, profiles
  and support messages.
- Rich text passes through an allowlist sanitizer (`src/core/shared/sanitize.ts`)
  that escapes text and attributes and validates URL schemes after decoding.
- Query strings for tenant lists are whitelisted per resource, so a client
  cannot invent filters.
- Request bodies are capped (512 KB for tenant writes, 8 KB for CSP reports, 64 KB
  over the 5 MB proof limit) and string values are capped at 64 KB.
- CSV and Excel import runs client-side, through `src/core/excel/`. Formula
  escaping on export is implemented (commit `f837b87`).

### Transport and browser

- Content-Security-Policy is enforcing (`public/_headers`). Scripts allow only
  `self`, Turnstile, the WebAssembly flag for the HEIC decoder, and hashes stamped
  by `scripts/csp-hashes.mjs`. There is no `unsafe-eval`; the Vue runtime-compiler
  alias exists to keep it that way. `style-src` allows `unsafe-inline` for Astro
  inline styles. Violations post to `/api/csp-report`.
- `frame-ancestors 'none'` and `X-Frame-Options: DENY`; `object-src 'none'`;
  `form-action 'self'`; `base-uri 'self'`.
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`. Preload is
  deliberately not requested.
- `Permissions-Policy` disables camera, microphone, geolocation and payment.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- Every JSON response sets `cache-control: no-store` by default.
- Client storage is scoped per account: drafts, the active organization and the
  JWT are cleared or keyed on account change.

### Secrets

- Server secrets (`APPWRITE_API_KEY`, `TURNSTILE_SECRET_KEY`, `DOKU_CLIENT_ID`,
  `DOKU_SECRET_KEY`, `DOKU_API_KEY`) are encrypted Pages variables or local
  `.dev.vars`. None is in `wrangler.toml`, which is committed.
- `wrangler.toml` contains only public-by-design values.
- The client bundle receives only `PUBLIC_*` variables. No secret is read from
  `import.meta.env`.
- Turnstile's sitekey is injected at build from a repository secret; the build
  fails without it rather than shipping an unprotected form.

### Auditing

- Admin mutations, organization lifecycle events and payment transitions write
  to `audit_logs`. An audit failure never fails the business write; it is logged
  and returned as a boolean.
- Audit rows are readable only through the admin API and by the `admins` team.

## Accepted risks

Each entry names the risk, its consequence, and what would change the decision.

- **Per-isolate rate limits and caches (RATE-001, MEM-002).** Limits, the
  circuit breaker and the caches live in module memory. Cloudflare may run many
  isolates, so the effective limit is a multiple of the configured one, and
  state resets when an isolate is recycled. Accepted while abuse is hypothetical.
  Revisit with a Cloudflare WAF rule or a KV/Durable Object counter. The caches
  have no hard size cap; floods of distinct keys can grow them up to the sweep
  threshold.
- **Session and admin cache TTL (CACHE-001).** A revoked session can act for up
  to 60 seconds per isolate. Lower the TTL with `QUOTA_SESSION_CACHE_TTL_MS` and
  `QUOTA_ADMIN_CACHE_TTL_MS` if the revocation objective is tighter.
- **No brute-force fence on sign-in, sign-up and recovery (RATE-004).** The
  Appwrite proxy forwards these calls without a per-IP limit; Turnstile is
  enforced in the browser only on the forms. Appwrite's own throttling is the
  current defence. A proxy-level fence on `/account/sessions` and
  `/account/recovery` would close the gap.
- **Free invoice quota is advisory on direct API calls.** The product gate
  checks the count before a save; `POST /api/data/invoices` does not recount. A
  client that calls the endpoint directly bypasses the allowance (documented in
  `quota.md`).
- **Upload type checks rely on the file extension (SEC-003).** Content is not
  sniffed. The serving headers limit the consequence to inert image rendering.
- **Proxy CSRF defence is the cookie's SameSite attribute (SEC-004).** The proxy
  strips `Origin`, so Appwrite cannot apply its own origin check. Confirm the
  session cookie's SameSite value from a live sign-in before relying on it.
- **Upstream error text can reach clients in some paths (SEC-002).** Several
  endpoints now log the provider body and return generic copy; others were not
  re-checked in this pass. See `audit/verification-2026-11.md`.
- **Support storage is not a message-delivery system.** The form tells the user
  to expect a reply in one or two business days. Nothing sends that reply.
- **The organization delete is not atomic.** It is resumable and guarded against
  live payments, but a crash mid-way leaves a partial organization until the
  owner repeats the request.
- **Personal data survives organization deletion.** `profiles/<userId>` and the
  Appwrite account are untouched by the cascade. There is no account-deletion
  endpoint.
- **Deprecated and disabled features still have code.** Member invitation
  creation and Business checkout are refused at the endpoint; the code paths
  behind them remain.
- **xlsx is installed from a CDN tarball (DEP-001).** Its integrity rests on the
  lockfile hash. Parsing of untrusted files happens on the main thread.
- **The Vite toolchain is overridden to a third-party repackaging (DEP-002).**
  Every build depends on it.
- **Configuration is spread across three places (ASTRO-002 and `operations.md`).**
  `.env`, `src/appwrite/config.ts` and `wrangler.toml` must agree on the Appwrite
  endpoint, project and database. The dev-server edit-route middleware mirrors
  the Functions by hand; the e2e suite is the guard.

## Reporting a security issue

Do not open a public issue or post the details in a chat. Contact the
maintainer directly. Include the endpoint, the request shape without secrets,
and the observed response. Never send real customer data or payment credentials
in a report; use a sandbox account.
