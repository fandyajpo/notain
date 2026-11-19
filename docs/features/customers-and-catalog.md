# Customers and catalog

Two directories that exist to make writing the next invoice fast. Neither is a
source of truth for an issued document: invoices keep their own copies of the
customer and the priced items.

## Customer directory

Routes: `/customers`, plus the picker inside the invoice builder. Server:
`/api/data/customers`. Domain: `src/core/customer/model.ts`,
`src/core/customer/schema.ts`. Application: `src/app/customers.ts`.

### Identity

Two contacts are the same person only when **both** normalised fields match:

- email: trimmed and lowercased;
- phone: all non-digits removed, a leading `62` folded to `0`
  (`normalizePhone`), so `0812…`, `62812…` and `+62 812…` compare equal.

Two blank fields never match, so two name-only rows can coexist. The practical
rule: the same email with a different phone, or the same phone with a different
email, is treated as a different person.

`customerIdentity` and `mergeCustomer` also exist: the first derives a single
key (email, else phone) for the picker; the second fills only the fields an
existing row left empty.

### Manual operations

- Create validates `name` (1–128), optional `email` (≤255, shape-checked) and
  optional `phone` (≤32, Indonesian mobile pattern). An exact duplicate
  (identical normalised email *and* phone) is rejected with 409.
- Edit patches the row and refreshes `lastUsedAt`.
- Delete removes one row. Invoices are untouched.
- Bulk delete removes up to 20 rows per server call; the client batches larger
  selections (`bulkDeleteAll`).
- Merge (one target, several sources) writes the chosen field values onto the
  target first, then deletes the sources. A failure during cleanup leaves a
  duplicate rather than losing data.
- Search, filter and pagination are server-side, through the org-scoped data
  endpoint (`name` equality, `name` search, `name` ordering, cursor paging).

### Remember on invoice save

After a successful invoice write, the builder calls `rememberCustomer` and
ignores failures.

- Nothing is recorded when the draft has no customer name.
- A match is looked for in two steps: the same identity (email *and* phone,
  normalised), then the same name ignoring case. So "Budi" with a new number
  updates the existing Budi row instead of creating a second one.
- A non-empty field in the draft overwrites the stored value; an empty field
  never erases stored data. `lastUsedAt` is stamped from the invoice save.

The directory is read once per call and matched in memory; a workspace has at
most a few hundred customers, so this avoids per-field server lookups.

### Import and export

`customer-import.tsx` reads a spreadsheet through `src/core/excel/`:

- the name header is recognised as `Nama` or `name`; email and phone accept the
  documented aliases;
- blank rows are skipped;
- each row is validated with the customer schema, and failures keep the
  spreadsheet's row number in the message;
- rows are deduplicated **within the file** by `isSameCustomer` — identical
  email and phone — and a later duplicate merges into the earlier one without
  overwriting filled fields;
- each surviving row is matched against the stored directory by the same rule,
  then created or merged, with five writes in flight at a time.

Export writes CSV or XLSX for the selection or the whole directory, with formula
escaping on every text cell.

**Known comment mismatch:** the docstring above `importCustomers` says identity
is "email OR phone" while `isSameCustomer` requires both. The code is
authoritative: same email with a different phone does not match on import. This
is listed in `audit/verification-2026-11.md`.

### Failure modes

- Missing name, invalid email or phone → 400 with field errors.
- Duplicate exact identity → 409 on manual create.
- Unknown or foreign row id → 404 (delete is idempotent).
- A provider outage during import leaves the rows that already succeeded; the
  list refetches and the user sees what survived.

## Product and service catalog

Route: `/catalog`, plus the picker in the invoice builder. Server:
`/api/data/catalog`. Domain: `src/core/catalog/model.ts`. Application:
`src/app/catalog.ts`.

### Shape

`{ id, name ≤200, kind: 'barang' | 'jasa', unit ≤16, unitPrice 0…10¹²,
lastUsedAt }`. A zero price means "no price configured" — the invoice picker
still copies the row, and public pages render "Hubungi" instead of Rp 0.

### Identity

Names are compared by `catalogKey`: trimmed, lowercased, repeated whitespace
collapsed. "Nasi Goreng" and "nasi  goreng" are the same product. A manual
create with an existing key is rejected with 409.

### Catalog × invoice

- Picking a catalog entry copies name, unit and price into a line item.
- On save, every item whose "Simpan ke katalog" box is ticked (the default) is
  filed back: a matching key refreshes unit and price, keeps the stored name and
  `kind`, and a miss creates a new entry. `kind` always comes from the stored row
  because a line item carries no kind.
- Duplicate names inside one save collapse to a single entry.
- Filing is non-fatal: a failed write never fails the invoice save.

### Operations

Create, edit, delete, bulk delete (20 per call), export, search, and pagination
mirror the customer directory. The org-scoped endpoint supplies filtering and
ordering; the page keeps the full list (picker) separate from the paginated view.

### Failure modes

- Blank name, unknown kind, over-long unit, negative or non-integer price → 400.
- Duplicate normalised name → 409.
- Foreign row id → 404; bulk delete skips it.
- A zero price is valid and meaningful, not an error.

## Picker behaviour

`src/components/shared/picker-options.ts` derives customer and product
suggestions. Customers come from the directory; when the directory is empty
(older accounts), the invoice-history projection is the fallback. Product
suggestions merge the catalog with what the history shows. ADR 0003 records the
reasoning.

The advertised options are select-only — the picker fills fields; it never
creates a row behind the user's back.

## Files

- `src/core/customer/{model,schema}.ts`, `src/core/catalog/{model,schema}.ts`
- `src/core/excel/{csv,customers,catalog,invoices,index}.ts`
- `src/app/{customers,catalog}.ts`, `src/app/data-api.ts`
- `src/components/react/customers/{customers-app,customer-import}.tsx`
- `src/components/react/catalog/catalog-app.tsx`
- `functions/api/data/[resource].ts` (resources `customers`, `catalog`)
- `tables`: `customers`, `catalog` — see `docs/data-model.md`
