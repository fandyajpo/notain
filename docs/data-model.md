# Data model

Everything persistent: Appwrite tables, their columns, indexes and permissions,
the R2 object layout, and the provisioning scripts that create it. The schema
scripts in `scripts/` are the authoritative description — this document is the
readable map and records the invariants that live in code rather than in the
database.

## Backing services

- **Appwrite Cloud**, region `sgp` (`https://sgp.cloud.appwrite.io/v1`), project
  `6aca66fb003071c0ef43`, database `notain_db`. Configured in
  `src/appwrite/config.ts` for the browser and in `wrangler.toml` `[vars]` for
  the Functions. Keep the two in step.
- **Cloudflare R2**, bucket `notain`, private, bound to the Functions as
  `LOGOS`. No public URL and no S3 credential ever reaches the browser.

## ID conventions

- **Organization**: `org_` + 16 lowercase hex (`newOrgId()` in
  `functions/api/orgs.ts`). Validated everywhere by
  `/^org_[0-9a-f]{16}$/` (`isValidOrgId`).
- **Membership**: random org-style id (`newOrgId()` reused) — the shape is
  incidental; the row is never addressed by the client except for deletion.
- **Profile**: the id is either an Appwrite `userId` (account identity) or an
  `org_…` id (the legacy per-org letterhead row). The two spaces cannot collide
  because org ids start with `org_`.
- **Invoice**: `inv_` + first 32 hex of `sha256(ownerId + ':' + invoiceNumber)`
  (`invoiceDocumentId`). Deterministic, so the unique document id itself is the
  "one number per owner" constraint.
- **Stats**: the organization id, one row per org.
- **Payment**: the DOKU `invoice_number`. For the first checkout of a plan in a
  month it is deterministic (`NOTAIN-P-<16 hex org><YYMM>`); renewals and
  retries use a random form (`NOTAIN-P-<time36>-<8 hex>`). Either way the row id
  *is* what DOKU is told, which makes the webhook lookup a single document read.
- **Customer, catalog, template, audit log, support**: Appwrite-assigned
  (`unique()`), except templates which may carry a client-supplied id.
- **Password-reset token**: `pwreset_` + 16 hex of `sha256(userId)`. Derived from
  the account, not from the token, so the row is stable across re-issues; the
  token's own hash is a column, not the id.

## Tables

### `organizations` — the tenancy root

Columns: `name` (string 128), `ownerId` (string 64), `plan` (string 16),
`planExpiresAt` (string 32, nullable), `businessType` (string 64, nullable),
`createdAt` (string 32), `slug` (string 64), `email` (string 320), `phone`
(string 32), `website` (string 320), `address` (string 512), `taxId` (string
64), `logoFileId` (string 64).

Indexes: `byOwner` on `ownerId`; `bySlug` unique on `slug`.

Permissions: none at table level, `rowSecurity: true`. Only the API key reads or
writes these rows, behind `requireOrg`/`requireAdmin`.

Written by: `POST /api/orgs` (create), `PATCH /api/orgs/<id>` (identity and
contacts), `payment-settle.ts` (plan), the admin API (plan), the cascade delete.

Rules encoded in code, not in the database:

- `plan` is only ever written by settlement or an admin. No request body can
  reach it (`FORBIDDEN_BODY_KEYS`).
- `slug` is generated server-side as `<ascii-slug-of-name>-<orgId[4..8]>`, which
  is deterministic and collision-resistant against the unique index.
- `email` starts empty. The owner's login address is never copied in; the
  organization's contact email is its own data.
- Contact validation: email shape, Indonesian mobile pattern
  `/^(?:\+?62|0)8\d{7,12}$/` for `phone`, length caps per column.

### `memberships` — who belongs to which organization

Columns: `orgId` (string 64), `userId` (string 64 — empty until an invitation is
accepted), `role` (string 16, `owner` | `member`), `status` (string 16, `pending`
| `active`), `inviteEmail` (string 320), `invitedBy` (string 64), `createdAt`
(string 32).

Indexes: `byOrg` (`orgId`), `byUser` (`userId`), `byOrgEmail` **unique**
(`orgId`, `inviteEmail`).

Permissions: none; API key only.

An invitation is a `pending` row with an empty `userId` and the invitee's email.
`POST /api/orgs/accept` matches by email on every authenticated load and flips
the row to `active` with the accepter's `userId`, so someone can register after
being invited and still land in the org. New invitations cannot be created yet:
`POST /api/orgs/<id>/members` answers 503 (`functions/api/orgs/[id]/members.ts`).

`findMembership` requires `status = 'active'`, so a pending row never grants
access, even to its own email address.

### `profiles` — two id spaces, one table

Columns: `name` (string 128), `phone` (string 32), `address` (string 256,
nullable), `email` (string 128, nullable), `logoFileId` (string 64, nullable),
`plan` (string 16), `planExpiresAt` (string 32, nullable).

- `profiles/<userId>` — the **shared account identity** (person's name and
  phone). Written only by `PUT /api/profile/user`, gated by the session alone,
  which is why it still works for an account with no organizations. The login
  email is deliberately absent: Appwrite owns it.
- `profiles/<orgId>` — the **legacy per-org letterhead row**. Still read as a
  fallback by the invoice and site endpoints for organizations that predate the
  contact columns on `organizations`. New orgs no longer get one;
  `GET /api/profile?orgId=` synthesizes the view from the organization row when
  the row is missing.

On this table specifically, `plan` and `planExpiresAt` are **vestigial**: the
endpoint projects the plan from `organizations/<orgId>`. They remain because
older readers exist and because removing a column is riskier than ignoring it.

`scripts/harden-profile-permissions.mjs` removes session write access to this
table; all writes go through `/api/profile*` with the API key.

### `invoices` — the product's core row

Columns: `orgId` (string 64), `ownerId` (string 64), `invoiceNumber` (string
32), `date` (string 10), `dueDate` (string 10, nullable), `templateId` (string
64, nullable), `status` (string 16, `''` for unset), `customerName` (string
128), `customerPhone` (string 32, nullable), `customerEmail` (string 255,
nullable), `items` (string/JSON), `details` (string/JSON, nullable),
`discountType` (string 8), `discountValue` (integer), `taxType` (string 8),
`taxValue` (integer), `notes` (string 5000, nullable), `headerHtml` /
`contentHtml` / `footerHtml` (string 20000), `paymentProofKey` (string 128,
nullable), `paymentProofUploadedAt` (string 32, nullable), plus Appwrite's
`$createdAt`/`$updatedAt`.

Indexes (`scripts/ensure-indexes.mjs`):

- `org_date` (`orgId`, `date`) — the org's list, the quota walk, finance window.
- `org_template_date` (`orgId`, `templateId`, `date`) — template filter.
- `org_status_date` (`orgId`, `status`, `date`) — status filter and stats.
- `org_invoiceNumber` (`orgId`, `invoiceNumber`) — year prefix scan.
- `org_invoiceNumber_unique` **unique** (`orgId`, `invoiceNumber`).
- `invoice_number_fulltext`, `customer_name_fulltext`, `items_fulltext` —
  required by `Query.search`; without them Appwrite rejects the search.
- Legacy `owner_*` twins with the same shapes are kept while the migration
  settles.

JSON columns: `items` is a JSON array of
`{ id, name, quantity, unitPrice, unit?, }`; `details` is a JSON object of
business-specific strings. Both are serialized by the data endpoint
(`invoiceDraftToRowData`) and parsed by `src/appwrite/mappers.ts`.

Row invariants enforced by the endpoint, not the schema: a new row must have a
null status; status moves forward only; `orgId`/`ownerId` are stamped.

### `templates`

Columns: `orgId` (string 64), `ownerId` (string 64), `name` (string 128),
`layout` (JSON), `theme` (JSON), `headerHtml`, `contentHtml`, `footerHtml`
(string 20000), `notes` (string 5000, nullable), `businessType` (string 64,
nullable).

Indexes: `org` (`orgId`), legacy `owner` (`ownerId`).

`layout` is `TemplateBlock[]` (type, visibility, align, width) and `theme` is the
`TemplateTheme` token set; both are validated by `src/core/template/schema.ts`
before storage. The built-in templates (`classic`, `minimal`, `modern`) are code
constants in `src/core/template/builtins.ts` and are **never persisted**.

### `customers`

Columns: `orgId`, `ownerId`, `name`, `email` (nullable), `phone` (nullable),
`lastUsedAt`. Column sizes come from whichever provisioning script created the
table; the domain caps a name at 128 characters (`CUSTOMER_LIMITS`), and Appwrite
rejects anything longer than the column allows.

Indexes: `org_name` (`orgId`, `name`), legacy `owner_name`.

A directory, not a source of truth: each invoice keeps its own
`customerName`/`customerPhone`/`customerEmail` snapshot, so renaming or deleting
a customer never rewrites an issued document.

### `catalog`

Columns: `orgId`, `ownerId`, `name` (string 200), `kind` (string 16, `barang` |
`jasa`), `unit` (string 16), `unitPrice` (integer, 0 … 1e12), `lastUsedAt`
(string 32).

Indexes: `org_name`, legacy `owner_name`.

`unitPrice: 0` means "no price configured" and renders as "Hubungi" on public
pages.

### `stats`

One row per organization, id = the org id. Columns: `orgId`, `ownerId`, and six
integers `totalInvoices`, `sentCount`, `paidCount`, `voidCount`,
`totalCustomers`, `totalTemplates`. Index: `org`, legacy `owner`.

This is a **cache**, not a source of truth: `refreshDashboardStats`
(`src/app/stats.ts`) recomputes all six numbers from the source tables on every
dashboard visit and writes them back. No backfill exists; the row appears on
first visit.

### `payments`

Id = the DOKU invoice number. Columns: `orgId`, `ownerId`, `plan` (string 16),
`amount` (integer), `currency` (string 8), `status` (string 16, `pending` |
`paid` | `expired`, plus `failed` written by checkout failure paths),
`invoiceNumber` (string 64), `checkoutUrl` (string 1024, nullable),
`dokuExpiredAt` (string 32, nullable), `paidAt` (string 32, nullable),
`createdAt` (string 32), `planAtCheckout` (string 16), `planExpiresAtSnapshot`
(string 32), `activationStatus` (string 16, `pending` | `active`),
`activationPlan` (string 16), `activationExpiresAt` (string 32),
`activationRetryAfter` (string 32), `activationError` (string 64).

Indexes: `byInvoiceNumber` unique (`invoiceNumber`), `byOwnerStatus`
(`ownerId`, `status`), plus `byOrgStatus` (`orgId`, `status`) from
`ensure-indexes.mjs`.

The snapshot columns (`planAtCheckout`, `planExpiresAtSnapshot`) and the
activation quartet are what make settlement idempotent across isolates — see
`features/billing-and-quota.md`.

### `support`

Columns: `name` (string 128), `email` (string 128), `subject` (string 128),
`message` (string 4000), `source` (string 16, `landing` | `contact`),
`createdAt`, `solvedAt` (string 32, nullable), `solvedBy` (string 128,
nullable). Index `byCreatedAt`.

Rows are written anonymously through `/api/support` with empty permissions, so
only the API key (and therefore only the admin endpoints) can read them.

### `audit_logs`

Columns: `actorId` (string 64), `actorEmail` (string 128), `action` (string 64),
`targetType` (string 64), `targetId` (string 128), `detail` (string 2048),
`orgId` (string 64), `createdAt` (string 32). Indexes: `byCreatedAt`,
`byOrg`.

Row permissions: `read("team:admins")`. Writes come from `writeAudit()` with the
API key and never throw; a failure is logged and returned as `false` so a caller
can report the gap without claiming its business write failed.

Actions currently written: `org.create`, `org.create.compensation-failed`,
`org.update`, `org.delete`, `org.leave`, `org.member.remove`,
`org.invite.revoke`, `payment.checkout.failed`, `payment.paid`,
`payment.paid.activation-failed`, `payment.expired`, `payment.amount-mismatch`,
`user.suspend`, `user.unsuspend`, `support.solve`, `support.reopen`, and the
admin content mutations.

### `password_resets` — server-only reset tokens

Columns: `tokenHash` (string 64), `userId` (string 36), `expiresAt` (string 32,
ISO-8601), `origin` (string 128).

Indexes: `byTokenHash` on `tokenHash` — the confirm endpoint knows the token, not
the account, so redemption is a lookup.

Permissions: none, `rowSecurity: true`. Only
`functions/api/mail/password-reset*` reads or writes these rows, with the API key.

Written by: `POST /api/mail/password-reset` (create, or patch over the account's
existing row). Deleted by: a successful confirm, and on sight when an expired row
is redeemed.

Rules encoded in code:

- The row id is `pwreset_` + 16 hex of `sha256(userId)` (`resetRowId`), so one
  account has at most one live link; a second request invalidates the first.
- Only `sha256(token)` is stored. The token itself exists in the email and
  nowhere else, so a dump of this table cannot be replayed.
- `expiresAt` is 30 minutes after minting (`RESET_TOKEN_TTL_MINUTES`).
- Unset `origin` cannot happen: the endpoint refuses a request whose origin is
  not https (or loopback), so a link is never built for a plain-http host.

Created by `scripts/ensure-password-resets.mjs`
(`npm run password-resets:ensure`).

## R2 object layout

Bucket `notain`, private, bound as `LOGOS`.

- `logos_<userId>_<14 hex>.<ext>` — logos. `ext` ∈ png, jpg, jpeg, svg, webp,
  ico. `customMetadata.owner = userId`. A fresh key on every upload, so a URL
  never outlives its content and can be cached immutably.
- `proofs_<invoiceId>_<14 hex>.<ext>` — payment proofs. `ext` ∈ jpg, jpeg, png,
  webp; `customMetadata.owner` is the invoice owner, `customMetadata.invoice`
  the invoice id.
- `proof_upload_lock_<invoiceId>` — a lock object. Written with a conditional
  put (`etagDoesNotMatch: '*'`), taken over only when the current object is
  marked `released` or is older than the 60 s lease, and released with
  `etagMatches` so only the holder can free it (`functions/_lib/proof-lock.ts`).

Reading is public by capability (`GET /api/logo/<key>`, `GET /api/proof/<key>`)
with `nosniff`, `cross-origin-resource-policy: same-origin`, a
`default-src 'none'; sandbox` CSP, and immutable caching. Deleting requires a
session *and* `customMetadata.owner` matching it; someone else's object answers
404, not 403, so key existence does not leak.

## Cross-table invariants

- Every tenant row carries `orgId`; `ownerId` is kept as creator provenance
  only. Queries filter on `orgId` (the `org_*` indexes), never on `ownerId`.
- Tenant rows are created with `permissions: []`. The gate is the membership
  row, re-read per request — not Appwrite row permissions.
- Deleting an organization cascades memberships first, then invoices,
  customers, catalog, templates, stats, payments, audit rows with that `orgId`,
  then the legacy `profiles/<orgId>` and its logo, then the org logo and row.
  `profiles/<userId>` and the Appwrite account survive. It is not a transaction:
  each call deletes at most 30 rows and reports `done: false` until finished.
- An invoice references its template by id only. There is no snapshot, so
  editing a template changes every invoice that points at it; a missing template
  falls back to a built-in at render time.

## Provisioning order

Run these with an API key in `.env` (`APPWRITE_API_KEY`), dry-run by default,
`-- --yes` to apply. They are idempotent: re-running skips what exists.

1. `npm run orgs:ensure` — `organizations`, `memberships`, their indexes.
2. `npm run org-columns:ensure` — `orgId` on `invoices`, `customers`,
   `catalog`, `templates`, `stats`, `payments`, `audit_logs`; and empties their
   table permissions (API key only).
3. `npm run indexes:ensure` — every index the app's queries rely on, including
   the `org_*` twins and the unique invoice-number index.
4. `npm run payments:ensure` — the `payments` table.
5. `npm run profile-org-model:ensure` — organization contact columns and slug,
   plus the backfill of account identities and org contacts.
6. `npm run stats:ensure`, `npm run catalog:ensure`, `npm run audit:ensure`,
   `npm run support:ensure` — the remaining tables.
7. `npm run payment-proof:ensure` — `invoices.paymentProofKey` and
   `paymentProofUploadedAt`.
8. `npm run business-type:ensure` — `businessType` on `templates` and
   `organizations`.
9. `npm run migrate:invoice-status`, `npm run migrate:customer-email`,
   `npm run migrate:org-identity` — one-off data migrations for older rows.
10. `node --env-file=.env scripts/harden-profile-permissions.mjs` — removes
    session write access to `profiles`. This one has no npm script.

Order matters where a script assumes an earlier one: `org-columns` expects the
tables to exist, `indexes` expects the columns, and the feature that writes a
column must not deploy before the script that creates it.

## Query shapes and why the indexes exist

- Invoice list: `equal(orgId)` + `orderDesc(date)` + `orderDesc($createdAt)` +
  `limit` → `org_date`.
- Status filter: `equal(orgId)` + `equal(status)` + sort → `org_status_date`.
  The "Belum dikirim" filter is `status = ''`, a real value, not an absence.
- Search: `or(search(invoiceNumber), search(customerName), search(items))` —
  full-text indexes are mandatory, and `search` needs at least 3 characters.
- Next number: `equal(orgId)` + `startsWith(invoiceNumber, 'INV-YYYY-')` →
  `org_invoiceNumber`.
- Finance: one projected walk over `equal(orgId)` + date range, capped at 20
  pages of 100.
- Admin lists: `equal($id, [ids])` batches, cursor paging, projections.

## Known drift risks

- The legacy `owner_*` invoice indexes and the `profiles.plan` columns are still
  present. They are intentionally not dropped while old rows exist.
- Schema creation lives in scripts, not migrations with versions: applying the
  wrong subset leaves the API answering 503 on a missing column. The
  provisioning order above is the safe path.
