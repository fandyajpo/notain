import { freeInvoiceBudget, monthKey } from '../../src/core/billing/plans';
import { getRow, listRows, type ListQuery, type TableAuth } from './rows';
import type { Env } from './types';

/**
 * The free tier's monthly invoice allowance, enforced server-side.
 *
 * Since multi-tenancy both halves of the question are ORGANIZATION-scoped:
 * the plan lives on `organizations/<orgId>` (billing is per org), and the
 * invoices counted are the ones stamped with that orgId. One membership gate
 * (`requireOrg`) precedes every call, so "this org's allowance" can only ever
 * be asked by one of its own members.
 *
 * Invoice writes run through `POST /api/data/invoices` (the org-gated data
 * endpoint), but that endpoint deliberately does not re-count the month on
 * every save: the count is a paginated walk, and billing it to each save would
 * multiply read quota for a check the builder performs immediately before
 * anyway (see `docs/quota.md`). Instead the builder asks for a claim
 * immediately before saving, and this module is what answers that question:
 * how many invoices did this organization create this calendar month, and is
 * there room for one more?
 *
 * What that buys, stated honestly:
 *
 * - The limit is real for everyone using the product: the meter and the save
 *   button both read this answer, so a free org past its tenth invoice cannot
 *   create an eleventh through the app.
 * - It is not a hard boundary against a hand-rolled client: the create
 *   endpoint itself does not re-check the count, so a caller who skips the
 *   claim can still write a row. Closing that would mean counting the month
 *   inside every invoice create — a per-save paginated walk against Appwrite
 *   read quota — which this project has deliberately not paid for.
 *
 * Both endpoints are cheap by construction: one organization row (document id
 * == orgId) plus one projected list page of `$createdAt` strings.
 */

/** What both endpoints answer with. `remaining: null` means unlimited. */
export type InvoiceQuota = {
  /** Invoices still creatable this month, or `null` for a paid plan. */
  remaining: number | null;
  /** Invoices created in the current calendar month. Always reported. */
  used: number;
  /** The free-tier limit the copy quotes. Never a secret. */
  limit: number;
  /** ISO instant at which the month (and therefore the counter) rolls over. */
  resetsAt: string;
};

/**
 * How many invoice rows one list page fetches. Appwrite caps a page at 100,
 * so this is also the page size; the walk below uses it as the "is there
 * more?" test (a full page means maybe, a short page means no).
 */
const PAGE_SIZE = 100;

/**
 * Hard ceiling on pages walked while counting. A free account is capped at a
 * handful of invoices a month, so this exists only so a bug — or a paid
 * account's whole history — can never turn into an unbounded request loop.
 * At 100 rows a page it covers ten thousand invoices.
 */
const MAX_PAGES = 100;

/**
 * Counts the invoices one owner created per calendar month.
 *
 * Returns `null` when Appwrite refuses or a page dies — deliberately *not*
 * `0`: "the provider failed" and "this account made no invoices" are different
 * answers, and treating an outage as zero would let a free account create
 * unlimited invoices during an Appwrite incident.
 *
 * Only `$createdAt` and `date` are selected, so a page is 100 short strings
 * rather than 100 full invoices (the rich-text sections alone are the heavy
 * part of a row). The sort rides the existing `org_date` index
 * (equal orgId + orderDesc date + orderDesc $createdAt) rather than asking
 * Appwrite to sort on an unindexed column.
 */
export async function monthlyInvoiceCounts(
  auth: TableAuth,
  orgId: string,
  env?: Env,
): Promise<Record<string, number> | null> {
  const queries: ListQuery[] = [
    { method: 'equal', attribute: 'orgId', values: [orgId] },
    { method: 'select', values: ['date', '$createdAt'] },
    // Canonical order form: `attribute` is where Appwrite reads the sort
    // column; the `values` variant falls back to the sequence column.
    { method: 'orderDesc', attribute: 'date', values: [] },
    { method: 'orderDesc', attribute: '$createdAt', values: [] },
    { method: 'limit', values: [PAGE_SIZE] },
  ];

  const counts: Record<string, number> = {};
  let cursorAfter: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const rows = await listRows(
      auth,
      'invoices',
      cursorAfter ? [...queries, { method: 'cursorAfter', values: [cursorAfter] }] : queries,
      env,
    );
    if (rows === null) return null;

    for (const row of rows) {
      const createdAt = Date.parse(typeof row.$createdAt === 'string' ? row.$createdAt : '');
      if (!Number.isFinite(createdAt)) continue;
      const key = monthKey(new Date(createdAt));
      counts[key] = (counts[key] ?? 0) + 1;
    }

    if (rows.length < PAGE_SIZE) break;
    const last = rows.at(-1);
    if (!last) break;
    cursorAfter = last.$id;
  }

  return counts;
}

/** The organization's row (plan lives there), or `null` when unreadable. */
async function readOrg(
  auth: TableAuth,
  orgId: string,
  env?: Env,
): Promise<Record<string, unknown> | null> {
  // `organizations` documents are keyed by org id, so this is one id lookup —
  // the same shape the checkout and invoice-link Functions use, not a query.
  return getRow(auth, 'organizations', orgId, env);
}

/** Every quota read or claim goes through this one place. */
async function resolve(
  auth: TableAuth,
  orgId: string,
  env: Env | undefined,
  now: Date,
): Promise<{ quota: InvoiceQuota; withinLimit: boolean } | null> {
  const [org, counts] = await Promise.all([
    readOrg(auth, orgId, env),
    monthlyInvoiceCounts(auth, orgId, env),
  ]);
  // A missing org row is a gate that already passed but whose org was deleted
  // mid-flight, and an unreadable count is an outage — both fail closed here
  // rather than inventing a zero.
  if (org === null || counts === null) return null;

  const budget = freeInvoiceBudget(
    {
      plan: typeof org.plan === 'string' ? org.plan : 'free',
      planExpiresAt: typeof org.planExpiresAt === 'string' ? org.planExpiresAt : null,
      monthlyCounts: counts,
    },
    now,
  );

  return {
    quota: {
      remaining: budget.remaining,
      used: budget.used,
      limit: budget.limit,
      resetsAt: budget.resetsAt.toISOString(),
    },
    withinLimit: budget.remaining === null || budget.remaining > 0,
  };
}

/** `GET /api/quota/invoices` — the number the builder's meter renders. */
export async function readInvoiceQuota(
  auth: TableAuth,
  orgId: string,
  env?: Env,
  now: Date = new Date(),
): Promise<InvoiceQuota | null> {
  const resolved = await resolve(auth, orgId, env, now);
  return resolved?.quota ?? null;
}

/**
 * `POST /api/quota/invoices` — check the allowance and report the answer.
 *
 * A "claim", not an increment: the check is read-only, because counting a
 * write against the month before the invoice exists would charge a user for a
 * save that then failed validation. Two tabs saved in the same instant can
 * both see `10 dari 10` and both write an eleventh row — a handful of extra
 * invoices a month at the seams, which is a price worth paying to keep the
 * write path exactly where it is.
 */
export async function claimInvoiceQuota(
  auth: TableAuth,
  orgId: string,
  env?: Env,
  now: Date = new Date(),
): Promise<{ ok: true; quota: InvoiceQuota } | { ok: false; quota: InvoiceQuota | null }> {
  const resolved = await resolve(auth, orgId, env, now);
  if (resolved === null) return { ok: false, quota: null };
  return resolved.withinLimit
    ? { ok: true, quota: resolved.quota }
    : { ok: false, quota: resolved.quota };
}

/** Message the 402 carries — the one place this copy is written down. */
export const INVOICE_QUOTA_MESSAGE =
  'Kuota invoice gratis bulan ini sudah penuh. Tunggu tanggal berikutnya atau upgrade ke Pro untuk membuat invoice tanpa batas.';
