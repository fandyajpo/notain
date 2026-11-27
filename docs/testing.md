# Testing

What is tested, by which layer, how to run it, and what each layer does and
does not prove. Nothing in this document was executed during this
documentation pass; the statements describe the suites as they exist in the
repository.

## Layers

- **Unit and component** — Vitest (`vp test run`), files in
  `src/**/*.test.ts(x)`. Runs in CI as `npm test`. Needs no network.
- **Endpoint** — Vitest in the node environment, files in `tests/*.test.ts`.
  Runs in CI. Uses an in-memory Appwrite double, so no network.
- **Mailer** — Node's own runner (`npm run test:mailer`), files in
  `mailer/test/*.test.mjs`. Runs in CI. Needs nothing at all: the tests import
  the configuration, the message builders and the request validator, never the
  native `@sendust/ts` addon, so they pass before `npm install` in `mailer/`.
- **Browser** — Playwright (`npm run test:e2e`), files in `e2e/*.spec.ts`. Not
  run in CI. Needs the Chromium download once (`npm run test:e2e:install`), a
  dev server on port 4321 (started for you if it is not already up) and Appwrite
  for the signed-in flows.
- **Live smoke** — Vitest with `vitest.smoke.config.ts` (`npm run smoke`), files
  in `smoke/*.test.ts`. Not run in CI. Talks to live Appwrite and the deployed
  logo Function.
- **Type check** — `astro check` plus `tsc --noEmit` over the whole project.
  Runs in CI.
- **Format** — Prettier through `vp fmt`, over the whole project. CI **applies**
  it (`npm run format`) rather than failing on it: the build uses the formatted
  tree and a warning reports how many files it rewrote. `format:check` is the
  local command, and `npm run check` runs it for you.
- **Lint** — `vp lint` with the rules in `vite.config.ts`. **Not** run in CI.

Ordinary `npm test` picks up `src/**` and `tests/**` only — the mailer suite is a
separate package, which is why it has its own command. Pages Function code is
tested from `tests/`, not from `functions/`, because Cloudflare compiles
everything under `functions/` into the Worker.

## Running them

Everything offline, in one place:

- `npm run check` — **formats first** (`vp fmt .`), then verifies: format check,
  lint, `test:all`, typecheck. The gate to run before pushing; it needs
  `npm install` once and nothing else. Formatting before checking is deliberate:
  a push should never fail on something the formatter can fix by itself, and the
  check afterwards proves the tree is now stable.
- `npm run test:all` — both offline suites: `npm test` (Vitest) then
  `npm run test:mailer` (Node's own runner).
- `npm test` — unit, component and endpoint tests (Vitest). `npm run test:watch`
  keeps the same suite running while you edit.
- `npm run test:mailer` — `mailer/test/*.test.mjs`. No install, no network: it
  never imports the native addon.
- `npm run test:e2e` — Playwright, which starts the dev server itself if nothing
  is listening on 4321. Run `npm run test:e2e:install` once to fetch Chromium;
  the plan-gated specs additionally need Appwrite. `npm run test:e2e:ui` opens
  the same suite in Playwright's UI mode.
- `npm run smoke` — live smoke against Appwrite and the deployed logo Function;
  needs a real `.env`.

`npm run check` is the local equivalent of what CI runs, minus the build and the
deploy: format, lint, tests, typecheck. CI's `deploy` job depends on the `lint`
job, so a lint error stops a deploy; a clean `check` still proves everything in
one go before a push.

Neither offline suite touches the network, so both are safe to run with no
`.env`, no Appwrite session and no mailer process.

## Unit and component tests (`src/`)

Coverage by area, by file name:

- Core domain (`src/core/**`): calculator, numbering, fingerprint, invoice model,
  schema, status, repair; customer and catalog models and schemas; plans,
  payment state, DOKU request signing and notification parsing; business
  taxonomy, presets, detail fields; template layout, builtins, resolve, schema,
  seed, repair; finance and stats; money, dates, sanitizer; the CSV and Excel
  import and export; WhatsApp message building; SEO industries.
- Application (`src/app/**`): auth and OAuth completion, session caching,
  invoices, customers, catalog, finance, payments, profile, org switching, org
  endpoints' client, public invoice and site parsing, stats.
- Appwrite layer (`src/appwrite/**`): client token caching, error mapping,
  mappers for every table.
- Query layer (`src/lib/query/**`): session expiry, session cache, policies,
  org-mutation guards, hooks for invoices, orgs and selection.
- Components (`src/components/react/**`): the org gate, invoice preview, print
  flows, template picker and block list, selection toolbar, menu, modal, select,
  error boundary, Turnstile, profile form, billing and business-type pickers,
  finance section, setup checklist, site templates, shared probe host.
- Other: draft storage, edit-route rules, redirects, navigation, print
  handoff, Turnstile client, unsaved-changes guard, toasts and confetti, the
  typing-feedback helper, the Svelte grid, the Vue picker, the Solid inspector.

These tests run in `jsdom` for components and `node` for logic. Tests that touch
global state reset it through `tests/quota-reset.ts`, registered as `setupFiles`.

## Endpoint tests (`tests/`)

`tests/appwrite-fake.ts` is an in-memory Appwrite double used by most endpoint
tests. It serves the REST paths the Functions call and enforces the subset of
queries they use.

What each file exercises:

- `data-endpoint.test.ts` — the tenant CRUD gate, whitelisted queries, row-level
  org checks, bulk delete limits, invoice validation and status transitions.
- `org-endpoints.test.ts` — create (including the plan gate and compensation),
  rename and business type, contact validation, member list, removal rules,
  acceptance, the cascade, and the payment guard.
- `profile-function.test.ts` — the account identity and org profile, the
  whitelist that keeps `plan` out of writes, legacy fallbacks.
- `quota-endpoints.test.ts` and `invoice-quota-endpoint.test.ts` — the free
  allowance read and claim, the 402 path, admin unlimited answers.
- `quota.test.ts` — the rate limiter, cache, single-flight and circuit breaker.
- `checkout.test.ts`, `doku-notify.test.ts`, `payment-status.test.ts`,
  `portal.test.ts` — the payment routes: duplicate guards, signature checks,
  settlement, reconciliation throttle, ownership.
- `invoice-link-gate.test.ts` — the 402 gate on public invoices.
- `site-function.test.ts` — the public business page payload and its 404 and 503
  shapes.
- `proof-endpoints.test.ts` — upload, one-shot rule, owner replacement, deletion
  and the lock.
- `admin-users.test.ts`, `admin-content.test.ts`, `admin-support.test.ts`,
  `audit.test.ts`, `me-admin.test.ts` — the admin wall and admin operations.
- `appwrite-proxy.test.ts` — cookie rewriting and header stripping.
- `http-headers.test.ts` — the security and cache headers.
- `upstream-timeout.test.ts` — the 10-second deadline.

These tests prove the Function logic against the fake. They do not prove that
Appwrite accepts the same requests, that the indexes exist, or that DOKU and
Turnstile behave as the fake does.

## Browser tests (`e2e/`)

Playwright, Chromium only, `fullyParallel`, a 45-second per-test timeout. The
config starts `npm run dev` if no server is running on port 4321.

Specs present: `landing`, `sidebar`, `invoice-islands`, `invoices-filters`,
`dashboard-finance`, `edit-routes`, `site-page`, `probes`, plus `zz-prod`. The
shared helpers are in `e2e/support.ts`. `global-setup.ts` provisions a smoke
account when it is missing and grants it the Pro plan through the admin API
when `APPWRITE_API_KEY` is in `.env`; without the key, plan-gated specs fail
with their own assertion.

`e2e/zz-prod.spec.ts` is the only spec aimed at production, and it was not read
in this documentation pass. Read it before running the suite against any
environment other than the local dev server.

The browser suite proves the framework boundary (the probes page), the route
rewrites, and the main UI flows against a live Appwrite. It is not run in CI.

## Live smoke (`smoke/`)

`smoke/appwrite.smoke.test.ts` is the only suite that talks to the live backend
and to the deployed logo Function. Its scope, from `docs/architecture/README.md`
and the file itself: authentication, profile, logo, invoice, templates (CRUD,
JSON columns, default rich text, user isolation) and customers (rows filed on
save, no duplicates for the same number, user isolation). It also caught a
template mapper bug where one `null` field emptied the whole defaults object.

`smoke/setup.ts` provides the browser-like globals the Appwrite SDK needs in
Node.

Run it only against a test project and test accounts. It writes data.

## Type checking and formatting

- `npm run typecheck` runs `astro check` and `tsc --noEmit` with a strict
  configuration: `noUncheckedIndexedAccess`, `noImplicitOverride`,
  `noFallthroughCasesInSwitch`, `allowUnreachableCode: false`.
- `npm run format:check` fails on any unformatted file in the repository,
  Markdown included. It is a local check: CI runs `npm run format` instead, so
  formatting can never block a deploy. `.prettierignore` excludes `dist/`,
  `.astro/`, `node_modules/`, `package-lock.json`, `coverage/` and `*.svelte`.

## Lint

`npm run lint` runs `vp lint .` with type-aware rules: no explicit `any`, no
unused variables, `prefer-const`, the Astro plugin rules, and the Vite Plus
import preference. It is not part of the deployment gate, so lint failures reach
`main` unless someone runs it first.

## Verification status by area

Described from the test suites present, not from executed runs:

- Session and org-switch race behaviour: covered by unit tests on the query
  layer and the org gate; not covered end to end.
- Payment settlement and webhook idempotency: covered by endpoint tests against
  the fake; not covered against DOKU's sandbox in CI.
- Admin privilege checks: covered by endpoint tests; the live `admins` team
  membership is covered only by the smoke suite, which is run by hand.
- Cross-tenant isolation: covered by endpoint tests that send a foreign org id;
  not covered by a live two-account browser test.
- Print output: `invoice-preview.test.tsx` and the print components are unit
  tested; the printed page itself is not checked against a PDF renderer.
- Bundle budgets: documented in `architecture/bundle.md`; not enforced by a test.

The scenarios in `TEST_SCENARIOS.md` (TS-01…TS-23) describe the runtime checks
that would close the remaining gaps. Their status is tracked in
`audit/verification-2026-11.md`.

## Writing a new test

- Put a Function test in `tests/`, import the handler, and drive it with
  `new Request(...)` against `appwrite-fake.ts`. Stub `fetch` for DOKU and
  Turnstile. The handler's `env` object is a plain record.
- Put a pure rule in `src/core/` with a sibling `*.test.ts`.
- Put a component test in the component's folder with `jsdom`, following
  `org-gate.test.tsx` for query-backed components.
- Do not add tests under `functions/`; they would be bundled into the Worker.
