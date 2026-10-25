/**
 * The trusted plan catalog for paid checkout.
 *
 * Amounts live here — never in the client request. The checkout Pages
 * Function looks the price up by plan id, so a tampered request body can
 * only ever pick *which* plan is bought, never *for how much*. The pricing
 * page renders display copy from the same numbers, so the two can't drift.
 *
 * Plan ids intentionally match `PLAN_VALUES` in `core/profile/model.ts`
 * (`profiles.plan`), which is what a successful payment upgrades.
 */

export const PAID_PLANS = {
  pro: { id: 'pro', name: 'Pro', priceIdr: 49_000 },
  business: { id: 'business', name: 'Business', priceIdr: 99_000 },
} as const;

export type PaidPlan = keyof typeof PAID_PLANS;

/** Order id prefix — also the human-readable start of DOKU's invoice_number. */
export const INVOICE_PREFIX = 'NOTAIN';

/** A paid checkout for the free tier does not exist: free never touches payment. */
export function isPaidPlan(value: unknown): value is PaidPlan {
  return typeof value === 'string' && value in PAID_PLANS;
}

export function planAmount(plan: PaidPlan): number {
  return PAID_PLANS[plan].priceIdr;
}

/**
 * The free tier's allowance: how many invoices an account may *create* per
 * calendar month before the builder asks them to upgrade.
 *
 * This is the number every surface quotes — the pricing card, the invoice
 * builder's meter, `freeInvoiceBudget` below — so none of them can drift.
 * Like {@link PAID_PLANS} it is a policy constant, not a secret: it ships in
 * the browser bundle either way, and the enforcement point reads it from this
 * same module rather than restating it.
 */
export const FREE_PLAN_LIMITS = { invoicesPerMonth: 10 } as const;

/**
 * Free-tier budget for one account, computed from the rows that already exist.
 *
 * `monthlyCounts` is the number of invoices created per month for the last few
 * months (`YYYY-MM` key → count); the caller fetches it from the count
 * endpoint, so this function stays pure and unit-testable. The window is a
 * calendar month rather than a rolling 30 days: it is the unit the pricing
 * copy promises ("per bulan"), it needs no stored timestamps of its own, and
 * a count query can ask Appwrite to compute it instead of shipping rows.
 *
 * Both paid tiers return `remaining: null` — unlimited — so a caller that
 * checks `remaining === null` never has to know which plan it is on.
 */
export function freeInvoiceBudget(
  input: {
    readonly plan: string | null | undefined;
    readonly planExpiresAt?: string | null;
    readonly monthlyCounts: Readonly<Record<string, number>>;
  },
  now: Date = new Date(),
): { remaining: number | null; used: number; limit: number; resetsAt: Date } {
  const limit = FREE_PLAN_LIMITS.invoicesPerMonth;
  const resetsAt = startOfNextMonth(now);
  if (isSubscriptionActive(input.plan, input.planExpiresAt, now)) {
    return { remaining: null, used: 0, limit, resetsAt };
  }

  const used = input.monthlyCounts[monthKey(now)] ?? 0;
  return { remaining: Math.max(0, limit - used), used, limit, resetsAt };
}

/** The first instant of the month after `date`, in local time. */
function startOfNextMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

/** `YYYY-MM` for `date` in local time — the key both sides count under. */
export function monthKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
}

/** free < pro < business — used to block pointless downgrades at checkout. */
export function planRank(plan: string): number {
  if (plan === 'business') return 2;
  if (plan === 'pro') return 1;
  return 0;
}

/**
 * One paid period. Fixed 30 days rather than calendar months: the product
 * sells "/bulan" subscriptions, and a fixed window keeps renewal math exact
 * (extend by one period) without month-length edge cases.
 */
export const PLAN_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The single entitlement rule: does a stored `(plan, planExpiresAt)` pair
 * grant paid access right now? Free is never active; a paid plan with no
 * expiry is treated as lifetime (the admin panel can clear the date to grant
 * permanent access); anything else compares the stored date to `now`.
 *
 * Used on both sides of the wire — the portal and invoice-link Functions
 * enforce it server-side, the dashboard's UI gates paint from it client-side
 * — so a paid plan can never mean two different things.
 */
export function isSubscriptionActive(
  plan: string | null | undefined,
  planExpiresAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (plan !== 'pro' && plan !== 'business') return false;
  if (planExpiresAt == null || planExpiresAt === '') return true;
  const expiresMs = Date.parse(planExpiresAt);
  return Number.isFinite(expiresMs) && expiresMs > now.getTime();
}

/**
 * Expiry after a verified payment.
 *
 * Renewing the plan that is still active extends from its current expiry, so
 * paying early never loses paid days. Anything else (first purchase, upgrade,
 * expired plan) starts a fresh period at the payment time.
 */
export function computePlanExpiry(input: {
  currentPlan: string;
  currentExpiresAt: string | null;
  newPlan: PaidPlan;
  paidAt: Date;
}): Date {
  const paidAtMs = input.paidAt.getTime();
  if (input.currentPlan === input.newPlan && input.currentExpiresAt !== null) {
    const currentMs = Date.parse(input.currentExpiresAt);
    if (Number.isFinite(currentMs) && currentMs > paidAtMs) {
      return new Date(currentMs + PLAN_PERIOD_MS);
    }
  }
  return new Date(paidAtMs + PLAN_PERIOD_MS);
}

/**
 * Builds DOKU's `order.invoice_number` for one checkout.
 *
 * Max 30 characters (credit-card acquirer limit, the tightest of the
 * documented constraints), alphanumeric plus dashes only. Uniqueness comes
 * from the random hex; the timestamp prefix keeps rows sortable by eye.
 * `randomHex` is injectable for tests.
 */
function cryptoRandomHex(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

export function makeInvoiceNumber(
  plan: PaidPlan,
  options: { now?: Date; randomHex?: () => string } = {},
): string {
  const now = options.now ?? new Date();
  const time = now.getTime().toString(36).toUpperCase();
  const random = options.randomHex ?? cryptoRandomHex;
  const randomHex = random();
  const initial = plan === 'business' ? 'B' : 'P';
  // NOTAIN-P-<time36>-<hex8> ≤ 27 chars.
  return `${INVOICE_PREFIX}-${initial}-${time}-${randomHex}`;
}
