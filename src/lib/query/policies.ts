import { isRateLimited, isUnauthenticated } from '../../app/errors';
import { ERROR_CODES, isAppError } from '../../core/shared/errors';

/**
 * Caching and retry policies, kept in one place so they stay reviewable.
 *
 * The app is fully static: every read below hits Appwrite directly from the
 * browser, and Astro never sees the request. So the only lever we have against
 * unnecessary traffic is *how long we trust a response* (staleTime) and *how
 * often we re-ask* (retry). Those two numbers are set per datatype rather than
 * globally, because they answer different questions: how wrong is a stale
 * profile compared with a stale invoice total?
 */

/**
 * Per-datatype cache policy.
 *
 * `staleTime` — how long a response stays fresh. Longer means fewer Appwrite
 * reads, but the UI can show older data.
 *
 * `gcTime` — how long an unused entry is kept in memory. Longer keeps data warm
 * across short navigations, at the cost of holding it in memory.
 */
export const QUERY_POLICIES = {
  // The session is only invalidated by an explicit sign-in/sign-out, and
  // `AuthGate` depends on it never going stale under us.
  session: { staleTime: Number.POSITIVE_INFINITY, gcTime: Number.POSITIVE_INFINITY },
  // Business identity changes rarely and is safe to reuse across pages.
  profile: { staleTime: 5 * 60_000, gcTime: 30 * 60_000 },
  // The org list (and one org's member list) change on invite/accept/remove,
  // all of which invalidate the keys explicitly — this window only absorbs
  // navigation between the switcher and settings. Org membership revocation
  // is enforced server-side per request regardless of this cache.
  orgs: { staleTime: 30_000, gcTime: 5 * 60_000 },
  // Invoice numbering drives the "next number" suggestion, so it may lag a few
  // seconds; a duplicate suggestion is a UX annoyance, not data loss.
  invoiceNumbers: { staleTime: 15_000, gcTime: 5 * 60_000 },
  // The dashboard list is the app's home screen. Mutations invalidate it, so a
  // short window is enough to absorb back-navigation without going stale.
  invoices: { staleTime: 15_000, gcTime: 5 * 60_000 },
  // The free tier's monthly allowance. It changes exactly when an invoice is
  // created (every create invalidates this key), so staleTime only decides how
  // long a returning builder tab may paint its meter from cache — and since a
  // claim is re-checked server-side at save time, a stale meter can never let
  // a save through that the server would refuse.
  invoiceQuota: { staleTime: 30_000, gcTime: 5 * 60_000 },
  // A single invoice is edited and re-read often, but its contents feed a
  // customer-facing document, so it is trusted slightly longer than the list.
  invoice: { staleTime: 30_000, gcTime: 5 * 60_000 },
  // Templates change only in the editor, which invalidates this key on save.
  // Everything else reads them once per invoice and reuses the result.
  templates: { staleTime: 5 * 60_000, gcTime: 30 * 60_000 },
  // The `/templates` page's own paginated grid; invalidated by the same
  // editor saves as the full list above.
  templatesPage: { staleTime: 5 * 60_000, gcTime: 30 * 60_000 },
  // The customer directory is written to on every invoice save, so it is only
  // trusted for a few seconds; a customer added moments ago has to appear in
  // the next picker.
  customers: { staleTime: 5_000, gcTime: 5 * 60_000 },
  // The `/customers` page's own paginated list; same freshness window as the
  // full directory above.
  customersPage: { staleTime: 5_000, gcTime: 5 * 60_000 },
  // The catalog is written to on every invoice save with items ticked for
  // filing, so it is trusted for only a few seconds — a product just saved has
  // to appear in the next picker.
  catalog: { staleTime: 5_000, gcTime: 5 * 60_000 },
  // The `/catalog` page's own paginated list; same freshness window as above.
  catalogPage: { staleTime: 5_000, gcTime: 5 * 60_000 },
  // A bare "how many catalog entries" figure. It changes only when the catalog
  // changes, so it is trusted as long as the invoice list.
  catalogCount: { staleTime: 15_000, gcTime: 5 * 60_000 },
  // A bare "how many customers" figure for the dashboard. It changes only when
  // the directory changes, so it is trusted as long as the invoice list.
  customerCount: { staleTime: 15_000, gcTime: 5 * 60_000 },
  // The dashboard's counter cache. It is revalidated in the background on every
  // mount regardless, so staleTime only decides how long a *returning* visit
  // may paint from the row before re-reading it.
  stats: { staleTime: 30_000, gcTime: 30 * 60_000 },
  // The dashboard's money metrics. Every invoice mutation invalidates the
  // whole prefix, so this window only absorbs back-navigation; the numbers
  // are money, so it is kept as short as the counter cache above.
  dashboardFinance: { staleTime: 30_000, gcTime: 30 * 60_000 },
  // Admin data is only written by another admin session, so it is safe to
  // trust for a while; the "Muat ulang" button forces a refetch when needed.
  adminUsers: { staleTime: 60_000, gcTime: 5 * 60_000 },
  // The action log is append-only and read-only in the UI; a short window
  // absorbs tab switches without re-reading Appwrite.
  adminAudit: { staleTime: 30_000, gcTime: 5 * 60_000 },
  // Support messages arrive from users at any moment; mutations invalidate
  // the key, and the short window keeps new messages prompt on tab switches.
  adminSupport: { staleTime: 30_000, gcTime: 5 * 60_000 },
  // Team membership is fixed for the session's lifetime; a very long staleTime
  // avoids re-hitting Appwrite on every navigation.
  adminMembership: { staleTime: 10 * 60_000, gcTime: 30 * 60_000 },
  // The public business page (`/site/<ownerId>`) changes exactly when the
  // owner edits their profile — and a previewing owner reloads, which refetches
  // regardless of staleness — so this window only decides how long a returning
  // visitor's tab may paint from cache before re-reading.
  publicSite: { staleTime: 30_000, gcTime: 30 * 60_000 },
  // Payment status flips exactly once, driven by the DOKU notification. The
  // result page re-reads on a `refetchInterval` while the order is pending
  // (interval refetches ignore staleness), so staleTime here only decides how
  // long a *returning* visit may paint from cache — one second, effectively
  // "always re-read, but never twice in the same tick". The entry only needs
  // to outlive the tab that was watching the payment.
  paymentStatus: { staleTime: 1_000, gcTime: 5 * 60_000 },
  // Billing state changes exactly when a checkout starts (a pending row
  // appears) or the DOKU notification lands (plan flips) — both of which
  // invalidate this key explicitly, so staleTime only has to absorb ordinary
  // navigation between settings visits.
  portalSession: { staleTime: 30_000, gcTime: 5 * 60_000 },
} as const;

export type QueryPolicyName = keyof typeof QUERY_POLICIES;

export function queryPolicy(name: QueryPolicyName): (typeof QUERY_POLICIES)[QueryPolicyName] {
  return QUERY_POLICIES[name];
}

/**
 * Floor for any query that does not name a policy above. Every query in this
 * app does name one; this exists so an untagged query degrades to something
 * conservative instead of inheriting an arbitrary number.
 */
export const DEFAULT_QUERY_POLICY = {
  staleTime: 15_000,
  gcTime: 5 * 60_000,
} as const;

/** How many times a *transient* query failure is retried before giving up. */
export const MAX_QUERY_RETRIES = 2;

/**
 * Deterministic failures are never worth retrying: the same request will fail
 * the same way, and repeating it only adds load to Appwrite and delays the
 * error the user actually needs to see.
 *
 * Rate limiting is deliberately in this list. Retrying a 429 cannot succeed
 * sooner — it only extends the window during which we are throttled.
 */
const NON_RETRYABLE_CODES = new Set<string>([
  ERROR_CODES.UNAUTHENTICATED,
  ERROR_CODES.FORBIDDEN,
  ERROR_CODES.NOT_FOUND,
  ERROR_CODES.VALIDATION,
  ERROR_CODES.CONFLICT,
  ERROR_CODES.RATE_LIMITED,
  ERROR_CODES.SUSPENDED,
]);

/**
 * Decides whether a failed query is attempted again.
 *
 * Only `network` (the request never completed) and `unknown` (an unrecognised
 * status, typically a 5xx) are treated as transient.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isUnauthenticated(error) || isRateLimited(error)) return false;
  if (isAppError(error) && NON_RETRYABLE_CODES.has(error.code)) return false;
  return failureCount < MAX_QUERY_RETRIES;
}

const RETRY_BASE_DELAY_MS = 1_000;
const RETRY_MAX_DELAY_MS = 8_000;

/**
 * Exponential backoff with half-jitter. The ceiling is predictable for anyone
 * reading the logs, while the random half stops a burst of failures from
 * retrying in lockstep against Appwrite.
 *
 * `random` is injectable so tests stay deterministic.
 */
export function retryDelay(attemptIndex: number, random: () => number = Math.random): number {
  const exponential = Math.min(RETRY_BASE_DELAY_MS * 2 ** attemptIndex, RETRY_MAX_DELAY_MS);
  return exponential / 2 + random() * (exponential / 2);
}
