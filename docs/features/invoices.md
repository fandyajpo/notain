# Invoices

The product's core object. This guide covers the domain model, numbering, the
status chain, the authoring flow, saving, printing and sharing, payment proofs,
and the table the dashboard renders.

## Where the code lives

- Domain: `src/core/invoice/model.ts` (types and limits), `schema.ts` (Zod),
  `calculator.ts` (totals), `numbering.ts` (numbers and ids), `status.ts` (the
  chain), `fingerprint.ts` (conflict detection), `payment-proof.ts` (upload
  rules), `repair.ts` (normalising read rows).
- Application: `src/app/invoices.ts` (list, get, create, update, status,
  delete, bulk delete), `src/app/data-api.ts` (transport).
- Builder UI: `src/components/react/invoice/*` — `invoice-builder.tsx` is the
  page, `item-grid` is Svelte, the catalog picker is Vue, the totals inspector
  is Solid, everything else is React.
- Server: `functions/api/data/[resource].ts` with `resource = invoices`.
- Persistence: `src/appwrite/mappers.ts` maps rows to the domain and back.

## Draft shape

`InvoiceDraft` is what the form holds and what the server validates:

- `invoiceNumber` — `INV-YYYY-NNN`, ≤32 characters, pattern
  `/^INV-\d{4}-\d{3,9}$/`.
- `date`, optional `dueDate` — ISO dates, validated as real dates.
- `templateId` — a reference, optional.
- `status` — `null` (unset), `sent`, `paid` or `void`.
- `customerName` (required, ≤128), optional `customerPhone` (Indonesian mobile
  pattern) and `customerEmail` (≤255).
- `items` — 1–100 rows of `{ id, name ≤200, quantity 1…1,000,000 (integer),
  unitPrice 0…10¹² (integer rupiah), unit? ≤16 }`.
- `discount` and `tax` — `{ type: 'amount' | 'percent', value }`. A percentage
  is capped at 100; an amount must be a whole rupiah.
- `sections` — `header`, `content`, `footer`, each ≤20,000 characters of
  sanitized rich text.
- `notes` — optional, ≤5,000.
- `details` — a record of business-specific strings (≤16 entries, each ≤128
  characters), kept even when the current business type no longer lists the key.

An invoice row additionally carries `id`, `ownerId`, `orgId`, `createdAt`,
`updatedAt`, and `paymentProof: { key, uploadedAt } | null`.

## Totals

One pure module, `src/core/invoice/calculator.ts`, owns every number:

- line subtotal = `quantity × unitPrice`, clamped to a valid rupiah;
- subtotal = sum of line subtotals;
- discount = a percentage of the subtotal or a fixed amount, capped at the
  subtotal;
- taxable = subtotal − discount;
- tax = a percentage of the taxable amount or a fixed amount, capped at it;
- grand total = taxable + tax.

The UI never re-implements arithmetic; it renders what these functions return.
Finance metrics and exports call the same functions, so a figure can never
disagree between screens.

## Numbering and identity

- The suggested number is the highest existing `INV-<current year>-NNN` plus
  one (`nextInvoiceNumber`), computed from a year-prefixed scan of the org's
  invoices. Sequences restart each calendar year.
- The row id is deterministic: `inv_` + the first 32 hex characters of
  `sha256(ownerId + ':' + invoiceNumber)`. Appwrite refuses a second document
  with the same id, so two tabs both offering `INV-2026-007` cannot both save —
  the loser receives 409 with "Nomor invoice ini sudah dipakai".
- A unique index on `(orgId, invoiceNumber)` is the backstop for updates, which
  cannot change a row id.
- Duplicating an invoice (`/invoice/new?from=<id>`) copies customer, items,
  discount, tax, sections, notes, details and template, gives every item a new
  id, keeps the due date's offset from the invoice date ("net 14" stays "net
  14"), and resets the status to unset.

## Status chain

Forward only: `null` (Belum dikirim) → `sent` (Terkirim) → `paid` (Lunas) or
`void` (Batal). `paid` and `void` are terminal. Re-selecting the current status
is an idempotent no-op; clearing a status is never allowed.

Enforced in `canChangeStatus` and applied by three layers: the status select in
the builder, `updateInvoiceStatus` in `src/app/invoices.ts`, and the data
endpoint's `PATCH` handler (which re-reads the stored row before deciding). A
refused transition answers 409 with the Indonesian explanation built by
`statusFlowMessage`.

The invoice's content and its status are separate writes. `updateInvoice` omits
`status` entirely, so a stale form or a second tab can never rewind a status it
does not write.

`needsPaymentCheck(invoice)` is true when a proof exists and the status is
neither `paid` nor `void` — the "check this payment" badge on the dashboard.

## Authoring flow

**New invoice** (`/invoice/new`, `invoice-new-app.tsx`):

1. The builder opens at the template step unless a `?from=` duplicate already
   carries a `templateId`.
2. Picking a template applies its default rich text to sections that are still
   empty (typed content is never overwritten) and seeds sample items where the
   template provides them.
3. Customer fields offer the directory; item rows offer the catalog and the
   history-derived picker.
4. Totals update through the calculator as values change.
5. The draft is autosaved to `localStorage` under
   `notain:draft:<ownerId>:new`, structurally validated on read so a
   work-in-progress draft is never rejected by business rules.
6. On save the builder validates the whole draft client-side, then asks
   `POST /api/quota/invoices` for one allowance. A 402 stops the save with the
   upgrade copy; a 503 stops it too, because an unreadable allowance must not be
   treated as "unlimited".
7. It then posts the draft to `/api/data/invoices`. The server re-validates,
   stamps `orgId`/`ownerId`, serializes `items`/`details`, forces `status` to
   `''`, and creates the row at the deterministic id.
8. On success the draft is cleared and two secondary writes are attempted
   fire-and-forget: remember the customer and file the ticked line items into
   the catalog. A failure there never rolls back the invoice.

**Editing** (`/invoice/<id>`, `invoice-edit-app.tsx`): the id is read from the
URL by `invoiceIdFromLocation`; the draft is loaded from `/api/data/invoices?
rowId=`, autosaved under its own key, and guarded against accidental navigation
when dirty (`use-unsaved-changes-guard`). Saving patches the row; status is
untouched unless the status control is used.

**Duplicate**: `/invoice/new?from=<id>` with autosave restore disabled, so an
older local draft cannot overwrite the copy.

## Saving and failure modes

- Client validation errors are field-mapped and shown next to the field
  (`flattenIssues`).
- Duplicate number → 409 with the number-specific copy.
- Attempting to create an invoice already marked `sent`/`paid`/`void` → 400;
  a new row must start unset.
- Unknown columns → 400 `Kolom invoice tidak dikenal.`
- Foreign or missing row on patch → 404.
- Provider read or write failure → 503, never a silent success.
- Local storage unavailable (private mode, quota) → autosave silently disabled;
  the invoice still saves.
- 429 from the write fence → the shared rate-limit copy with `retry-after`.

## Dashboard table and bulk operations

`invoice-table.tsx` renders the list with search, status filter, template
filter, sorting, cursor pagination, row selection, and a selection toolbar.

- **Search** runs server-side across invoice number, customer name and items;
  it needs at least three characters.
- **Selection** has three scopes: the current page, "all matching this view", and
  "everything". The wider scopes are resolved by walking the cursor with the
  active filters (`resolveSelection` in `src/lib/selection.ts`), not by trusting
  what happens to be loaded.
- **Bulk delete** is one server call per 20 ids (`bulkDeleteAll`). Foreign and
  missing ids are skipped by the server; the list refetches afterwards.
- **Export** writes CSV or XLSX through `src/core/excel/`, with formula escaping
  so a customer name beginning with `=` cannot execute in a spreadsheet.

## Print and share

- **Print** (`/invoice/print`): the builder hands the current draft to a new tab
  through `sessionStorage` under `notain:print`, because rich text and a hundred
  line items do not fit in a URL. A blocked popup falls back to the current tab,
  which reads the same storage. The print view renders the invoice exactly as the
  builder sees it, unsaved edits included, and calls `window.print()`.
- **PDF** is the browser's print-to-PDF. There is no client-side PDF library for
  the document itself (ADR 0007). `print.css` keeps borders on cards, the item
  table and the totals rule so the document stays legible when "Background
  graphics" is off.
- **Share link** (`/invoice/print/<id>`): the customer-facing page reads
  `GET /api/invoice/<id>`, a public capability read gated to the owning
  organization's paid plan. The signed-in print view waits for the template list
  when the invoice names a template, so it never prints the fallback layout.
- **WhatsApp**: when the customer has a phone number, the builder opens a
  prefilled `wa.me` message. Nothing is sent on the user's behalf and no file is
  attached automatically.
- **Email** (`EmailNotaDialog` in the builder): mails the saved invoice to the
  customer through `POST /api/mail/nota` — number, dates, total, an optional
  note and the `/invoice/print/<id>` link. No PDF is attached (there is no
  server-side renderer; ADR 0007), so the print dialog is still how a file is
  produced. Pro only: the server applies the same plan gate as the public link
  and answers 402 otherwise. A successful send moves an unset invoice to
  `sent`. Full design and limits: `email.md`.

## Payment proofs (invoice side)

The customer may upload one screenshot from the public page; the owner may
upload, replace or delete one from the builder or dashboard. The invoice stores
`paymentProofKey` and `paymentProofUploadedAt` only. Uploading never changes the
status: the owner verifies the money outside Notain and marks the invoice paid.
Full server rules are in `api-reference.md` and `features/public-pages.md`.

## Server-side rules recap

`functions/api/data/[resource].ts`, `resource = invoices`:

- read: org-scoped, whitelisted filters (`status`, `templateId`, `date` range,
  `invoiceNumber` prefix, full-text search), max 100 rows per page;
- write columns: `invoiceNumber`, `date`, `dueDate`, `templateId`, `status`,
  `customerName`, `customerPhone`, `customerEmail`, `items`, `details`,
  `discountType`, `discountValue`, `taxType`, `taxValue`, `notes`,
  `headerHtml`, `contentHtml`, `footerHtml` — nothing else;
- create requires the full set of business columns and a null status;
- patch runs the merged row through the same schema, so a partial update cannot
  leave an invalid document;
- delete is idempotent for an already-deleted row.

## Admin editing

Admins edit another user's invoices through `/api/admin/content` with the same
schema, the same status transition rules, ownership re-checked per row, and an
audit row per mutation. Content fingerprints and template timestamps produce
conflicts instead of silent overwrites.

## Known limits

- Full uniqueness across devices depends on the unique index; without it, two
  offline saves could collide, and the endpoint would answer 409 rather than
  merge.
- Invoice totals are derived, never stored, so any report must fetch the rows.
- Status flips record no timestamp. Finance metrics bucket revenue by invoice
  date, and the activity feed omits status changes rather than inventing a time.
- The public link is a capability URL: anyone holding the invoice id can read
  the document while the plan is active.
