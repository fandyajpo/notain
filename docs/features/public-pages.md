# Public pages

Everything an anonymous visitor can reach: the public invoice page that a
customer opens from a link, the payment-proof upload on that page, the public
business page, the marketing and SEO pages, and the contact form. Each public
read is a capability URL, so the design rule is the same throughout: the id
is the credential, the response is a narrow projection, and nothing is cached.

## Public invoice — `/invoice/print/<id>`

### What the customer sees

The print page at `/invoice/print/<id>` fetches `GET /api/invoice/<id>` and
renders the invoice through the same preview component the builder uses. It
shows the business letterhead (name, phone, address, email, logo, business
type), the customer block, the items and totals, the three rich-text zones,
and the template's layout and theme. If the invoice names a template that no
longer exists, a built-in is used.

Two things are deliberately absent from the payload: the owning user's id and
the organization's id. The row's timestamps are also omitted.

### When the link works

The link works only while the owning organization has an active paid plan.
Otherwise the endpoint answers `402 plan_required`, and the page shows the copy
from the server: the invoice link is a Pro feature, ask the sender for the PDF.
A user whose organization is on Free can still print their own invoice from the
signed-in print view, which does not pass through this endpoint.

An organization whose owner is an admin is exempt, so an operator's own links
keep working on a free plan.

### Gating and abuse

- A per-IP fence of 60 requests per minute runs before the database is read
  (`invoice-read`). A real visitor loads a page once; the fence exists to stop
  a loop over guessed ids from spending read quota.
- A non-matching id is 404 without a database read.
- An unknown id and a foreign id both return 404.
- Responses carry `cache-control: no-store`, because the invoice changes while
  the link is open: a status flip, a proof upload.

### Payment proof

The customer may upload one proof image from the public page. Requirements:

- a Turnstile token, verified server-side. A missing or rejected token stops the
  upload before anything is stored;
- a file of at most 5 MB, named `.jpg`, `.jpeg`, `.png` or `.webp` (HEIC and
  HEIF are converted to JPEG in the browser first, because no other browser
  displays them reliably);
- the invoice must not be `paid` or `void` — a settled invoice does not accept
  proof (409 with copy for each case);
- no proof may already exist — one upload per invoice (409).

The browser re-encodes the image before sending: the longest edge is capped at
1600 pixels and the result is JPEG, PNG or WebP, so the stored file always opens.
The server accepts only those three types and derives the content type from the
extension.

The upload takes a per-invoice lock stored in R2 with conditional writes and a
60-second lease. Two simultaneous uploads for one invoice serialize; the second
gets 409 "sedang diproses". Under the lock the row is re-read, the object is
written, and then the row's `paymentProofKey` and `paymentProofUploadedAt` are
set. If the row write fails, the object is deleted again so nothing is orphaned.

The proof's key is `proofs_<invoiceId>_<14 hex>.<ext>`. It is served at
`/api/proof/<key>` with `nosniff`, a sandbox CSP, and immutable caching. The
key carries 56 bits of randomness and is never listed.

**Uploading a proof does not change the invoice's status.** The public page
states this, and the dashboard marks such invoices with a "check payment" badge
until the owner moves them to `paid` or cancels them.

### Owner side of the proof

The owner uploads, replaces and deletes proofs from the builder and the dashboard,
using a session instead of Turnstile. The status gate and the one-upload rule do
not apply to the owner, so a corrected screenshot can replace an earlier one even
on a settled invoice. Replacement deletes the old object only after the row
points at the new key. Deletion clears the row's pointer first and then removes
the object, so a row never references a missing file. A failed pointer clear
keeps the object and answers 503.

Owner upload and delete are rate-limited per user (30 per hour and per request
respectively, see `security.md`).

## Public business page — `/site/<orgId>`

`GET /api/site/<orgId>` backs the page at `/site/<orgId>`. The path contains the
**organization** id. There is no publish toggle and no plan gate: a named
organization is publicly addressable, and the page is marked `noindex`.

The payload carries the business name, the owner's display name, the
organization's own contact email (never the owner's login address), phone,
address, logo and business type, plus up to 100 catalog items sorted by name.
A catalog item with price 0 renders as "Hubungi" (contact us) rather than Rp 0.

Responses:

- `404` for a missing organization, or one whose name is blank — a blank name
  means the account never finished setting up, so it has no page.
- `503` when a provider read fails. The page must not pretend it does not exist.
- `200` with an empty `items` list for an organization with no catalog.

The `site` fence (60 requests per minute per IP) guards the endpoint. The
owner's edits appear on the next load because the response is `no-store`.

The page's data source is the organization row, with the legacy profile row as
a fallback for contact fields that were never migrated. The owner's name comes
from the owner's shared account identity.

## Marketing and SEO pages

Static pages built by Astro. No server logic is involved.

- Landing `/`: islands for the header and progress bar (`client:load`) and the
  remaining sections (`client:visible`). The page structured data describes the
  site and publisher only; there is no search action, since no site search
  exists.
- `/pricing`: plan cards from `plan-benefits.ts`, the "Business — Segera hadir"
  state, and the finale call to action.
- Industry pages `/katering`, `/desainer`, `/developer`, `/warung`,
  `/online-shop`, `/freelancer`, `/jasa-servis`, `/salon`: one dynamic route,
  `src/pages/[slug].astro`, with copy held as data in `src/core/seo/industries.ts`.
  Each page emits FAQ structured data that mirrors the visible FAQ exactly.
- `/blog`, `/developers`, `/contact`, `/privacy`, `/terms`, `404`.

Indexing is an allowlist, not a denylist. `src/lib/seo.ts` decides which
paths get `index, follow` and a canonical URL. Every other path, including every
signed-in screen and every capability URL, is `noindex, nofollow`. A new route
is not indexed until someone adds it to the allowlist. The sitemap script builds
from the same list. `src/core/seo/industries.test.ts` checks that each industry
slug is allowlisted.

Custom-element islands in the marketing pages are mounted with `client:visible`
so their chunks stay off the first load.

## Contact form — `POST /api/support`

Anyone can submit the form on `/contact` or the landing page. The server checks:
name, email, optional subject, a message of 10 to 4,000 characters, a
Turnstile token, and a per-IP fence of five per hour. The row is written with
empty permissions, so only admins can read it (`/admin/support`).

The success message is shown only after the write succeeds. The copy says a reply
arrives by email within one or two business days, but nothing in the system sends
one. Admins read the message in the admin screen and mark it solved or reopened.

## Public shells

`/invoice/<id>`, `/templates/<id>` and `/site/<id>` are served by Pages Functions
from the static shell, so the address bar keeps the id. They are not public
read endpoints: the shell is the same for every id, and the data is fetched by
the browser through the endpoints above. See `architecture/system.md`.

## Files

- Server: `functions/api/invoice/[id].ts`, `functions/api/invoice/[id]/proof.ts`,
  `functions/api/proof/[key].ts`, `functions/api/site/[id].ts`,
  `functions/api/support.ts`, `functions/api/turnstile.ts`.
- Client: `src/app/public-invoice.ts`, `src/app/public-site.ts`,
  `src/app/support.ts`, `src/components/react/invoice/print-*.tsx`,
  `src/components/react/invoice/payment-proof-card.tsx`,
  `src/components/react/site/*`, `src/components/react/support/support-form.tsx`,
  `src/lib/payment-proof.ts`, `src/core/invoice/payment-proof.ts`.
- SEO: `src/lib/seo.ts`, `src/core/seo/industries.ts`, `src/pages/[slug].astro`,
  `scripts/sitemap.mjs`.
- Tests: `tests/invoice-link-gate.test.ts`, `tests/site-function.test.ts`,
  `tests/proof-endpoints.test.ts`, `tests/admin-support.test.ts`,
  `e2e/site-page.spec.ts`, `e2e/landing.spec.ts`.
