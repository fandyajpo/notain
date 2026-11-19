# System architecture

How Notain is put together: two runtimes, one layering rule, and the paths a
request can take. The reasoning behind individual decisions is in
`architecture/adr/` and `architecture/README.md`; this document is the map.

## The shape of the system

```text
Browser
  │  static HTML + islands (React, Vue, Svelte, Solid as custom elements)
  │
  ├─ /api/appwrite/*   → Pages Function: transparent relay to Appwrite (auth)
  ├─ /api/*            → Pages Functions: the application's server
  ├─ /invoice/<id>     → Pages Function: serves the edit shell
  ├─ /templates/<id>   → Pages Function: serves the editor shell
  ├─ /site/<orgId>     → Pages Function: serves the public-site shell
  └─ everything else   → Cloudflare Pages static assets (dist/)
```

Two runtimes, deliberately different:

- **Static assets (Cloudflare Pages).** Everything under `dist/` after
  `astro build`. Free and unmetered; the entire page surface lives here. There
  is no Astro adapter and no SSR.
- **Pages Functions (`functions/`).** Every `/api/*` route plus the three shell
  routes. They share the Workers Free quota (100k requests/day) with each other,
  not a separate allowance. They hold the only server secrets.

The consequence people trip over: `astro dev` serves only the static site.
Functions do not run there. `astro.config.mjs` proxies `/api` to the deployed
production site so logo calls work locally; `npm run dev:pages` is the way to
exercise local Function code.

## Layering inside `src/`

The dependency rule is one-directional: **core knows nothing, app knows core,
infra knows ports, components know app.**

- `src/core/**` — pure domain. Invoice model, schema, calculator, numbering,
  status machine, template layout rules, customer and catalog identity, money
  and date helpers, the HTML sanitizer, the business taxonomy, plan constants.
  No SDK, no React, no `import.meta`. Safe to bundle into a Worker (and some of
  it is — `functions/api/data/[resource].ts` imports the invoice schema
  directly).
- `src/ports/**` — repository interfaces (`AuthRepository`,
  `InvoiceRepository`, `AssetRepository`, …). Contracts only.
- `src/infra/**` — implementations. Appwrite repositories talk to
  `functions/api/data/*` rather than the Appwrite SDK for tenant data;
  `R2AssetRepository` calls `/api/logo`. `container.ts` is the composition root.
- `src/app/**` — use cases. Validation, session/org resolution, cross-repository
  orchestration, HTTP calls to `/api/*` with a minted JWT. Each module returns
  domain objects or throws `AppError`.
- `src/lib/**` — UI-adjacent utilities: query hooks and policies, draft storage,
  print handoff, Excel export, SEO metadata, nav definitions, toasts, tours.
- `src/components/**` — islands. React owns all state and every form; Vue,
  Svelte and Solid are three custom elements registered through
  `src/components/shared/use-ce-element.ts`.

Hard rule from `architecture/README.md`: a `.svelte`, `.vue` or Solid `.tsx`
file must never be imported by an `.astro` file or from outside
`src/components/`. Only the React adapters in
`src/components/react/invoice/` are touched by the app.

## The server layer

`functions/_lib/` holds every cross-cutting server concern:

- `http.ts` — `json()` with `cache-control: no-store` by default, `apiError()`
  with the shared error vocabulary, `fetchUpstream()` (10 s deadline, aliased
  as `fetch` so no call site can forget it), and the hardened image headers.
- `appwrite.ts` — `verifySession()`: JWT → `GET /account`, cached per isolate by
  SHA-256 of the token (default 60 s), single-flight keyed by the same hash.
  Also the Appwrite query-string builders.
- `rows.ts` — API-key REST helpers: `getRow`, `listRows`/`listRowsPage`,
  `createRow`, `patchRow`, `deleteRow`, `tableAuth`. Reads retry bounded
  exponential backoff; writes never retry. `null` means provider failure,
  never "no rows".
- `orgs.ts` — `requireOrg`, `requireOrgOwner`, `isValidOrgId`,
  `findMembership`, `listActiveMemberships`, `removeMembership`.
- `admin.ts` — `requireAdmin`, `isAdminUser`, `checkAdmin` (cached 60 s),
  `primaryOrgId`, `primaryOrgIds`.
- `quota.ts` — policy defaults and `QUOTA_*` overrides, sliding-window rate
  limiter, TTL cache, single-flight, circuit breaker, counters, `PROVIDER_LIMITS`.
- `invoice-quota.ts` — the free-tier allowance (org plan + monthly count).
- `payment-settle.ts` — the single settlement state machine.
- `proof-lock.ts` — per-invoice R2 lock with conditional writes (60 s lease).
- `audit.ts` — `writeAudit()`, never throws, never blocks the business write.
- `turnstile.ts` — siteverify with an explicit outcome union.
- `shell.ts` — `serveShell()` / `redirectTo()` for the static-shell routes.
- `types.ts` — minimal Workers typings (`Env`, `PagesFunction`, R2 surface),
  declared locally instead of pulling `@cloudflare/workers-types` into a DOM
  type-checking project.

## Request lifecycles

**Authenticated tenant read** (`GET /api/data/invoices?orgId=…`):

1. Client mints a JWT (`mintJwt()`, cached in memory, single-flight, cleared on
   account change) and sends `Authorization: Bearer`.
2. `requireOrg` validates the org id shape (400), verifies the session (401),
   requires server config (503), then reads the membership row
   `(orgId, userId, status=active)` (404 if absent). Membership lookups are
   deliberately **never** cached.
3. The handler builds a whitelisted Appwrite query from the request: equality,
   range, prefix, full-text search, order, cursor, projection, limit. Anything
   outside the per-resource whitelist is a 400.
4. `listRowsPage` calls Appwrite with the API key, bounded retries, 10 s
   deadline. Failure becomes 503, never an empty list.
5. The response goes through `json()` → `no-store`. The TanStack Query cache
   applies the per-key `staleTime` from `lib/query/policies.ts`.

**Authenticated write** (`POST/PATCH/DELETE /api/data/…`):

1. Same gate, plus the `data-write` rate fence keyed by user id (120/min).
2. Body is sanitized: forbidden keys dropped (`orgId`, `ownerId`, `plan`,
   `planExpiresAt`, `$id`, `$createdAt`, `$updatedAt`, `$permissions`), scalars
   only, 64k per string, 512 KB per body.
3. Invoices additionally run the shared Zod draft schema; new rows must be
   created with a `null` status; status patches go through `canChangeStatus`.
4. `orgId` and `ownerId` are stamped from the gate and the session, then the row
   is written with `permissions: []`.
5. `PATCH`/`DELETE` re-read the row and require its stored `orgId` to match the
   gated org, so a member of org A can never touch org B's row id.

**Public capability read** (`GET /api/invoice/<id>`, `GET /api/site/<orgId>`):

1. Per-IP rate fence first (`invoice-read` or `site`, 60/min).
2. The id must match one URL segment (`ID_SEGMENT_PATTERN`), otherwise 404.
3. The row is read with the API key; unknown and foreign both answer 404.
4. The invoice read additionally gates on the owning organization's plan
   (402 `plan_required`) unless the org's owner is an admin.
5. The response is a projection, not the row: internal ids, timestamps, plan
   data and raw R2 keys are removed; the logo becomes a `/api/logo/…` URL.

**Admin operation** (`/api/admin/*`):

1. `requireAdmin`: session → API-key config → `admins` team membership
   (cached 60 s per user; denials cached too).
2. The handler talks to Appwrite with the API key and writes an audit row for
   every mutation.
3. Where an admin acts on a user, `primaryOrgId` resolves *which* organization
   that user means (newest active membership), because nothing tenanted is
   user-keyed any more.

**Auth traffic** (`/api/appwrite/*`): a transparent relay. It strips hop-by-hop
headers, forwards `set-cookie` one value at a time with the `Domain` attribute
removed (making Appwrite's session cookie host-only for our origin), strips
upstream caching, and sets `no-store`. It adds no API key and makes no
authorization decision — see `auth-and-tenancy.md` for why this exists.

## Islands and framework boundaries

- Every page is static HTML. Interactivity mounts as an island.
- React owns state. `AppProviders` supplies the module-level `QueryClient`
  (`lib/query/shell-client.ts`) — one cache for shell islands and page islands
  alike, because a per-mount client would refetch org, session and profile on
  every soft navigation and would split invalidation.
- Vue (`Picker.vue`), Svelte (`ItemsGrid.svelte`) and Solid (`CalcInspector.tsx`)
  are registered as custom elements by `src/components/custom-elements.ts` and
  loaded only where they are used. Their registration modules are dynamically
  imported so three extra runtimes stay off the invoice routes' critical path.
- Data crosses the boundary as JSON props passed in a layout effect, and events
  come back as `CustomEvent`s — ADR 0005 explains why a layout effect rather
  than a render-time assignment.
- Islands use light DOM, not shadow roots (ADR 0004), so Tailwind and
  print styles apply.

## Routing

Static pages built by Astro (`src/pages/**`):

- Marketing: `/`, `/pricing`, `/blog`, `/contact`, `/developers`, `/privacy`,
  `/terms`, plus eight industry pages generated from
  `src/core/seo/industries.ts` (`/katering`, `/desainer`, `/developer`,
  `/warung`, `/online-shop`, `/freelancer`, `/jasa-servis`, `/salon`).
- Auth: `/login`, `/register`, `/forgot-password`, `/reset-password`,
  `/auth/callback`.
- App: `/dashboard`, `/invoices`, `/customers`, `/catalog`, `/templates`,
  `/templates/new`, `/invoice/new`, `/invoice/print`, `/settings`,
  `/settings/organization`, `/billing`, `/checkout`, `/payment/result`,
  `/api-keys`, `/site`, `/probes` (framework-boundary harness).
- Admin: `/admin/users`, `/admin/content`, `/admin/support`, `/admin/audit`.
  `/admin` is a static redirect to `/admin/users`.
- `404`.

Function-served shells and redirects:

- `GET /invoice/<id>` → serves `dist/invoice/edit/` with the URL untouched.
- `GET /invoice/print/<id>` → serves `dist/invoice/print/`.
- `GET /invoice/edit?id=…` → 302 to `/invoice/<id>` (canonicalisation only).
- `GET /templates/<id>` → serves `dist/templates/new/`.
- `GET /templates/edit[?id|from]` → 302 to `/templates/<id>` or
  `/templates/new`.
- `GET /site/<orgId>` → serves `dist/site/`.

`astro.config.mjs` contains a dev-only middleware that mirrors all of it,
because Node ESM cannot import the TypeScript shared with the Functions.
`e2e/edit-routes.spec.ts` is what keeps the two halves in step. The rules
themselves live in `src/lib/edit-route.ts`.

## Client state

- **One `QueryClient`**, created by `createQueryClient()` and cached in
  `lib/query/shell-client.ts`. Retries: network and unknown only, two attempts,
  exponential backoff with half jitter. Mutations never retry.
- **Query keys** are a factory (`lib/query/keys.ts`) so invalidation is
  structural: `['invoices', search, limit, status, templateId]`,
  `['invoice-quota']` as a prefix with the org id appended,
  `['dashboard-finance', from, to]`, and so on.
- **Policies** (`lib/query/policies.ts`) declare `staleTime`/`gcTime` per
  datatype with the reasoning inline: session infinite, customers and catalog
  5 s because every invoice save writes them, templates 5 min, admin 60 s.
- **Active organization** (`src/app/active-org.ts`) is a module store with a
  monotonic generation counter, persisted in `localStorage` under
  `notain.activeOrgId`. Repositories read it at call time; React subscribes via
  `useSyncExternalStore`.
- **Org switch** is a transaction-like sequence: `app/org-switch.ts` flags the
  target, `OrgGate` renders a blocking overlay, per-org queries are reset
  (`resetQueries`, not `clear()`, so live observers refetch), and the overlay
  clears only when the target is validated and no fetch is in flight (450 ms
  minimum, 8 s cap). A failed switch restores the previous org.
- **Mutations carry their tenant**: `lib/query/org-mutation.ts` captures the org
  id and generation when a mutation starts and refuses to send or resume if
  either changed, so a late mutation can never write into a newly selected org.
- **Session expiry** funnels through `createSessionExpiryHandler`: 401 → verify
  the session is really gone → clear caches → toast → `/login?next=…`. A 401
  that leaves the session intact is left to the caller, which prevents the
  classic missing-table `/page ↔ /login` loop.
- **Local storage** is scoped per account: drafts under
  `notain:draft:<ownerId>:<invoiceId|new>`; the print handoff uses
  `sessionStorage` (`notain:print`), which a new same-origin tab inherits.

## Build and delivery

`npm run build` is four steps, in order:

1. `astro build` → `dist/`.
2. `scripts/modulepreload.mjs` — injects `<link rel="modulepreload">` for each
   page's island dependency graph. Running `astro build` alone silently loses
   these links, which is why the npm script is the only supported build.
3. `scripts/sitemap.mjs` — writes the sitemap from the same allowlist the page
   metadata uses (`src/lib/seo.ts`).
4. `scripts/csp-hashes.mjs` — stamps the inline island runtime's SHA-256 hashes
   into `public/_headers` so the enforcing CSP needs no `unsafe-inline` for
   scripts.

`public/_headers` adds long-lived immutable caching for `/_astro/*`, keeps HTML
revalidatable so deploys go live immediately, and ships the security headers
(HSTS, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`,
`Permissions-Policy`, CSP with `report-uri /api/csp-report`).

Deployment is GitHub Actions on push to `main`: format check → tests →
typecheck → build → `wrangler pages deploy dist --branch main`. Cloudflare's own
auto-build is switched off, so Actions is the only deploy path. Details and the
required secrets are in `operations.md`.

## Invariants worth remembering

- A tenant table is never read or written from the browser SDK. Tenant data goes
  through `/api/data/*`; organizations and memberships through `/api/orgs*`;
  profiles through `/api/profile*`.
- The browser never supplies an authority. `orgId` is a hint, `ownerId` is
  stamped, plan columns are never writable from a request body.
- Provider failure is never rendered as empty data. Every helper distinguishes
  `null` (outage) from `[]` (no rows), and endpoints map the former to 503.
- Mutations are not retried client-side, and writes are not retried
  server-side. Reads are.
- Every outbound provider call has a deadline (10 s by default, 20 s for the
  DOKU order creation).
