# Operations

How the system is configured, built, deployed and kept running: environment
variables, local development, the schema scripts, CI and deployment, and the
runbooks for the failures seen most often.

## Environments

Three places hold configuration, and they must agree:

- `.env` (git-ignored; copied from `.env.example`) — feeds the **client** build
  through Vite. Only `PUBLIC_*` names reach the browser.
- `src/appwrite/config.ts` — hardcoded defaults for the same public values, so
  CI can build without a `.env` file.
- `wrangler.toml` `[vars]` and the R2 binding — feed the **Pages Functions**.
  `.env` is not read by Functions.

Secrets never go in any of the three. They live in Pages encrypted variables
(production) or `.dev.vars` (local, git-ignored, loaded automatically by
Wrangler).

## Variables

Client build (`.env`, Vite):

- `PUBLIC_APPWRITE_ENDPOINT` — region-scoped, default `https://sgp.cloud.appwrite.io/v1`.
  The global endpoint rejects the project with `general_access_forbidden`.
- `PUBLIC_APPWRITE_PROJECT_ID` — default `6aca66fb003071c0ef43`.
- `PUBLIC_APPWRITE_DATABASE_ID` — default `notain_db`.
- `PUBLIC_LOGO_API` — default `/api/logo`. Override only where a path has no
  meaning (the Node smoke test sets an absolute URL).
- `PUBLIC_PROFILE_API` — optional override of `/api/profile` used by the
  profile repository.
- `PUBLIC_TURNSTILE_SITE_KEY` — optional locally. Production gets it from the
  `PUBLIC_TURNSTILE_SITE_KEY` repository secret.

Functions (`wrangler.toml` `[vars]`, mirrored in `.env` for the smoke suite):

- `PUBLIC_APPWRITE_ENDPOINT`, `PUBLIC_APPWRITE_PROJECT_ID`,
  `PUBLIC_APPWRITE_DATABASE_ID` — same values as above.

Functions (encrypted Pages variables or `.dev.vars`):

- `APPWRITE_API_KEY` — server API key. Without it `requireAdmin` answers 500
  and tenant gates answer 503. Scopes needed: `users.read`, `users.write`,
  `teams.read`, `documents.read`, `documents.write`, plus `collections.*` for the
  scripts.
- `TURNSTILE_SECRET_KEY` — Turnstile siteverify. Missing means every gated
  form answers 500 `unconfigured`.
- `DOKU_CLIENT_ID`, `DOKU_SECRET_KEY`, `DOKU_API_KEY` — sandbox credentials.
  Without the first two, checkout and the webhook answer 500.
- `MAIL_SERVICE_TOKEN` — the bearer the `mailer/` service requires on `/send`.
  One value, set twice: as a variable on the mailer function and as this Pages
  variable. Without it (or without `MAIL_SERVICE_URL`) every `/api/mail/*`
  endpoint answers 503 and no email is sent; nothing else changes.
- `MAIL_SERVICE_URL` — where the mailer listens, no trailing slash. The mailer is
  an Appwrite Function (`mailer/src/appwrite.mjs`), so this is the function's
  generated domain. A plain URL, so it lives in `wrangler.toml` `[vars]`
  (currently `https://notain.sgp.appwrite.run`) and ships with every deploy;
  `http://localhost:8080` is accepted for `wrangler pages dev`. SMTP
  credentials (`SMTP_USER`, `SMTP_PASS`, and optionally `SMTP_HOST`,
  `SMTP_PORT`, `SMTP_SECURITY`, `MAIL_FROM`) belong to the mailer process and
  never reach a Function. With Gmail only the first two are needed — the host,
  port and sender default from the account. See `mailer/.env.example`.
- `QUOTA_*` — optional overrides (not secret): session and admin cache TTLs,
  next-number cache TTL, Appwrite read retries and base delay, DOKU breaker
  threshold and cooldown, and the `QUOTA_LIMIT_*` family. Defaults are in
  `functions/_lib/quota.ts`; the full list is in `functions/_lib/types.ts`.

CI secrets (GitHub repository): `CLOUDFLARE_API_TOKEN` (Pages Edit and R2
Storage Edit), `CLOUDFLARE_ACCOUNT_ID`, `PUBLIC_TURNSTILE_SITE_KEY`, plus
`MAIL_SERVICE_TOKEN` once the mailer function exists — the domain is in
`wrangler.toml`, and the workflow copies that one token into the Pages project,
so email needs no dashboard step at all.

## Local development

- `npm install`.
- `npm run dev` starts Astro in the background (`astro dev --background`).
  Manage it with `npm run dev:status`, `dev:logs`, `dev:stop`. `AGENTS.md`
  describes the background mode.
- The dev server does **not** run Pages Functions. `/api/*` requests are
  proxied to `https://notain.pages.dev` by `astro.config.mjs`, so logo calls
  work but any local Function change is invisible.
- `npm run dev:pages` runs a full build and then `wrangler pages dev dist`,
  which compiles `functions/` the way Cloudflare does, with `[vars]` and the
  `LOGOS` binding. Local R2 state lives in `.wrangler/`.
- Put `APPWRITE_API_KEY`, `TURNSTILE_SECRET_KEY` and the `DOKU_*` values in
  `.dev.vars`. Smoke-test a route with `curl -s localhost:8788/api/admin/content`:
  a JSON error means the Function compiled and answered.
- Use test accounts only. Payment flows must use DOKU sandbox credentials.

`npm run reset:dev` runs `scripts/reset-dev.mjs` against the environment in
`.env`. The script was not read in this documentation pass; read it before
running it, because it is the one script that touches development data
wholesale.

## Build

`npm run build` runs four steps in order: `astro build`, then
`scripts/modulepreload.mjs`, `scripts/sitemap.mjs`, `scripts/csp-hashes.mjs`.
Run it through npm, never `astro build` alone: the modulepreload links and the
CSP hashes silently go missing otherwise. The output is `dist/`.

`public/_headers` is part of the build output and must not be removed: it
carries the immutable cache rule for `/_astro/*` and the security headers.

## Schema provisioning

The database is created and changed by `npm run db:ensure`, which reads every
table, column and index from `scripts/schema.mjs`. It is dry-run by default
(`-- --yes` applies), idempotent, and additive — it never drops or rewrites
anything. `npm run db:ensure -- --list` prints the inventory.

- One-off data backfills: `migrate:org-identity`, `migrate:org-contacts`.
- Hardening: `npm run harden:profiles` — rewrites `profiles` row permissions and
  drops its table-level create permission.
- Wipe: `npm run reset:dev` (development projects only).

Adding a table or a column is one edit in `scripts/schema.mjs`; there is no new
script to copy. `data-model.md` documents what each entry means.

A column a feature writes must exist before that feature deploys. A missing
column does not fail at build time; it fails at runtime, usually as a 503 from
the Function, or as a refused create logged server-side by `createRow`.

## Continuous integration and deployment

`.github/workflows/deploy.yml` runs on every push to `main` and on manual
dispatch. The `deploy` job, in order:

1. Check that the three secrets are present; fail with a readable message if not.
2. `npm ci` on Node 22.
3. `npm run format` — **applied, not enforced**: the step rewrites the tree so the
   build uses formatted output, and warns when it had to. Formatting never fails
   a deploy; run `npm run format` (or `npm run check`) before pushing to keep the
   commit and the build identical.
4. `npm test` (`vp test run`, Vitest, offline).
5. `npm run typecheck` (`astro check && tsc --noEmit`).
6. `npm run build`.
7. `npm run deploy -- --branch main` (`wrangler pages deploy dist`), which
   uploads static assets and the compiled Functions together.

A second job, `lint`, runs first: `npm ci`, `npx astro sync` (the type-aware
rules read the generated `.astro/types.d.ts`) and `npm run lint`. `deploy` declares
`needs: lint`, so a lint error stops a deploy instead of only showing on the run.

Concurrency is serialized (`deploy-cloudflare-pages`, no cancel). Cloudflare's
own automatic build is switched off, so the dashboard shows
"Automatic deployments paused" with a queued `github:push` row on every push.
That is expected, not a failure.

Not gated in CI: `npm run test:e2e` and `npm run smoke`. The browser suite needs
a running dev server and talks to Appwrite. The smoke suite talks to live Appwrite
and the deployed logo function.

### Knowing a deploy finished

The build is done when the Actions run is green (`https://github.com/fandyajpo/notain/actions`),
or when the newest Cloudflare deployment for the `notain` project reads
"Success". To confirm the bytes that shipped, request production and check for
a fingerprint of the build: the count of `rel="modulepreload"` links on `/`, or
`cache-control: public, max-age=31536000, immutable` on a `/_astro/*` chunk.

## Runbooks

### CI reformatted files on a push

Not a failure — the Format step applies `vp fmt` and the deploy continues, with a
warning naming how many files it rewrote. The deployed build is formatted; the
commit is not, so the next push reformats again. Run `npm run format` (or
`npm run check`, which formats first) and commit the result to stop the warning.
Markdown tables and long import lines are the usual culprits.

### Deploy failed on a missing secret

The check step names the missing secret. Add it under repository Settings →
Secrets and variables → Actions, then re-run the workflow. `PUBLIC_TURNSTILE_SITE_KEY`
is required even though it is public: the build refuses to ship an ungated form.

### Users see 503 or "Organisasi gagal dimuat" after a deploy

A 503 from a tenant endpoint means a provider read or write failed, or the
server is missing `APPWRITE_API_KEY`. Check the Cloudflare Function logs for the
endpoint's `console.error` line, then Appwrite's console for the table. If a new
column is missing, run the provisioning script for it.

### Sign-in succeeds but the next request is anonymous

The Appwrite session cookie was dropped. The proxy in
`functions/api/appwrite/[[path]].ts` should make it first-party. Check that the
browser calls `/api/appwrite` and not Appwrite's domain, and that the response
`Set-Cookie` has no `Domain` attribute. The OAuth start URL is the one call that
deliberately goes to Appwrite directly.

### Payment completed but the plan is not active

The payment row's `activationStatus` says where it stopped. `pending` with
`activationError` set means the organization write failed; the webhook or a
status read retries the fixed target every 15 seconds or on the next poll. Check
the `payment.paid.activation-failed` audit rows for the reason. Do not change
the plan by hand without reading the row: the target is frozen on the payment
row and manual edits can double an extension.

### DOKU checkout returns 503 with `retry-after`

The circuit breaker for DOKU is open after five consecutive provider failures.
It stays open for 30 seconds and then lets one probe through. Check DOKU's status
and the sandbox credentials. Counters are per isolate and are visible through
`GET /api/admin/quota`.

### Quota meter shows the wrong number or 503

The meter reads `/api/quota/invoices` for the active organization. A 503 means
the organization row or the invoice count could not be read; the builder then
refuses to claim a new allowance rather than inventing a zero. The count walks
at most 100 pages of 100 invoices.

### Logo or proof image does not load

Logo and proof URLs are `/api/logo/<key>` and `/api/proof/<key>`. A 404 means
the object is gone or the key was never written. Check the R2 bucket `notain`
and the row that references the key. Logos are replaced on each upload with a
new key, so a stale cached URL is not expected.

### An organization delete stopped partway

Repeat the request. The cascade resumes from what is left, and the payment
guard may answer 409 while a payment is still live. A 503 from the cascade means
a read or delete failed; retry once Appwrite is healthy.

### Admin screens show "Kamu bukan admin" for a known admin

The `admins` team membership is cached for up to 60 seconds per isolate, and
denials are cached too. Wait a minute, or confirm the account is a member of the
team `admins` in Appwrite.

### Email does not arrive

1. `GET {MAIL_SERVICE_URL}/healthz` — 200 means the service is up and its
   configuration parsed. A connection error means the domain is wrong, the
   function is not deployed, or its first cold start is still running.
2. Check `/api/mail/*` in the browser's network log. `503 unavailable` with
   "belum aktif" means `MAIL_SERVICE_URL` or `MAIL_SERVICE_TOKEN` is unset on the
   Pages project — set both as repository secrets and re-run the deploy workflow,
   which writes them to Pages; a 401 from the mailer means the two tokens differ.
3. `npx wrangler pages secret list` shows what the Pages project holds. To rotate,
   change `MAIL_SERVICE_TOKEN` on the function and in the repository secrets, then
   redeploy: the function restarts with the new value and the workflow pushes it
   to Pages.
4. The function's execution log in the Appwrite console shows one line per failed
   send (`send.failed`). A `502` there is the relay's answer, not Notain's: check
   the SMTP credentials, the sender domain's SPF/DKIM, and whether the relay has
   started rate-limiting the account. A connection error to `smtp.gmail.com` on
   port 465 means the host blocks SMTP egress — a Render free web service does
   exactly that.
5. For a reset link that "does nothing": confirm the row exists in
   `password_resets` (`byTokenHash`), that `expiresAt` is in the future, and that
   the link's host is the one the request came from — an https origin is required
   outside loopback.
6. Remember the limits: `password-reset` is 5/hour per IP (a shared office IP can
   exhaust it), `mail-welcome` 3/hour per user, `mail-nota` 30/hour per
   organization. They are per isolate, so a retry may succeed on another one.

## Monitoring

There is no external monitoring in the repository. What exists:

- Cloudflare Workers and Pages dashboards: request counts, errors, R2 usage.
- Appwrite console, organization Usage tab: reads, writes, bandwidth. This is
  the only authoritative measure of Appwrite Free quota; the API does not expose
  it.
- `GET /api/admin/quota` (admins only): per-isolate counters for rate-limit hits,
  retries, breaker trips and DOKU probes. It is labelled as a partial, per-isolate
  measurement.
- Structured log lines from `logQuota` (`{"t":"quota",…}`) and `console.error`
  calls in the Functions, visible in Cloudflare's Function logs.
- `POST /api/csp-report` logs every enforced CSP violation as one line.

## Provider limits

`functions/_lib/quota.ts` exports `PROVIDER_LIMITS`, verified against the
providers' published free plans on 2026-10-22. Read `quota.md` before changing
any limit: Cloudflare's Workers quota is shared with every Pages Function, and
R2 is the one service that bills automatically beyond its included amounts.

## Dependency hygiene

- `package-lock.json` is committed. CI installs with `npm ci`.
- `xlsx` is installed from a CDN tarball, not npm. Check the lockfile's integrity
  entry when it changes (`engineering/dependency-risk-register.md`).
- `vite` is overridden to `@voidzero-dev/vite-plus-core`. Upgrades to the
  toolchain are a deliberate event, not a routine bump.
- Node is pinned in `package.json` `engines` to 22.18+, 24.11+ or 26+.
