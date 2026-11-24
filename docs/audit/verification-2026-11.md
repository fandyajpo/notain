# Audit verification — 2026-11

This document checks each finding in `CODEBASE_AUDIT.md` against the source
tree as it stands at commit `9751a06`, and records the problems this
documentation pass found that the original audit did not list.

Method: each finding was checked by reading the cited file, or by searching for
the pattern the audit described. "Fixed" means the code now does what the
remediation claimed. Nothing was executed: no test run, no deploy, no live
request. Runtime confirmation is still listed as outstanding wherever it
applies.

## Status of the original findings

### Critical and high

- **SEC-001 — session single-flight keyed on a token prefix. Fixed.**
  `functions/_lib/appwrite.ts` now keys `singleFlight` on `session:<sha256 of
  token>`, the same key as the cache. Different tokens cannot share a flight.
  No regression test was read to confirm one exists for this exact case.
- **CONC-002 — settlement could extend a plan twice across isolates. Mitigated.**
  The checkout stores `planAtCheckout` and `planExpiresAtSnapshot`, and
  settlement computes the target from that baseline, persisting it as
  `activationPlan`/`activationExpiresAt` before patching the organization. Two
  isolates computing from the same baseline write the same value. This is
  convergence, not a compare-and-swap; a write landing between the two reads
  could still be lost. Accepted; runtime verification (TS-05, TS-06) outstanding.
- **CONC-001 — duplicate checkouts across isolates. Mitigated.**
  `deterministicInvoiceNumber` makes the payment row id shared by concurrent
  checkouts of the same plan in the same month, so Appwrite's unique id decides
  the winner. Renewals in the same month use a disjoint random id. Runtime
  verification (TS-04) outstanding.

### Medium

- **RATE-002 — no fence on the public invoice read. Fixed.** `invoice-read`,
  60 requests per minute per IP, runs before the database read.
- **DB-002 — quota walk for paid organizations. Fixed.** `resolve()` skips the
  count walk when the plan is active. The walk for free organizations is still
  paged up to 100 pages; the audit's suggested early exit by month was not
  added.
- **DB-001 — per-row reads in `GET /api/orgs`. Fixed.** Batched `equal($id, […])`
  reads in chunks of 100, with a per-id fallback when the batch fails.
- **RATE-001 — per-isolate rate limits. Open, accepted.** No KV or WAF change in
  the repository. See `security.md`.
- **RATE-004 — no brute-force fence on sign-in and recovery. Open.** The proxy
  still forwards these calls without a limit. See `security.md`.
- **CACHE-001 — 60-second revocation window for sessions and admin status. Open,
  accepted.** Configuration levers are documented; no change to the default.
- **PERF-001 — authenticated request cost. Open.** The audit asked for a
  re-measurement after the database fixes; none was made in this pass.
- **DEP-001 — `xlsx` installed from a CDN tarball. Open.** Lockfile integrity not
  checked in this pass.
- **QUAL-001 — admin 403 carried `unauthenticated`. Fixed.** `requireAdmin`
  now returns `forbidden`.

### Low and informational

- **QUAL-002 — two divergent `normalizeStatus` implementations. Open.** Both
  still exist: `functions/_lib/payment-settle.ts` (`pending | paid | expired`)
  and `functions/api/payments/portal.ts` (adds `failed`). Their difference is
  deliberate in part (the portal shows `failed`; settlement does not act on it),
  but the duplication remains.
- **QUAL-003 — stale CSP docstring. Fixed.** `functions/api/csp-report.ts` now
  describes the enforcing policy.
- **QUAL-004 — `resource0()` reverse lookup. Open.** Cosmetic.
- **CONC-003 — proof one-shot race. Mitigated.** The per-invoice R2 lock
  serializes uploads (`functions/_lib/proof-lock.ts`). The lock is lease-based
  with a 60-second lease and conditional writes; a stray object is removed when
  the row write fails.
- **CONC-004 — org-create compensation ignored `deleteRow`'s result. Fixed.**
  The result is checked, and a failed cleanup writes an audit row.
- **SEC-002 — upstream error bodies echoed to clients. Partly fixed.**
  `functions/api/support.ts`, `functions/api/payments/checkout.ts` and
  `functions/api/admin/users/[id].ts` now log the provider body and return
  generic copy. One echo remains: `functions/api/admin/support/[id].ts` still
  appends the first 200 characters of the upstream body to the response message
  (`Gagal mengubah status pesan: …`). `functions/api/admin/users.ts` was not
  re-read on its error paths in this pass. Treat as partly fixed.
- **SEC-003 — upload type trusts the extension. Open, accepted.** Serving
  headers limit the consequence.
- **SEC-004 — proxy CSRF relies on SameSite. Open.** Needs a live cookie check.
- **SEC-008 — same as QUAL-001. Fixed.**
- **SEC-011 — invoice id entropy. Open.** The id is the invoice's deterministic
  hash, `inv_` + 32 hex of `sha256(ownerId:number)`. Its entropy depends on
  whether the owner id is secret, and owner ids are visible in some admin
  responses. The audit's suggested unguessable share token has not been added.
- **MEM-001 — layout listener retention. Open.**
- **MEM-002 — unbounded growth in rate-limit and cache maps. Open.** `quota.ts`
  still has no hard cap; only sweeps on size thresholds.
- **ASTRO-005 — `json()` does not set `X-Content-Type-Options` or CSP. Open.**
  Checked: `functions/_lib/http.ts` sets `content-type` and `cache-control` only.
- **DB-005 — admin drill-down counts by `ownerId`. Open, confirmed.** See
  `features/admin.md`.
- **DEP-002 — Vite overridden to a repackaging. Open, accepted.**

## Findings this pass added

These came from reading the code for this documentation set. They are not in
the original audit.

1. **Settings documentation drift.** `docs/BUSINESS_FLOWS.md` §3 says `/settings`
   carries a subscription card. The current `settings-app.tsx` renders the
   profile editor and the tour control only. Billing is at `/billing`. The
   guide is out of date; the code is authoritative.
2. **`importCustomers` identity mismatch.** A docstring in
   `src/app/customers.ts` says identity is email _or_ phone. The code calls
   `isSameCustomer`, which requires both. The guide describes the code. The
   docstring should be corrected.
3. **Business plan benefit copy.** `src/core/billing/plan-benefits.ts` lists an
   API key, multiple API keys, and webhooks for the Business plan. None of these
   exists: `/api-keys` is a placeholder and no webhook sender is present. The
   plan is announced, not sold, but the copy describes features that do not
   exist.
4. **Harden script not in `package.json`.** `scripts/harden-profile-permissions.mjs`
   has no npm script. It has to be run directly.
5. **Customer name column size.** `CUSTOMER_LIMITS.name` is 128 in the domain.
   The size the provisioning script created for that column was not confirmed in
   this pass, so `docs/data-model.md` deliberately does not state it. Verify
   against the Appwrite console before relying on either number.
6. **Admin audit is best-effort.** `writeAudit` never throws, so a business
   change can succeed without its audit row. This is documented in code, but it
   means the audit log is not a complete record. The admin screens present it as
   one.
7. **Organization deletion is not atomic.** Documented in `ORG_LIFECYCLE.md` and
   reconfirmed. It is resumable and guarded; a partial state is possible after a
   failure mid-cascade.
8. **Invoice-number uniqueness is conditional.** The unique index on
   `(orgId, invoiceNumber)` is created by `npm run db:ensure` (declared in
   `scripts/schema.mjs`). If that
   script has not run in an environment, duplicate numbers are possible there.
   The deterministic id prevents the same number from being saved twice by the
   same owner, but only within one database.
9. **`docs/README.md` was missing its link targets.** Fixed in this pass by
   writing the documents the index references.
10. **Owner-only read that the client calls member-readable.**
    `GET /api/orgs/<id>` uses `requireOrgOwner`, so a plain member receives 403.
    `src/app/org-contact.ts` documents the endpoint as "member-readable current
    values", and the organization settings page calls it. A member opening
    `/settings/organization` therefore gets a permission error from the contact
    editor rather than disabled fields. Either the gate or the client comment is
    wrong; `/api/orgs` already returns each organization's contact fields, so
    the member-facing read could come from there.
11. **Wrong error code on an owner mismatch.** `functions/api/invoice/[id]/proof.ts`
    answers `403` with the code `unauthenticated` when the session does not own
    the invoice. The client's expiry handler treats `unauthenticated` as a lapsed
    session; it re-verifies with Appwrite first, so the practical effect is an
    error rather than a forced sign-out, but the code should be `forbidden`
    (the same class as QUAL-001).
12. **Stale route wording.** `functions/site/[[id]].ts` and
    `src/app/public-site.ts` still describe the public page id as an owner id.
    It is the organization id. The behaviour is correct; the comments are not.
13. **`5xx` answers carrying the `validation` code.** `functions/api/profile.ts`
    (`Gagal menyimpan profil.`), `functions/api/profile/user.ts`, the admin list
    endpoints and others return HTTP 500 with `error: 'validation'` for write
    failures. A client that branches on the error code cannot distinguish input
    rejection from an outage; only the status differs.

## Items that need runtime evidence

- Session isolation under concurrent verification (SEC-001 fix).
- Two concurrent checkouts for one organization and plan (CONC-001).
- Settlement with a replayed notification and with a status poll racing it
  (CONC-002, TS-05, TS-06).
- Public invoice rate fence behaviour (RATE-002, TS-10).
- Proof upload under concurrency (CONC-003).
- Live `admins` membership check and its 60-second cache.
- Cookie attributes of a real Appwrite sign-in through the proxy (SEC-004).
- Index creation state in the production Appwrite project (`npm run db:ensure`).

These map to `TEST_SCENARIOS.md`. None was run as part of this pass.

## Runtime evidence, 2026-11-24

A later pass ran the live paths by hand against the production project and
recorded what came back. This is evidence that the paths work, not a test run:
none of it has automated coverage.

- **Schema applied.** `npm run db:ensure -- --yes` reconciled 12 tables; the
  `payments` table gained its 7 missing columns, and `invoices`/`payments` ended
  at `$permissions: []` with row security on.
- **Greeting mail.** `POST /api/mail/welcome` answered 202 once per account, and
  `{sent:false}` afterwards — the `welcomeSentAt` marker holds.
- **Reset mail.** `POST /send` → 200 in 6.35 s; the token row carried a
  30-minute expiry and the link was redeemed.
- **Nota mail.** `POST /send` → 200 in 4.36 s, and the invoice row's
  `$updatedAt` landed 53 ms later with `status: 'sent'` — the forward-only
  transition applied after the relay accepted.
- **DOKU sandbox.** A Pro purchase produced a payment row that settled to
  `status: paid` with the organization moving to `plan: pro`, after which the
  invoice link page opened instead of answering 402.
- **Mail lands in Spam.** The greeting and the reset both went to the
  recipient's Spam folder: the sender has no domain reputation, and the reset
  copy links `notain.pages.dev`. No code change fixes that — it needs an owned
  domain and DKIM, which `@sendust/ts` supports.

For the record, the relay is an Appwrite Function (`mailer/src/appwrite.mjs`),
reached at `https://notain.sgp.appwrite.run` on `POST /send` and `GET /healthz`
behind a bearer token, because a free Render instance cannot open an SMTP
session.

Still without runtime evidence: the `/billing` portal, the admin panels, the
concurrency and rate-fence items above, and every `npm run smoke` /
`npm run test:e2e` suite.

## Re-running this verification

Search each cited file for the pattern in the finding, read the surrounding
function, and update the status above. Do not mark an item fixed on the basis
of a commit message alone.
