# API reference

Every server route Notain exposes: Pages Functions under `functions/`, plus the
three shell routes that serve built pages under dynamic URLs.

Conventions used throughout:

- **Gate** names the check that runs before any work: `session` (JWT →
  `GET /account`), `requireOrg` (session plus an active membership row),
  `requireOrgOwner` (plus `role === 'owner'`), `requireAdmin` (plus `admins`
  team membership), or `public` (no session).
- **Auth** is usually the caller's Appwrite JWT as `Authorization: Bearer …`,
  minted in the browser by `mintJwt()`. The Appwrite proxy, the capability-URL
  reads, the public forms (support, turnstile, csp-report) and both
  password-reset routes accept no bearer — each for a reason stated at the
  route.
- **Errors** are `{ error, message }` with `error` from a fixed vocabulary:
  `unauthenticated`, `forbidden`, `not_found`, `validation`, `conflict`,
  `method_not_allowed`, `plan_required`, `rate_limited`, `unavailable`.
- **Caching** — `json()` sets `cache-control: no-store` by default and every
  endpoint relies on it; image routes set their own immutable caching.
- **Deadlines** — every outbound provider call is bounded (10 s default, 20 s
  for DOKU order creation).
- **Rate limits** are per isolate and keyed either by `cf-connecting-ip` or by
  user id. The buckets are `support` 5/h, `proof-upload` 6/h,
  `proof-upload-owner` 30/h, `logo-upload` 10/h, `checkout` 10/h, `org-create`
  10/h, `org-invite` 30/h, `data-write` 120/min, `invoice-quota` 60/min,
  `invoice-read` 60/min, `site` 60/min, `mail-welcome` 3/h, `mail-nota` 30/h,
  `password-reset` 5/h, `password-reset-address` 3/h, `turnstile` 30/min and
  `csp-report` 30/min. Each has a `QUOTA_LIMIT_*` override. See `quota.md` and
  `functions/_lib/quota.ts`.

## Route map

```text
/api/appwrite/*                 relay to Appwrite (auth only)
/api/data/<resource>            tenant CRUD: invoices, customers, catalog, templates, stats
/api/orgs                       list + create
/api/orgs/<id>                  read + patch + cascade delete
/api/orgs/<id>/members          list + invite (disabled)
/api/orgs/<id>/members/<mid>    remove / leave
/api/orgs/accept                sweep pending invitations
/api/profile                    org-scoped profile row (legacy letterhead)
/api/profile/user               account identity
/api/quota/invoices             free-tier allowance (read + claim)
/api/mail/welcome                greeting after sign-up (session)
/api/mail/password-reset         request a reset link (anonymous)
/api/mail/password-reset/confirm  redeem the token and set the password (anonymous)
/api/mail/nota                   mail one invoice to its customer
/api/invoice/<id>               public invoice payload
/api/invoice/<id>/proof         payment-proof upload (customer or owner)
/api/proof/<key>                payment-proof bytes + owner delete
/api/site/<orgId>               public business page payload
/api/logo                       logo upload
/api/logo/<key>                 logo bytes + owner delete
/api/payments/checkout          start a DOKU order
/api/payments/doku-notify       signed DOKU webhook
/api/payments/status            order status + reconciliation
/api/payments/portal            subscription + history
/api/admin/users                list + patch users
/api/admin/users/<id>           drill-down + suspend
/api/admin/content              admin editing of invoices/templates
/api/admin/support              support queue + solve/reopen
/api/admin/audit                audit log
/api/admin/quota                quota policy + isolate snapshot
/api/me/admin                   am I an admin?
/api/support                    public contact form
/api/turnstile                  siteverify for the widget
/api/csp-report                 CSP violation sink
/invoice/<id>                   shell: invoice editor
/invoice/print/<id>             shell: print view
/templates/<id>                 shell: template editor
/site/<orgId>                   shell: public business page
```

---

## Auth-adjacent

### `ALL /api/appwrite/*` — Appwrite relay

`functions/api/appwrite/[[path]].ts`

- **Gate:** none. It is a transparent relay, not an authorization layer.
- **Purpose:** keep Appwrite's session cookie first-party. Appwrite scopes its
  cookie to `*.cloud.appwrite.io`; from our origin that is a third-party cookie
  and Brave, Safari and Firefox drop it, producing a sign-in that "works" and an
  immediately anonymous next request.
- **Behaviour:** strips hop-by-hop headers, `origin`, `referer`,
  `accept-encoding`, `cf-*` and `x-forwarded-*`; buffers the body; relays the
  status; re-appends every `set-cookie` individually with the `Domain`
  attribute removed (host-only), preserving `HttpOnly`, `Secure`, `SameSite`,
  path and expiry; forces `no-store`; follows redirects manually so the OAuth
  hop reaches the browser.
- **Errors:** `502 unavailable` when Appwrite cannot be reached.

### `GET /api/me/admin`

`functions/api/me/admin.ts`

- **Gate:** session.
- **Purpose:** tell the sidebar whether to show the admin group without leaking
  the operator team's existence.
- **Output:** `{ isAdmin: boolean }`. Always 200 for a signed-in caller.
- **Behaviour:** asks Appwrite with the caller's own JWT first; falls back to the
  API-key check (`isAdminUser`). Deliberately bypasses the `checkAdmin` cache so
  a JWT-shaped denial cannot poison the fallback.
- **Errors:** `401 unauthenticated`.

---

## Email

Four routes, one delivery service. None of them sends SMTP itself: each builds a
validated payload and hands it to `mailer/` over HTTPS
(`MAIL_SERVICE_URL`, bearer `MAIL_SERVICE_TOKEN`), because the email library is a
native Node addon that cannot load in a Worker. See `features/email.md` for the
architecture, the templates and the reset-token design.

Two conventions differ from the rest of this reference:

- `sendMail()` **never throws**. A relay failure becomes `'failed'` and the
  endpoint decides: 503 where a person asked for the mail, silence where nobody
  did (the welcome message).
- Every route answers 503 `unavailable` when `MAIL_SERVICE_URL` or
  `MAIL_SERVICE_TOKEN` is unset. Nothing else in the app depends on them.

### `POST /api/mail/welcome`

`functions/api/mail/welcome.ts`

- **Gate:** session.
- **Input:** none. The address is taken from the verified session, so this cannot
  be pointed at a third party.
- **Limit:** `mail-welcome`, 3/hour per user id.
- **Side effects:** one mail. No row is written.
- **Output:** `202 { ok: true }`.
- **Errors:** `401 unauthenticated`, `400 validation` (account without an email),
  `429 rate_limited`, `503 unavailable` (mailer unset or refused).
- **Client:** `sendWelcomeEmail()` after a successful sign-up, fire-and-forget.

### `POST /api/mail/password-reset`

`functions/api/mail/password-reset.ts`

- **Gate:** none — a locked-out user has no session.
- **Input:** `{ email }`.
- **Limits:** `password-reset` 5/hour per IP (a real 429); the per-address fence
  (3/hour, keyed by a hash) is silent.
- **Side effects:** one `password_resets` row (created, or patched over the
  account's existing one so only the newest link works) and one mail carrying
  `<origin>/reset-password?token=<64 hex>`. Only the token's SHA-256 is stored.
- **Output:** `204` for **every** outcome — unknown address, over-limit address,
  provider failure, mailer failure. That is the anti-enumeration contract; only
  the inbox can prove an address is registered.
- **Errors:** `400 validation` (malformed email or body), `429 rate_limited` (IP
  fence only), `503 unavailable` (server config missing).
- **Notes:** the link origin comes from `Origin` (falling back to the request
  URL) and must be https outside loopback.

### `POST /api/mail/password-reset/confirm`

`functions/api/mail/password-reset/confirm.ts`

- **Gate:** none; the token is the credential.
- **Input:** `{ token, password }`.
- **Limit:** `password-reset` 5/hour per IP.
- **Validation:** `passwordSchema` from `src/core/auth/schema.ts` — the same rule
  the sign-up and reset forms use.
- **Side effects:** `PATCH /users/<id>/password` with the API key, the token row
  deleted (single use), then every session of that account ended (best effort).
- **Output:** `204`.
- **Errors:** `400 validation` — one shared message for a wrong, spent or expired
  token, or the schema's own copy for a weak password; `503 unavailable` when
  Appwrite refuses the write (so an outage never burns the link).

### `POST /api/mail/nota`

`functions/api/mail/nota.ts`

- **Gate:** session + an active membership row in the invoice's organization.
  A missing id and a foreign id both answer `404 not_found`, in that order.
- **Plan gate:** active paid plan, or the organization's owner is an admin —
  the same rule as `GET /api/invoice/<id>`, because the email carries that link.
- **Input:** `{ invoiceId, to?, note? }`. `to` falls back to the invoice's
  `customerEmail`.
- **Limit:** `mail-nota`, 30/hour per organization.
- **Side effects:** one mail (number, dates, total, note, capability link) and —
  only when the invoice's status is unset — a write to `status = 'sent'`.
  `paid` and `void` are never touched.
- **Output:** `200 { ok: true, to, status }`.
- **Errors:** `400 validation` (no usable recipient), `401 unauthenticated`,
  `402 plan_required` (Free or expired), `404 not_found`, `429 rate_limited`,
  `503 unavailable` (mailer unset, relay refused, organization unreadable).
- **Client:** `EmailNotaDialog` in the invoice builder; it invalidates the
  invoice, all invoice lists and every dashboard finance period on success.

---

## Tenant data

### `GET|POST|PATCH|DELETE /api/data/<resource>`

`functions/api/data/[resource].ts` — the single write path for tenant data.

- **Resources and limits:** `invoices` (max 100 rows/page, default order `date`
  desc then `$createdAt` desc), `customers` (100, `name` asc), `catalog` (100,
  `name` asc), `templates` (50, `name` asc), `stats` (5, one row per org).
- **Gate:** `requireOrg`. The `orgId` query value is a hint; the membership row
  decides.
- **GET, list:** query parameters are whitelisted per resource:
  - `limit` (capped at the resource max), `cursorAfter=$id` (keyset paging),
  - `select=a,b,c` (projection; system attributes ride along),
  - `eq_<field>=v` — `invoices`: `status`, `templateId`; `customers` and
    `catalog`: `name`; others none. `''` is a real value (the unset invoice
    status), not an absence,
  - `gte_<field>` / `lte_<field>` — `invoices.date` only (the finance window),
  - `starts_<field>=v` — `invoices.invoiceNumber` only,
  - `search=term` — full text across `invoiceNumber`, `customerName`, `items`
    (invoices), or `name`; ignored below 3 characters,
  - `orderAsc=`/`orderDesc=` — only `date`, `$createdAt`, `name` where declared.
- **GET, single row:** `?rowId=…`. The row must exist _and_ carry the gated
  `orgId`; otherwise `404 not_found` (foreign and missing are indistinguishable).
- **POST:** body `{ data, rowId? }`.
  - `rowId` is optional and validated against `/^[A-Za-z0-9_-]{1,64}$/`; the
    stats resource forces `rowId = orgId`.
  - `data` is sanitized: forbidden keys are dropped (`orgId`, `ownerId`, `plan`,
    `planExpiresAt`, `$id`, `$createdAt`, `$updatedAt`, `$permissions`), strings
    are capped at 65,536 characters, the JSON body at 512 KB, and only scalars,
    arrays and plain objects survive.
  - Invoices additionally must contain the required columns, must pass
    `invoiceDraftSchema`, and must have `status === null`; unknown columns are
    rejected. `items`/`details` are serialized to JSON, `status` to `''`.
  - `orgId` and `ownerId` are stamped from the gate and session.
  - A refused create with a client-supplied id re-reads the row: if it exists in
    this org → `409 conflict` with a resource-specific message, else
    `503 unavailable`.
- **POST `?action=bulk-delete`:** body `{ ids }`, 1–20 ids. Foreign and missing
  ids are skipped, never errored. Returns `{ deleted, requested }`.
- **PATCH:** `?rowId=…`, body `{ data }`. Re-reads the row and requires the
  stored `orgId` to match. For invoices, the merged row is re-validated and a
  `status` change must pass `canChangeStatus`; a refused transition is
  `409 conflict` with the user-facing reason. Returns `{ row }` (the re-read,
  stored row).
- **DELETE:** `?rowId=…`. Already gone answers `200 { ok: true }`; a foreign row
  answers 404; a refused delete is 503.
- **Rate limit:** `data-write`, 120/min, keyed by user id — POST, PATCH and
  DELETE only. GETs are unfenced (see `security.md`, accepted risks).
- **Common errors:** `400 validation` (bad resource, bad id, bad body, bad
  column, schema failure, invalid status), `401 unauthenticated`,
  `404 not_found`, `405 method_not_allowed` (with `allow`),
  `409 conflict`, `429 rate_limited` (with `retry-after`), `503 unavailable`
  (provider read/write failure; never an empty list).

---

## Organizations and membership

### `GET /api/orgs`

`functions/api/orgs.ts`

- **Gate:** session.
- **Output:** `{ orgs: OrgView[], pending: PendingInvite[] }`.
- **OrgView:** `id`, `name`, `role`, `isOwner`, `plan`, `active` (plan currently
  valid), `businessType` (validated slug or null), `slug`, `email`, `phone`,
  `website`, `address`, `taxId`, `logoFileId`.
- **Behaviour:** active memberships (max 100, newest first) plus pending rows
  addressed to the caller's lowercased email (max 50). Referenced organizations
  are read in batched `equal($id, [ids])` queries of up to 100 ids; if that read
  fails it falls back to per-id reads so one unreachable page degrades to "some
  orgs missing", never "no orgs". Organizations deleted under a stale membership
  are skipped.
- **Errors:** `401`, `503`.

### `POST /api/orgs`

- **Gate:** session, then the plan gate.
- **Body:** `{ name }`, trimmed, 1–128 characters.
- **Rules:** the first organization a user _owns_ is always allowed. Creating
  another requires an active paid plan on at least one organization the caller
  owns; otherwise `403 forbidden` with the upgrade copy. Admins skip the gate.
- **Writes:** an `organizations` row (`org_…`, `slug`, empty contact block,
  `plan: 'free'`, `businessType: null`), then the owner `memberships` row. If the
  membership write fails the org row is deleted; if that compensation also fails
  an `org.create.compensation-failed` audit row records the orphan.
- **Rate limit:** `org-create`, 10/hour per user.
- **Output:** `201 { org: OrgView }`.

### `GET /api/orgs/<id>`

- **Gate:** `requireOrgOwner`. Members see the org through `/api/orgs`; this
  owner-only read exists so the contact editor does not need a second shape.
- **Output:** `id`, `name`, `slug`, `email`, `phone`, `website`, `address`,
  `taxId`, `logoFileId`, `businessType` — empty strings normalised to null.

### `PATCH /api/orgs/<id>`

- **Gate:** `requireOrgOwner`.
- **Body:** any of `name`, `businessType`, `email`, `phone`, `website`,
  `address`, `taxId`. Absent key = untouched; `null` or `''` = clear.
- **Validation:** name 1–128; `businessType` must be a slug the taxonomy still
  knows or `null`; contact lengths are capped per field (email 320, phone 32,
  website 320, address 512, taxId 64); email shape; phone must match the
  Indonesian mobile pattern.
- **Side effects:** audit row `org.update` with the changed columns.
- **Errors:** `400`, `403`, `404`, `500 unavailable` on a refused write.

### `DELETE /api/orgs/<id>` — budgeted cascade

- **Gate:** `requireOrgOwner`, with a documented continuation path: once the
  memberships are gone, the caller is authorised by `org.ownerId === session`.
  A missing org answers `200 { done: true }`, which terminates the client loop.
- **Payment guard:** `409 conflict` while any payment row is `pending` and not
  yet expired, or is `paid` with `activationStatus: 'pending'`. A payment table
  too large to verify (more than 1000 rows) answers `503` instead of guessing.
- **Cascade, in order:** `memberships` → `invoices` → `customers` → `catalog` →
  `templates` → `stats` → `payments` → `audit_logs` (all filtered by `orgId`),
  then the legacy `profiles/<orgId>` and its logo, then the org logo, then the
  org row itself — last, because the continuation authorises against it.
- **Budget:** 30 deletions per invocation (Cloudflare Free's subrequest ceiling).
  The response is `{ done: false }` until everything is gone; a failed read or
  delete answers `503 unavailable` and the next call resumes.
- **Client loop:** `deleteOrgCascade` in `src/app/orgs.ts`, bounded at 200
  rounds.
- **Never deleted:** `profiles/<userId>` and the Appwrite account.
- **Audit:** `org.delete` when the root row is removed.

### `GET /api/orgs/<id>/members`

- **Gate:** `requireOrg` (any member).
- **Output:** `{ members: [{ id, email, role, status, isOwner, isMe }] }`,
  owner first, then newest join.
- **Note:** `email` is the membership's `inviteEmail`. The owner's login address
  is copied there when the org is created, so it is the same value.

### `POST /api/orgs/<id>/members`

- **Gate:** `requireOrgOwner`, then **always** `503 unavailable`:
  "Fitur undangan anggota belum tersedia…". The invitation email is not wired
  up, so the endpoint refuses rather than stranding a pending row nobody is
  told about. The response shape (`{ invite }`) exists for the day it lands.

### `DELETE /api/orgs/<id>/members/<membershipId>`

- **Gate:** `requireOrg`.
- **Rules:** the row must belong to the org (else 404). The owner can never be
  removed, including by themselves (`409`). A non-owner may remove only
  themselves (`403`). A pending invitation may be withdrawn only by the owner.
- **Effect:** deleting the row is the access-revocation moment; the removed
  member's next Function call answers 404 because membership is never cached.
- **Audit:** `org.member.remove`, `org.leave` or `org.invite.revoke`.
- **Output:** `{ ok: true, left }`.

### `POST /api/orgs/accept`

- **Gate:** session.
- **Behaviour:** every `pending` membership whose `inviteEmail` equals the
  caller's lowercased email becomes `active` with their `userId` (max 50, one
  sequential patch each). Called on every authenticated load by `OrgGate`, so an
  invited address lands in the org on its first visit, including right after
  registration.
- **Output:** `{ accepted: string[] }` (org ids that flipped; usually empty).

---

## Profiles

### `GET|PUT /api/profile?orgId=…`

`functions/api/profile.ts`

- **Gate:** `requireOrg`.
- **GET:** the org's personal/letterhead columns — `name`, `phone`, `address`,
  `email`, `logoFileId` — plus `plan` and `planExpiresAt` **projected from the
  organization row**. When the legacy row is missing, the view is synthesized
  from the organization row so old readers do not 404.
- **PUT:** body validated by `profileSchema` minus the plan fields; the writable
  whitelist is `name`, `phone`, `address`, `email`, `logoFileId`. Everything
  else in the body (including `plan`) is dropped. Creates the row at `free` if
  absent; otherwise patches.
- **Why the endpoint exists:** Appwrite grants no per-column permissions, so a
  session able to write the row could write `plan`. Writes therefore happen with
  the API key behind a column whitelist.
- **Errors:** `400`, `401`, `404`, `405`, `500 validation` on a refused write.

### `GET|PUT /api/profile/user`

`functions/api/profile/user.ts`

- **Gate:** session only. This is the account identity, shared across every
  organization, and it must keep working when the account has zero orgs.
- **GET:** `{ username, phone }`. On the first authenticated visit it creates
  `profiles/<userId>`, seeding the name from a legacy org profile or the
  Appwrite account name; if two tabs race the create, the loser re-reads the
  winner's row.
- **PUT:** body may contain `username` (≤128) and/or `phone` (Indonesian mobile
  pattern, ≤32). Strings only — no implicit `String()`. An unchanged pair is a
  200 no-op.
- **Side effect:** the username is mirrored onto the Appwrite account `name`
  best-effort; failure is logged and does not fail the save.
- **Never writable here:** the login email.

---

## Quota

### `GET|POST /api/quota/invoices?orgId=…`

`functions/api/quota/invoices.ts`

- **Gate:** `requireOrg`.
- **Response shape:** `{ remaining: number | null, used, limit, resetsAt }`.
  `remaining: null` means unlimited (paid plan or admin).
- **GET:** the meter's number. Paid organizations skip the count walk entirely.
- **POST:** the "claim" asked immediately before creating a _new_ invoice.
  `200 { ok: true, quota }` when there is room; `402 plan_required` with
  `INVOICE_QUOTA_MESSAGE` and the quota when the month is spent.
- **Counting:** invoices whose `$createdAt` falls in the current calendar month
  (local time), per organization, up to 100 pages of 100 rows with only
  `date`/`$createdAt` selected. Free histories are bounded by the allowance.
- **Admins:** receive `remaining: null` with a truthful `used`/`resetsAt`.
- **Failures:** an unreadable organization row or count answers `503`, never a
  fabricated zero.
- **Rate limit:** `invoice-quota`, 60/min per user.

---

## Public capability reads

### `GET /api/invoice/<id>`

`functions/api/invoice/[id].ts`

- **Gate:** public, with a per-IP `invoice-read` fence (60/min) before any read,
  and a plan gate: the invoice's organization must have an active paid plan,
  **or** the organization's owner must be an admin. Otherwise `402 plan_required`
  with actionable copy.
- **Validation:** the id must match one URL segment; otherwise 404.
- **Output:** `{ invoice, business, template }`.
  - `invoice` — the domain draft plus `id` and `paymentProof`, minus `ownerId`,
    `orgId`, `createdAt` and `updatedAt`.
  - `business` — `name`, `businessName`, `phone`, `address`, `email`,
    `businessType`, `logoUrl`. Plan fields and raw R2 keys are removed; the
    organization row is the source of truth, the legacy profile row a fallback.
  - `template` — the referenced template, or `null` (the client falls back to a
    built-in).
- **Errors:** `404 not_found`, `402 plan_required`, `429 rate_limited`,
  `500 validation` if server config is incomplete, `405` for non-GET.
- **Never cached:** `no-store` even though it is a read, because status and
  proofs change underneath the URL.

### `GET /api/site/<orgId>`

`functions/api/site/[id].ts`

- **Gate:** public, `site` fence 60/min per IP.
- **Output:** `{ site, items }`.
  - `site` — `businessName`, `ownerName`, optional `phone`, `address`, `email`,
    `logoUrl`, `businessType`.
  - `items` — up to 100 catalog rows projected to `name`, `kind`, `unit`,
    `unitPrice`, sorted by name, blank names dropped.
- **Rules:** a missing organization or an organization with a blank name is
  `404`; a provider outage is `503`; an empty catalog is a valid page. The
  public email is the organization's own — never the owner's login address. Plan
  data and raw object ids never appear.

### `GET /api/proof/<key>`

`functions/api/proof/[key].ts`

- **Gate:** public capability (keys carry 56 bits of randomness and are never
  listed). The key must start with `proofs_`.
- **Output:** the bytes, with `nosniff`, `cross-origin-resource-policy:
  same-origin`, `content-security-policy: default-src 'none'; style-src
  'unsafe-inline'; sandbox`, and immutable caching.

### `DELETE /api/proof/<key>`

- **Gate:** session plus `customMetadata.owner === session.userId` (else 404).
- **Behaviour:** takes the per-invoice R2 lock, re-checks ownership under it,
  clears the invoice pointer **first** and only then deletes the object, so the
  row never points at a deleted proof. A failed pointer clear answers 503 and
  keeps the object.

### `GET /api/logo/<key>`

- **Gate:** public capability. Serves the object with the same hardened headers
  and immutable caching.

### `DELETE /api/logo/<key>`

- **Gate:** session plus owner metadata match (else 404). Returns 204.

---

## Uploads

### `POST /api/logo`

`functions/api/logo.ts`

- **Gate:** session.
- **Body:** multipart `file`.
- **Validation:** extension allowlist png, jpg, jpeg, svg, webp, ico; 2 MB
  ceiling (checked from `content-length` first, then the actual size); the
  content type is derived from the extension, never from `File.type`.
- **Key:** `logos_<userId>_<14 hex>.<ext>`, `customMetadata.owner = userId`.
- **Rate limit:** `logo-upload`, 10/hour per user.
- **Output:** `{ fileId }`.
- **Errors:** `400` (no file, bad format), `401`, `413` (too large), `429`.

### `POST /api/invoice/<id>/proof`

`functions/api/invoice/[id]/proof.ts`

- **Gate:** two modes, chosen by whether an `Authorization` header is present.
  - **Customer (public):** Turnstile must pass (an unconfigured secret is a 500,
    not a pass); the invoice must not be `paid` or `void` (409); no
    `paymentProofKey` may already exist (409).
  - **Owner (session):** the JWT must resolve and the invoice's `ownerId` must
    equal it (403); no status gate and no one-shot rule, so the owner can replace
    a proof at any time.
- **Validation:** multipart `file`, jpeg/png/webp by extension, 5 MB, request
  body capped at 5 MB + 64 KB.
- **Concurrency:** a per-invoice R2 lock (conditional writes, 60 s lease) makes
  the one-shot check and the pointer write serial across isolates; a busy lock is
  `409`.
- **Order of writes:** object first, then the row; a failed row write deletes the
  object. An owner replacement deletes the superseded object only after the row
  points at the new key.
- **Output:** `{ key, uploadedAt, url }`.
- **Rate limits:** `proof-upload` 6/hour per IP for customers,
  `proof-upload-owner` 30/hour per user for owners.

---

## Payments

### `POST /api/payments/checkout`

`functions/api/payments/checkout.ts`

- **Gate:** `requireOrgOwner`. Billing is an organization-level decision.
- **Body:** `{ plan, orgId }` — plan id only. `free` is not purchasable;
  `business` is refused with `400` because it is announced but not sold.
  The amount is looked up in `PAID_PLANS`, never taken from the request.
- **Order of work:** rate fence (`checkout`, 10/hour per user) → circuit breaker
  → read org + letterhead → downgrade guard (`409` if an active plan outranks
  the target) → reuse or retire an existing pending row → create the payment row
  **before** calling DOKU → create the DOKU order (20 s deadline) → store the
  checkout URL.
- **Duplicate guard, two layers:** a query for one pending row per org+plan with
  an in-flight grace period (2 min), and the atomic backstop — the row id is
  `deterministicInvoiceNumber(plan, orgId, month)`, so concurrent checkouts
  derive the same id and Appwrite's unique-id 409 picks the winner. The loser
  reuses the winner's URL or stands down; a non-pending occupant falls back to a
  random id, which keeps renewals in a disjoint space.
- **Frozen baseline:** `planAtCheckout` and `planExpiresAtSnapshot` are written
  at checkout so settlement's expiry math cannot be moved by a racing write.
- **Output:** `200 { url }` — the hosted DOKU page.
- **Errors:** `400` (bad plan), `401`, `403`, `404`, `409`, `429` (with
  `retry-after`), `500` (unconfigured server), `502` (DOKU unreachable or
  rejected), `503` (breaker open, with `retry-after`).
- **Audit:** `payment.checkout.failed` with the provider status and detail.

### `POST /api/payments/doku-notify`

`functions/api/payments/doku-notify.ts`

- **Gate:** DOKU's HMAC-SHA256 signature over `Client-Id`, `Request-Id`,
  `Request-Timestamp`, `Request-Target` (this path) and `Digest` (SHA-256 of the
  exact body bytes). No session.
- **Behaviour:** verify → parse non-strictly → `singleFlight('settle:<invoice>')`
  → `settlePayment`. Always answers 2xx once the signature is valid, even when
  nothing was applied (`{ received: true, applied: false, reason }`), because
  DOKU retries and business outcomes are not delivery failures.
- **Errors:** `401` invalid signature, `400` unparsable JSON, `500`
  unconfigured server.

### `GET /api/payments/status?invoice=…`

`functions/api/payments/status.ts`

- **Gate:** session; the row's `ownerId` must match (`404` otherwise, for both
  "missing" and "not yours").
- **Purpose:** the `/payment/result` poll. Returns our own row: `invoiceNumber`,
  `plan`, `amount`, `currency`, `status`, `paidAt`, `expiresAt` (the DOKU page
  expiry), `activationStatus`, `activationError`.
- **Reconciliation:** while the row is `pending`, the endpoint may ask DOKU's
  Check Status API and settle from that answer. It only leaves inside a 5 s
  window every 15 s after the order is at least 60 s old (DOKU's own advice),
  honours the circuit breaker, dedups concurrent polls with `singleFlight`, and
  applies a reply only when it names this invoice. When the row is `paid` but
  activation is not `active`, a status read retries the frozen activation
  target without calling DOKU.
- **Never an error for a provider failure:** the caller just sees the row as it
  stands and the next poll retries.

### `GET /api/payments/portal?orgId=…`

`functions/api/payments/portal.ts`

- **Gate:** `requireOrg`. Strictly a read.
- **Output:** `{ plan, planExpiresAt, active, payments[] }` — plan from the
  organization row, the last 10 orders for this org, each with
  `invoiceNumber`, `plan`, `amount`, `currency`, `status`, `activationStatus`,
  `paidAt`, `createdAt`, and a `resumeUrl` only for a still-payable pending
  order.
- **Defensive filtering:** rows are re-filtered by `orgId` in the handler
  because the API key bypasses row permissions.

---

## Admin

All admin routes call `requireAdmin` first: a real session, complete server
config (else `500`), and membership in the Appwrite `admins` team (cached 60 s;
denials cached too). A signed-in non-admin gets `403 forbidden` — deliberately
not `unauthenticated`, which the client treats as a session expiry.

### `GET|PATCH /api/admin/users`

`functions/api/admin/users.ts`

- **GET:** `?limit=` (1–50, default 25), `?cursorAfter=<userId>`. Returns
  `{ users, total, nextCursor }`. Each entry joins the Appwrite account with the
  user's **primary organization** (newest active membership, resolved in one
  batched query): `userId`, `email`, `createdAt`, `status` (false = blocked),
  `name`, `businessName`, `phone`, `address`, `profileEmail`, `businessType`,
  `plan`, `planExpiresAt`. An account with no organization reads as `free` with
  empty fields.
- **PATCH:** body `{ userId, name, businessName?, phone?, address?, email?,
  plan, planExpiresAt? }`. The profile half is a full replacement; the plan half
  is written to `organizations/<orgId>`. Requires an organization (`404`
  otherwise). Rows are snapshotted before the first write and the profile half
  is rolled back if the organization write fails — the API has no transaction.
- **Audit:** `user.update` / plan changes.

### `GET|PATCH /api/admin/users/<id>`

`functions/api/admin/users/[id].ts`

- **GET `?resource=overview`** (default): the account, its primary org's profile
  and org row, and three counts (invoices, customers, templates) counted by
  `ownerId`. Six reads in parallel.
- **GET `?resource=invoices|customers|templates`:** a cursor-paged, projected
  slice of that user's rows.
- **PATCH `{ action: 'suspend' | 'unsuspend' }`:** flips the Appwrite account
  status. Suspending yourself is `400`. Audit: `user.suspend` /
  `user.unsuspend`.
- **Caveat:** the counts use `ownerId`, so for a multi-member organization they
  count the primary member's creations, not the organization's total. Recorded
  in `audit/verification-2026-11.md`.

### `GET|POST /api/admin/content`

`functions/api/admin/content.ts`

- **Resources:** `templates` and `invoices` only.
- **GET `?userId=&resource=`:** one lean page (default 10, max 50) of that
  user's rows. `&rowId=` returns one row's full content; `&nextNumber=1` on
  invoices returns the next free invoice number.
- **POST `{ userId, resource, action, … }`:** `create`, `update` or `delete`.
  Payloads are validated with the same Zod schemas the user's own forms use;
  invoice status changes go through the shared transition rules; ownership is
  re-read per row (the row must belong to the `userId` in the request); content
  fingerprints and template timestamps are used for conflict detection.
- **Audit:** every mutation.

### `GET /api/admin/support` and `PATCH /api/admin/support/<id>`

- **GET:** newest-first page (`limit` 1–50, default 25, `cursorAfter`). A missing
  table answers an empty page, so the tab renders "Belum ada pesan".
- **PATCH `{ solved: boolean }`:** stamps `solvedAt`/`solvedBy` or clears both;
  audits `support.solve` / `support.reopen`.

### `GET /api/admin/audit`

- Newest-first page of `audit_logs` (`limit` 1–50, default 25, cursor). A missing
  table answers an empty page rather than an error.

### `GET /api/admin/quota`

- Returns `{ isolate, policy, provider, dashboards }`: this isolate's counters,
  breakers and cache sizes (labelled `single-isolate`), the effective policy
  including `QUOTA_*` overrides, and the published provider limits with the
  verification date. It never claims a remaining monthly quota — Appwrite Free
  exposes no usage API and Cloudflare's analytics are not billing-grade.

---

## Public forms and diagnostics

### `POST /api/support`

`functions/api/support.ts`

- **Gate:** public. Per-IP `support` fence (5/hour) before the Turnstile round
  trip.
- **Body:** `{ name, email, subject?, message, source?, turnstileToken }`.
  Limits: name 128, email 128 and email-shaped, subject 128, message 10–4000.
  `source` is `landing` (default) or `contact`.
- **Turnstile:** mandatory; `unconfigured` is 500, `missing_token`/`rejected` is
  400, `unreachable` is 502.
- **Write:** one `support` row with `permissions: []`. A 404 from Appwrite (table
  missing) answers 500 with the support email rather than a fake success.
- **Output:** `{ success: true }`.

### `POST /api/turnstile`

- **Gate:** public. `turnstile` fence 30/min per IP.
- **Body:** `{ token }`. **Output:** `{ success, errorCodes }` — always 200 for a
  normal rejection, because "Cloudflare said no" is an expected outcome.
- **Errors:** `400` missing token, `500` unconfigured, `502` unreachable.

### `POST /api/csp-report`

- **Gate:** public. `csp-report` fence 30/min per IP, 8 KB body cap.
- **Behaviour:** accepts `{ "csp-report": … }`, `{ "csp-violation": … }` or a
  bare report object, logs one compact line, answers `204`. A report endpoint
  that errors makes browsers stop reporting.

---

## Shell routes

`functions/invoice/[[id]].ts`, `functions/templates/[[id]].ts`,
`functions/site/[[id]].ts`, with `functions/_lib/shell.ts`.

- **Methods:** `GET` and `HEAD` only; anything else is `405` with `allow`.
- **`GET /invoice/<id>`** → serves `dist/invoice/edit/`. Reserved segments
  (`new`, `print`, `edit`) and non-matching segments go back to the asset store.
- **`GET /invoice/print/<id>`** → serves `dist/invoice/print/`.
- **`GET /invoice/edit?id=…`** → `302` to `/invoice/<id>`; without a usable id it
  serves the shell and the app explains the incomplete link.
- **`GET /templates/<id>`** → serves `dist/templates/new/`; `/templates/edit`
  always redirects to the canonical target (id, `?from=` copy, or blank editor).
- **`GET /site/<orgId>`** → serves `dist/site/`.
- Wrangler compiles `[[id]]` to a repeat parameter, so the handlers treat the
  value as an array of segments; deeper paths go back to the assets.
