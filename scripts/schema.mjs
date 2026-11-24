/**
 * The Appwrite schema this repository owns, as data.
 *
 * Before this file, adding one column meant copying a 200-line `ensure-*.mjs`
 * script and editing its table spec: twelve of them existed, ~2,600 lines that
 * differed only in the columns they listed. Now a new column is one line here,
 * and `npm run db:ensure` applies every table, column and index in one pass.
 *
 * ## How to read an entry
 *
 *   create: true        the table is ours end to end — created when missing.
 *   create: false       a table whose full column set lives in the Appwrite
 *                       Console (invoices, templates, customers): only the
 *                       columns and indexes listed here are ensured, and a
 *                       missing table is reported, never invented.
 *   documentSecurity    row permissions are what makes per-owner reads work;
 *                       with it off Appwrite ignores them and every list
 *                       answers 401, which looks exactly like a lapsed session.
 *                       Always true, always re-asserted.
 *   permissions         what a *session* — not the API key — may do at table
 *                       level. `[]` means API-key only, which is the tenancy
 *                       rule: every tenant read and write goes through a Pages
 *                       Function that checks membership first.
 *   strings/integers    nullable columns (`required: false`); `size` is the
 *                       Appwrite character cap, `min`/`max` the integer range.
 *   indexes             declared in query order — the equality columns first,
 *                       then the sort/prefix attribute — matching the shapes in
 *                       `docs/data-model.md`.
 *
 * Column sizes only matter when a column is *created*; an existing column keeps
 * the size it was made with, so re-running never rewrites data.
 *
 * The provisioning pass is idempotent and additive: it creates what is missing,
 * re-asserts permissions and row security, and never drops or rewrites anything.
 */

/** Every table the app reads, in provisioning order. */
export const TABLES = [
  {
    id: 'organizations',
    name: 'Organizations',
    summary: 'Tenancy root: plan, owner and the public business identity.',
    create: true,
    documentSecurity: true,
    permissions: [],
    strings: [
      { key: 'name', size: 128 },
      { key: 'ownerId', size: 64 },
      // Mirrors payments.plan: a whole-word plan id, never a price.
      { key: 'plan', size: 16 },
      { key: 'planExpiresAt', size: 32 },
      { key: 'businessType', size: 64 },
      { key: 'createdAt', size: 32 },
      // The contact identity (added by the profile→organization split).
      { key: 'slug', size: 64 },
      { key: 'email', size: 320 },
      { key: 'phone', size: 32 },
      { key: 'website', size: 320 },
      { key: 'address', size: 512 },
      { key: 'taxId', size: 64 },
      { key: 'logoFileId', size: 64 },
    ],
    integers: [],
    indexes: [
      { key: 'byOwner', type: 'key', attributes: ['ownerId'], orders: ['asc'] },
      // Unique on purpose: the slug is the org's public-URL key.
      { key: 'bySlug', type: 'unique', attributes: ['slug'], orders: ['asc'] },
    ],
  },
  {
    id: 'memberships',
    name: 'Memberships',
    summary: 'Who belongs to which organization; the access gate itself.',
    create: true,
    documentSecurity: true,
    permissions: [],
    strings: [
      { key: 'orgId', size: 64 },
      // '' until the invitation is accepted — the acceptance query matches
      // inviteEmail instead, so a pending row still has a stable identity.
      { key: 'userId', size: 64 },
      { key: 'role', size: 16 },
      { key: 'status', size: 16 },
      { key: 'inviteEmail', size: 320 },
      { key: 'invitedBy', size: 64 },
      { key: 'createdAt', size: 32 },
    ],
    integers: [],
    indexes: [
      { key: 'byOrg', type: 'key', attributes: ['orgId'], orders: ['asc'] },
      { key: 'byUser', type: 'key', attributes: ['userId'], orders: ['asc'] },
      // One row per (org, email): a re-invite refreshes the pending row instead
      // of stacking duplicates, and two admins cannot both win.
      {
        key: 'byOrgEmail',
        type: 'unique',
        attributes: ['orgId', 'inviteEmail'],
        orders: ['asc', 'asc'],
      },
    ],
  },
  {
    id: 'invoices',
    name: 'Invoices',
    summary: 'Created in the Console; this ensures the later columns and every index.',
    // The base column set predates this repository and lives in the Console.
    create: false,
    documentSecurity: true,
    permissions: [],
    strings: [
      { key: 'orgId', size: 64 },
      // '' is a real value: the "Belum dikirim" bucket, not an absence.
      { key: 'status', size: 16 },
      { key: 'customerEmail', size: 255 },
      // Business-specific key-value facts, serialized like `items`.
      { key: 'details', size: 100_000 },
      { key: 'paymentProofKey', size: 128 },
      { key: 'paymentProofUploadedAt', size: 32 },
    ],
    integers: [],
    indexes: [
      // List: equal(orgId) + orderDesc(date) + orderDesc($createdAt).
      { key: 'org_date', type: 'key', attributes: ['orgId', 'date'], orders: ['asc', 'asc'] },
      // Template filter: equal(orgId) + equal(templateId) + orderDesc(date).
      {
        key: 'org_template_date',
        type: 'key',
        attributes: ['orgId', 'templateId', 'date'],
        orders: ['asc', 'asc', 'asc'],
      },
      // Status filter and the dashboard's per-status counts.
      {
        key: 'org_status_date',
        type: 'key',
        attributes: ['orgId', 'status', 'date'],
        orders: ['asc', 'asc', 'asc'],
      },
      // Number allocation: equal(orgId) + startsWith(invoiceNumber, 'INV-YYYY-').
      {
        key: 'org_invoiceNumber',
        type: 'key',
        attributes: ['orgId', 'invoiceNumber'],
        orders: ['asc', 'asc'],
      },
      // One invoice per (org, number), enforced by the database: the backstop
      // behind the deterministic document ids.
      {
        key: 'org_invoiceNumber_unique',
        type: 'unique',
        attributes: ['orgId', 'invoiceNumber'],
        orders: ['asc', 'asc'],
      },
      // Legacy owner-scoped twins, kept while pre-tenancy rows exist.
      { key: 'owner_date', type: 'key', attributes: ['ownerId', 'date'], orders: ['asc', 'asc'] },
      {
        key: 'owner_template_date',
        type: 'key',
        attributes: ['ownerId', 'templateId', 'date'],
        orders: ['asc', 'asc', 'asc'],
      },
      {
        key: 'owner_status_date',
        type: 'key',
        attributes: ['ownerId', 'status', 'date'],
        orders: ['asc', 'asc', 'asc'],
      },
      {
        key: 'owner_invoiceNumber',
        type: 'key',
        attributes: ['ownerId', 'invoiceNumber'],
        orders: ['asc', 'asc'],
      },
      {
        key: 'owner_invoiceNumber_unique',
        type: 'unique',
        attributes: ['ownerId', 'invoiceNumber'],
        orders: ['asc', 'asc'],
      },
      // Query.search is fulltext-only: without these, search errors out.
      {
        key: 'invoice_number_fulltext',
        type: 'fulltext',
        attributes: ['invoiceNumber'],
        orders: ['asc'],
      },
      {
        key: 'customer_name_fulltext',
        type: 'fulltext',
        attributes: ['customerName'],
        orders: ['asc'],
      },
      { key: 'items_fulltext', type: 'fulltext', attributes: ['items'], orders: ['asc'] },
    ],
  },
  {
    id: 'templates',
    name: 'Templates',
    summary: 'Created in the Console; this ensures businessType and the indexes.',
    create: false,
    documentSecurity: true,
    permissions: [],
    strings: [{ key: 'businessType', size: 64 }],
    integers: [],
    indexes: [
      { key: 'org', type: 'key', attributes: ['orgId'], orders: ['asc'] },
      { key: 'owner', type: 'key', attributes: ['ownerId'], orders: ['asc'] },
    ],
  },
  {
    id: 'customers',
    name: 'Customers',
    summary: 'Created in the Console; this ensures the email column and the indexes.',
    create: false,
    documentSecurity: true,
    permissions: [],
    strings: [{ key: 'email', size: 255 }],
    integers: [],
    indexes: [
      { key: 'org_name', type: 'key', attributes: ['orgId', 'name'], orders: ['asc', 'asc'] },
      { key: 'owner_name', type: 'key', attributes: ['ownerId', 'name'], orders: ['asc', 'asc'] },
    ],
  },
  {
    id: 'catalog',
    name: 'Catalog',
    summary: 'Saved barang/jasa per organization, for the invoice item picker.',
    create: true,
    documentSecurity: true,
    // `['create("users")']` before multi-tenancy; the org-columns pass emptied
    // it so every write goes through /api/data/catalog with the API key.
    permissions: [],
    strings: [
      { key: 'orgId', size: 64 },
      { key: 'ownerId', size: 64 },
      { key: 'name', size: 200 },
      { key: 'kind', size: 16 },
      { key: 'unit', size: 16 },
      { key: 'lastUsedAt', size: 32 },
    ],
    // 0 means "no price configured" and renders as "Hubungi" on public pages.
    integers: [{ key: 'unitPrice', min: 0, max: 1_000_000_000_000, default: 0 }],
    indexes: [
      { key: 'org_name', type: 'key', attributes: ['orgId', 'name'], orders: ['asc', 'asc'] },
      { key: 'owner_name', type: 'key', attributes: ['ownerId', 'name'], orders: ['asc', 'asc'] },
    ],
  },
  {
    id: 'stats',
    name: 'Stats',
    summary: 'Dashboard counter cache: one row per organization, id = the org id.',
    create: true,
    documentSecurity: true,
    permissions: [],
    strings: [
      { key: 'orgId', size: 64 },
      { key: 'ownerId', size: 64 },
    ],
    integers: [
      { key: 'totalInvoices', min: 0, max: 10_000_000, default: 0 },
      { key: 'sentCount', min: 0, max: 10_000_000, default: 0 },
      { key: 'paidCount', min: 0, max: 10_000_000, default: 0 },
      { key: 'voidCount', min: 0, max: 10_000_000, default: 0 },
      { key: 'totalCustomers', min: 0, max: 10_000_000, default: 0 },
      { key: 'totalTemplates', min: 0, max: 10_000_000, default: 0 },
    ],
    indexes: [
      { key: 'org', type: 'key', attributes: ['orgId'], orders: ['asc'] },
      { key: 'owner', type: 'key', attributes: ['ownerId'], orders: ['asc'] },
    ],
  },
  {
    id: 'payments',
    name: 'Payments',
    summary: 'DOKU checkout orders; the row id IS the invoice number.',
    create: true,
    documentSecurity: true,
    permissions: [],
    strings: [
      { key: 'orgId', size: 64 },
      { key: 'ownerId', size: 64 },
      { key: 'plan', size: 16 },
      { key: 'currency', size: 8 },
      { key: 'status', size: 16 },
      { key: 'invoiceNumber', size: 64 },
      { key: 'checkoutUrl', size: 1024 },
      { key: 'dokuExpiredAt', size: 32 },
      { key: 'paidAt', size: 32 },
      { key: 'createdAt', size: 32 },
      // Checkout freezes the subscription baseline so racing settlements
      // converge on the same expiry instead of compounding a renewal.
      { key: 'planAtCheckout', size: 16 },
      { key: 'planExpiresAtSnapshot', size: 32 },
      // Recoverable activation: a fixed target plus retry state, so a transient
      // organization write cannot lose a paid subscription.
      { key: 'activationStatus', size: 16 },
      { key: 'activationPlan', size: 16 },
      { key: 'activationExpiresAt', size: 32 },
      { key: 'activationRetryAfter', size: 32 },
      { key: 'activationError', size: 64 },
    ],
    // Whole IDR; 12 digits is DOKU's documented max order.amount length.
    integers: [{ key: 'amount', min: 0, max: 999_999_999_999 }],
    indexes: [
      // The webhook looks the row up by DOKU's invoice_number; uniqueness also
      // guarantees two checkouts can never share an order id.
      {
        key: 'byInvoiceNumber',
        type: 'unique',
        attributes: ['invoiceNumber'],
        orders: ['asc'],
      },
      // "Does this owner already have a pending checkout?"
      {
        key: 'byOwnerStatus',
        type: 'key',
        attributes: ['ownerId', 'status'],
        orders: ['asc', 'asc'],
      },
      // Per-org billing views: the plan lives on the organization.
      {
        key: 'byOrgStatus',
        type: 'key',
        attributes: ['orgId', 'status'],
        orders: ['asc', 'asc'],
      },
    ],
  },
  {
    id: 'audit_logs',
    name: 'Audit Logs',
    summary: 'Admin action log, read by the admins team only.',
    create: true,
    documentSecurity: true,
    permissions: [],
    strings: [
      { key: 'actorId', size: 64 },
      { key: 'actorEmail', size: 128 },
      { key: 'action', size: 64 },
      { key: 'targetType', size: 64 },
      { key: 'targetId', size: 128 },
      { key: 'detail', size: 2048 },
      { key: 'orgId', size: 64 },
      { key: 'createdAt', size: 32 },
    ],
    integers: [],
    indexes: [
      { key: 'byCreatedAt', type: 'key', attributes: ['createdAt'], orders: ['desc'] },
      { key: 'byOrg', type: 'key', attributes: ['orgId'], orders: ['asc'] },
    ],
  },
  {
    id: 'support',
    name: 'Support',
    summary: 'Public contact messages, written anonymously, read by admins.',
    create: true,
    documentSecurity: true,
    permissions: [],
    strings: [
      { key: 'name', size: 128 },
      { key: 'email', size: 128 },
      { key: 'subject', size: 128 },
      { key: 'message', size: 4000 },
      { key: 'createdAt', size: 32 },
      { key: 'source', size: 16 },
      { key: 'solvedAt', size: 32 },
      { key: 'solvedBy', size: 128 },
    ],
    integers: [],
    indexes: [{ key: 'byCreatedAt', type: 'key', attributes: ['createdAt'], orders: ['desc'] }],
  },
  {
    id: 'password_resets',
    name: 'Password resets',
    summary: 'Server-only reset tokens: one row per account, token hash only.',
    create: true,
    documentSecurity: true,
    permissions: [],
    strings: [
      // SHA-256 hex of the emailed token. The token itself is never stored, so
      // a dump of this table cannot be replayed.
      { key: 'tokenHash', size: 64 },
      { key: 'userId', size: 36 },
      { key: 'expiresAt', size: 32 },
      { key: 'origin', size: 128 },
    ],
    integers: [],
    indexes: [
      // The confirm endpoint knows the token, not the account: redemption is a
      // lookup, not a scan.
      { key: 'byTokenHash', type: 'key', attributes: ['tokenHash'], orders: ['asc'] },
    ],
  },
];

/**
 * Tables this file deliberately does not describe.
 *
 * `profiles` holds two id spaces (account identity at `profiles/<userId>` and
 * the legacy letterhead at `profiles/<orgId>`) and its permissions are hardened
 * row by row — see `scripts/harden-profile-permissions.mjs`. `userProfiles` and
 * `letterheads` from `docs/MULTI-ORG-REFACTOR.md` were folded back into
 * `profiles` and are no longer written.
 */
export const UNMANAGED = ['profiles'];
