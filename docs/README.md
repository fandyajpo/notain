# Notain documentation

This folder is the documentation set for Notain: what the product does, how the
system is built, every HTTP surface it exposes, how it is operated, and what is
verified versus assumed.

**Audit snapshot:** the tree at commit `9751a06` on `main` — the last commit
before this documentation set was written. Every technical claim below was read
out of that source tree. Where a statement could only be established by running
something (a deploy, a payment, a browser flow), the document says so instead of
implying it was run.

## Where to start

- **New to the project** — read `overview.md`, then
  `architecture/system.md`.
- **Changing an endpoint** — `api-reference.md` plus the matching file under
  `features/`.
- **Changing the database** — `data-model.md` and the `scripts/schema.mjs` it
  describes (one table = one entry; `npm run db:ensure` applies it).
- **Shipping something** — `operations.md` (CI gates, deploy path, runbooks)
  and `testing.md`.
- **Reviewing risk** — `security.md` and
  `audit/verification-2026-11.md`.

## Core references

- [`overview.md`](./overview.md) — product, actors, feature status, vocabulary,
  constraints.
- [`architecture/system.md`](./architecture/system.md) — runtime topology,
  layering, request lifecycle, islands, routing, build pipeline, client state.
- [`data-model.md`](./data-model.md) — every Appwrite table, column, index and
  permission, the R2 objects, and the provisioning order.
- [`api-reference.md`](./api-reference.md) — every Pages Function endpoint:
  gate, inputs, outputs, errors, rate limits, side effects.
- [`auth-and-tenancy.md`](./auth-and-tenancy.md) — sign-in, sessions, JWTs, the
  Appwrite proxy, organization membership gates, roles, deletion.
- [`security.md`](./security.md) — threat model, implemented controls, CSP and
  headers, secrets, accepted risks.
- [`operations.md`](./operations.md) — environment variables, local development,
  schema scripts, CI/CD, monitoring, incident runbooks.
- [`testing.md`](./testing.md) — test layers (unit, endpoint, browser, smoke),
  what each proves, and the current coverage gaps.

## Feature handbook

Implementation-level guides per product area: data flow, state machines,
validation, failure modes, and the files that own each rule.

- [`features/invoices.md`](./features/invoices.md) — builder, numbering, status
  chain, autosave, duplication, print/share, proofs, exports.
- [`features/templates.md`](./features/templates.md) — built-in and saved
  templates, block layout rules, theme, defaults, resolution.
- [`features/customers-and-catalog.md`](./features/customers-and-catalog.md) —
  customer directory, import and merge, remember-on-save, product catalog.
- [`features/dashboard-and-finance.md`](./features/dashboard-and-finance.md) —
  stats cache, finance window, metric definitions, activity feed.
- [`features/billing-and-quota.md`](./features/billing-and-quota.md) — plans,
  entitlements, DOKU checkout, settlement state machine, the free invoice quota.
- [`features/email.md`](./features/email.md) — the `mailer/` service on
  `@sendust/ts`, the three messages, the reset-token design, why the mailer is a
  separate process, and its operational checklist.
- [`features/public-pages.md`](./features/public-pages.md) — public invoice
  capability URL, payment-proof upload, public business site, marketing and SEO
  pages.
- [`features/settings-and-profile.md`](./features/settings-and-profile.md) —
  account identity, organization settings, logo upload, public page link.
- [`features/admin.md`](./features/admin.md) — admin wall, user management,
  content tools, support queue, audit log.

## Audit and decision records

- [`audit/verification-2026-11.md`](./audit/verification-2026-11.md) —
  **current.** Re-checks every finding in the original audit against today's
  source, and records newly found issues.
- [`CODEBASE_AUDIT.md`](./CODEBASE_AUDIT.md) — the original static audit
  (2026-11): findings and reasoning. Some line numbers have moved since.
- [`CODEBASE_REMEDIATION.md`](./CODEBASE_REMEDIATION.md) — remediation tracker
  with per-finding status.
- [`audit/simplification-2026-11.md`](./audit/simplification-2026-11.md) —
  **current.** The development-experience pass: what was duplicated, what was
  actually broken, and what it changed.
- [`TEST_SCENARIOS.md`](./TEST_SCENARIOS.md) — runtime verification scenarios
  (TS-01…). These are proposals, not a record of executions.
- [`architecture/README.md`](./architecture/README.md) — architecture decision
  index and the project's own design notes (Indonesian).
- [`architecture/adr/`](./architecture/adr/) — seven accepted ADRs:
  custom-element boundary, ecosystem scope, picker data, light DOM, data props,
  one query layer, print-based PDF.
- [`architecture/caching.md`](./architecture/caching.md) — cache policy per data
  type, tenant isolation, and the honest limits.
- [`architecture/bundle.md`](./architecture/bundle.md) — bundle measurements
  before and after the multi-framework integration.
- [`architecture/framework-compliance.md`](./architecture/framework-compliance.md) —
  how TanStack and Zod stay authoritative across four frameworks.
- [`architecture/playwright.md`](./architecture/playwright.md) — browser-test
  decisions for the custom-element boundary.
- [`engineering/dependency-risk-register.md`](./engineering/dependency-risk-register.md) —
  accepted dependency risks.

## Business and product references

- [`BUSINESS_FLOWS.md`](./BUSINESS_FLOWS.md) — current, source-checked
  walkthrough of every user and admin flow, plus candidate good/bad-path scenes.
- [`ORG_LIFECYCLE.md`](./ORG_LIFECYCLE.md) — no-organization state, creation,
  deletion, and its verification scenarios.
- [`multi-tenancy.md`](./multi-tenancy.md) — **historical.** A status notice sits
  at the top; the server-gate details are still useful.
- [`payments.md`](./payments.md) — **historical.** Server-side contract summary;
  old operational steps are superseded.
- [`quota.md`](./quota.md) — current. Provider limits, safeguards, and
  quota-failure behaviour.
- [`business-site.md`](./business-site.md) — **historical.** Read its status
  notice before use.
- [`brand-voice.md`](./brand-voice.md) — tone and wording rules for Indonesian
  copy.
- [`copy-inventory.md`](./copy-inventory.md) — inventory of user-facing strings.
- [`launch-checklist.md`](./launch-checklist.md) — pre-release checklist.

## Documentation contract

1. **The executable source wins.** If a comment, an old document, or a UI label
   disagrees with the current endpoint, schema script, or test, the code is the
   specification. The documents here are maintained against it.
2. **Verified versus assumed is always stated.** Anything that needs a live
   deployment (payments, webhooks, Cloudflare quotas, browser storage
   behaviour) is described from source and marked as such.
3. **No secrets, no production data.** Documents name variables, never values.
   Example ids are synthetic. Payment examples are DOKU sandbox only.
4. **Historical documents keep their status notice.** Several older files
   describe a previous data model; their notice explains what changed, and they
   are kept because the reasoning is still useful.
