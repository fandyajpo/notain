# Product overview

Notain is an invoice ("nota") generator for small Indonesian businesses. A user
signs in, describes their business once, writes an invoice, prints it to PDF
through the browser, and shares it — by WhatsApp message or by a link the
customer can open. Everything else in the product exists to make that loop
repeatable: templates, a customer directory, a product catalog, a dashboard,
and organization-scoped billing.

Sources: `README.md`, `NOTAIN_MVP.md` (the original specification), and the
executable code referenced throughout this folder.

## Who uses it

**Visitor** — no session. Can read marketing pages, open a public invoice or
business page by its capability URL, and submit the contact form. Enforced by
`functions/api/invoice/[id].ts`, `functions/api/site/[id].ts` and
`functions/api/support.ts`, none of which require a session.

**Signed-in user** — an Appwrite account holder. May have zero organizations:
account settings stay available in that state
(`src/components/react/auth/auth-gate.tsx`, `functions/api/profile/user.ts`).

**Organization member** — has an active row in `memberships` for the active org.
Can read and write that org's invoices, customers, catalog and templates, read
the member list, and leave. Enforced by `requireOrg`.

**Organization owner** — `role: 'owner'` on that membership. Adds: edit the org
identity and contacts, manage members, buy a plan, delete the org. Enforced by
`requireOrgOwner`. Both live in `functions/_lib/orgs.ts`.

**Platform admin** — member of the Appwrite team `admins`. Bypasses plan limits
and can operate on any user through `/api/admin/*`. Enforced by `requireAdmin`
and `isAdminUser` in `functions/_lib/admin.ts`.

Roles are never inferred from the browser. The client's admin gate and disabled
form fields are UX only; every authority decision is re-read server-side on
every request.

## The core loop

1. **Sign up or sign in** — email and password, Google, or Discord (`/register`,
   `/login`, `/auth/callback`).
2. **Create or join an organization** — optional. An account without a
   workspace can still edit its own identity at `/settings`; workspace screens
   show the shared no-organization state (`NoOrganizationState`).
3. **Pick a template** — three built-ins ship in code; saved templates are
   copies the organization owns (`/templates`).
4. **Write the invoice** — customer, line items, optional business-specific
   detail fields, discount, tax, three rich-text zones, notes. Totals come from
   one pure module, `src/core/invoice/calculator.ts`.
5. **Save** — the builder asks the server for one free-tier allowance before a
   *new* invoice, then writes through `POST /api/data/invoices`. The row is
   stamped with the verified `orgId` and the caller's `ownerId`.
6. **Print or share** — `/invoice/print` renders the document and calls
   `window.print()`. The share link is `/invoice/print/<invoiceId>`, which the
   customer opens against `GET /api/invoice/<invoiceId>` — a capability URL
   gated to an active paid plan.
7. **Get paid, then mark it** — the customer may upload one payment-proof image
   from the public page. That upload never changes the status. The owner
   verifies the money outside Notain and moves the status
   `Belum dikirim → Terkirim → Lunas | Batal`.

## Feature status

Legend: **Live** means implemented end to end and reachable in the app.
**Limited** means implemented with an explicit product restriction.
**Placeholder** means a real screen whose feature does not exist yet.
**Absent** means there is no code for it.

- **Invoice authoring, editing, print/PDF — Live.** Print-based PDF, no client
  PDF library (ADR 0007).
- **Invoice status chain — Live.** Forward only: unset → `sent` → `paid` or
  `void`. Terminal states cannot be revised.
- **Templates (built-in and custom) — Live.** Block layout, theme tokens,
  default rich text, business-type grouping.
- **Customer directory and spreadsheet import — Live.** Import/export through
  the shared Excel module; merge and bulk delete included.
- **Product/service catalog — Live.** Feeds the invoice picker and files ticked
  line items on save.
- **Dashboard and finance metrics — Live.** Derived from invoices; no payment
  gateway reconciliation.
- **Free monthly invoice quota — Live.** 10 new invoices per calendar month per
  organization.
- **Pro plan checkout — Limited.** DOKU sandbox only; the endpoint is hardcoded
  to `api-sandbox.doku.com`. Production payments are out of scope.
- **Business plan — Placeholder in checkout.** Announced on the pricing page and
  refused by `POST /api/payments/checkout`.
- **Organization member invitations — Placeholder.**
  `POST /api/orgs/[id]/members` answers 503. Existing pending invitations can
  still be listed and accepted.
- **Shared account identity (name, phone) — Live.** `profiles/<userId>` through
  `/api/profile/user`.
- **Organization contact identity and logo — Live.**
  `organizations/<orgId>` plus the private R2 bucket.
- **Public business page `/site/<orgId>` — Live.** Organization-id URL, no plan
  gate, `noindex`.
- **Public invoice link — Limited to paid plans.** Free or expired organizations
  answer 402; an organization whose owner is an admin is exempt.
- **Payment-proof upload — Live.** One public upload per invoice; the owner may
  replace or delete it.
- **Support and contact form — Live.** Turnstile-gated, stored for admins, no
  automated reply.
- **Admin: users, content, support, audit, quota snapshot — Live.** `admins`
  team only.
- **API keys (`/api-keys`) — Placeholder.** Renders "Kunci API segera hadir".
  No key management exists.
- **Server-side rendering — Absent by design.** The build is fully static; the
  server is Pages Functions.
- **Real-time collaboration — Absent.** Plain HTTP with TanStack Query caches.
- **Automated WhatsApp sending — Absent.** The app opens a prefilled `wa.me`
  handoff; nothing is sent on the user's behalf.
- **Email delivery (invites, receipts, reminders) — Absent.** No mail provider
  is wired up.
- **Localization — Indonesian only.** User-facing copy is Indonesian; code
  comments are English.

## Vocabulary

**Nota / invoice** — one document. `invoiceNumber` is user-facing
(`INV-2026-001`); the row id is a hash of owner and number
(`src/core/invoice/numbering.ts`).

**Organization** — the tenancy root, `organizations/org_<16 hex>`. Owns
invoices, customers, catalog, templates, stats and payments; holds the name,
contact block and plan.

**Membership** — one row in `memberships` linking `(orgId, userId)` with a `role`
and a `status`. The only authority for access.

**Letterhead** — what the printed document shows about the business: name,
phone, address, email, logo, business type. Sourced from the organization row,
with the legacy `profiles/<orgId>` row as a fallback.

**Template** — a block layout plus theme and default rich text. Invoices
reference it by id; there is no snapshot.

**Catalog** — saved goods and services (`barang` / `jasa`) used to prefill line
items.

**Proof** — a payment screenshot the customer uploads. Stored in R2; two columns
on the invoice point at it.

**Plan** — `free`, `pro` or `business`, stored on the organization together with
`planExpiresAt`.

**Quota** — the free tier's monthly invoice allowance: 10 per calendar month,
per organization.

**Capability URL** — a URL whose id *is* the credential: `/invoice/print/<id>`,
`/site/<orgId>`, `/api/logo/<key>`, `/api/proof/<key>`.

**Isolate** — one Cloudflare Workers instance. Rate-limit windows, session
caches, the circuit breaker and the dedup map live in module memory and are
therefore per isolate, not fleet-wide.

**Shell** — a built static page served under a dynamic-looking URL by a Pages
Function (`/invoice/<id>`, `/templates/<id>`, `/site/<id>`), so the address bar
keeps the id without server rendering.

## Design constraints that shape everything

- **Zero unexpected billing.** The stack is Cloudflare Free plus Appwrite Free,
  and nothing in the repository can upgrade a plan. Every guard fails closed and
  every cost fence runs before provider work. See `quota.md` and
  `features/billing-and-quota.md`.
- **Static hosting, no SSR.** Pages are HTML at build time, all interactivity is
  islands, and the server is Pages Functions. See `architecture/system.md`.
- **Tenancy is application-level.** Appwrite cannot express "members of org X"
  in row permissions, so tenant tables are API-key-only and the membership row
  is re-read on every request. See `auth-and-tenancy.md`.
- **Four frameworks, one owner.** React holds every piece of state; Vue, Svelte
  and Solid are custom-element islands for three specific widgets (ADR 0001 and
  0002). Business rules live in `src/core/`, never in a component.
