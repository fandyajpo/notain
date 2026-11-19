# Billing and quota

Plans, what each plan unlocks, how a paid order becomes an active plan, and the
free tier's monthly invoice allowance. The money path is the most safety-critical
code in the repository, so this document describes it in more detail than the
rest.

Current status: the DOKU integration is **sandbox only**. The endpoint is
hardcoded to `api-sandbox.doku.com`, and nothing in this build can reach a
production payment. Every statement below is from source; none was exercised
against DOKU.

## Plans

Defined in `src/core/billing/plans.ts` (prices and periods) and
`src/core/billing/plan-benefits.ts` (copy):

- **Free** — no payment, no expiry. Ten new invoices per calendar month per
  organization. One organization owned.
- **Pro** — Rp 49.000 per 30 days. Unlimited invoices while active, public
  invoice links, several organizations owned.
- **Business** — Rp 99.000 per 30 days in the catalog, announced as "Segera
  hadir" (coming soon). Checkout refuses it; an admin can still set it manually.
  Its benefit copy promises an API key, webhooks and higher API limits, none of
  which exist (`/api-keys` is a placeholder).

Prices are looked up on the server by plan id. A client that sends a different
amount has no effect on what DOKU charges.

## Entitlement rule

`isSubscriptionActive(plan, planExpiresAt, now)` is the single rule, used by both
the client and the server:

- free is never active;
- pro or business with no expiry is active (lifetime, admin-managed);
- otherwise active only while `planExpiresAt` is in the future.

An expired paid plan behaves exactly like free. `planChoice` in
`plan-availability.ts` derives the upgrade and downgrade options from the same
rule: a higher tier is always purchasable, a lower one only after the current
term lapses.

Entitlement lives on the **organization** row. Two memberships in two
organizations have independent plans.

## Checkout

`POST /api/payments/checkout` (owner only) follows this sequence:

1. Refuse `business` before any authentication or provider call.
2. Require an owner of the organization (403 for members).
3. Refuse with 409 if the organization's active plan outranks the requested one.
4. Apply the local fences first: a per-user `checkout` rate limit (10/hour), and
   the DOKU circuit breaker (503 while open).
5. Look for an existing pending row for this organization and plan. A pending
   row with a checkout URL that has not expired is reused, so the same page comes
   back. A row still being created, within a two-minute grace period, answers 409
   "sedang diproses". Anything else is retired (`expired` or `failed`).
6. Create the payment row **before** calling DOKU. Its id is
   `deterministicInvoiceNumber(plan, orgId, month)` — `NOTAIN-P-<16 hex org><YYMM>`,
   30 characters or fewer. If that id is taken, the row is read: a live pending
   checkout is reused or the caller stands down, a paid or expired row from the
   same month falls back to a random id in a separate space so renewals work.
7. Store `planAtCheckout` and `planExpiresAtSnapshot`, the organization's plan
   and expiry at this moment. Settlement computes the new expiry from this
   frozen baseline.
8. Sign and send the order to DOKU's checkout endpoint (20-second deadline)
   with the callback URL `/payment/result?invoice=…` and the notification URL
   `/api/payments/doku-notify`. The order expires after 60 minutes.
9. Store the returned checkout URL and expiry, and return the URL.

A failed DOKU call marks the row `failed` and writes a `payment.checkout.failed`
audit row. A 5xx counts toward the breaker; a 4xx is a definitive rejection of
this order and does not.

## Settlement

There is one state machine, `src/core/billing/payment-state.ts` (`decideTransition`),
and one executor, `functions/_lib/payment-settle.ts` (`settlePayment`). Two entry
points feed it:

- the **signed webhook**, `POST /api/payments/doku-notify`;
- the **reconciliation probe**, run from `GET /api/payments/status` while a row
  is pending.

Transitions on a row's status:

- `pending` + verified `SUCCESS` with a matching amount → `paid` → activation;
- `pending` + `EXPIRED` → `expired`;
- `paid` + `SUCCESS` again → duplicate: acknowledged, no change, but a row whose
  activation never completed is retried;
- `FAILED` → ignored; DOKU's guidance is that a customer may switch payment
  method inside one checkout, so a failed channel is not a failed order;
- any SUCCESS with an amount that differs from the stored amount → ignored and
  audited as `payment.amount-mismatch`.

Activation is a separate persisted stage:

1. The row becomes `paid` with `paidAt` and `activationStatus: 'pending'`.
2. The target plan and expiry are frozen onto the row:
   `activationPlan` and `activationExpiresAt`. The expiry is
   `computePlanExpiry` applied to the frozen baseline: renewing the active same
   plan extends from its current expiry by 30 days; anything else starts 30 days
   from the payment time.
3. The organization is patched with that plan and expiry, unless it already
   covers the target.
4. The row is marked `activationStatus: 'active'`.
5. An audit row `payment.paid` is written.

If step 3 or 4 fails, the row keeps the frozen target, `activationError` says
why, and `activationRetryAfter` is 15 seconds ahead. Any later notification or
status read retries the same target. Because the target is frozen, a retry
writes the same expiry rather than adding another 30 days. A `paid` row is never
rolled back, since the money is real.

Legacy paid rows that predate the activation marker are handled separately: if
the organization already has an active plan at least as strong, the row is marked
active without writing anything.

### Notification verification

`verifyNotificationSignature` (`src/core/billing/doku.ts`) checks, in order: the
`Client-Id` header matches our id; the `Request-Target` is this endpoint's path;
the `Digest` header equals the SHA-256 of the exact body bytes; and the
`Signature` header is `HMACSHA256=` followed by the HMAC of the component string,
compared in constant time. Anything else answers 401 before a row is read. The
handler always answers 2xx once the signature is valid, even when nothing was
applied, because DOKU retries and business outcomes are not delivery failures.

### Reconciliation

`GET /api/payments/status` may ask DOKU's Check Status API while the row is
pending, under four limits:

- nothing before the order is 60 seconds old, DOKU's advice;
- only inside a 5-second window every 15 seconds, so a 3-second client poll
  causes at most two DOKU calls per 15 seconds;
- the circuit breaker must be closed or half-open;
- concurrent polls for the same order share one call (`singleFlight`).

A reply is applied only if its invoice number is this order and its amount
matches the stored amount.

## Circuit breaker

Per isolate, keyed by `doku`: five consecutive failures open it; it stays open
for 30 seconds, then admits one probe. Both the checkout and the reconciliation
respect it. The breaker is visible through `GET /api/admin/quota` and resets when
an isolate is recycled.

## Portal

`GET /api/payments/portal?orgId=…` (any member) returns the organization's plan
and expiry from the organization row, plus its last ten orders. A pending order
with a live checkout URL carries `resumeUrl`. The payment rows are unreadable
from the browser (empty permissions), so this endpoint is the only window onto
them, and it re-filters by `orgId` in case the query is ignored.

## Cancellation and expiry

Nothing cancels a subscription. A paid term simply ends at `planExpiresAt`, and
the organization falls back to free behaviour without any write. Expired pending
checkouts are retired lazily, when the next checkout is requested or when
reconciliation reads them.

## Deleting an organization during payment

The organization delete refuses (409) while any order is pending and unexpired,
or paid with activation pending. Only the organization's payment history is
removed when it finally succeeds.

## The free invoice allowance

Source: `functions/_lib/invoice-quota.ts`, `src/core/billing/plans.ts`
(`freeInvoiceBudget`, `FREE_PLAN_LIMITS`), `functions/api/quota/invoices.ts`,
`src/app/invoice-quota.ts`.

- Limit: `FREE_PLAN_LIMITS.invoicesPerMonth` = 10.
- Count: invoices whose `$createdAt` falls in the current calendar month, local
  time, per organization. The user-entered invoice date is ignored, so
  back-dating cannot evade the limit and future-dating does not consume next
  month's allowance.
- Reset: the first of the next month.
- Paid and admin: unlimited (`remaining: null`). Their counts are not walked at
  all.
- Read path: `GET` returns the meter. Unreadable data is a 503, never a zero.
- Claim path: `POST` checks the allowance before the builder creates a *new*
  invoice. A spent month answers 402 `plan_required` with the upgrade copy and
  the quota. Editing an existing invoice does not claim.
- Walk: up to 100 pages of 100 rows, selecting only `date` and `$createdAt`,
  using the `org_date` index.

Honest limits (recorded in `security.md`):

- The claim is a read. Two claims in the same instant can both succeed near the
  limit, so the allowance can be overrun by a small amount.
- `POST /api/data/invoices` does not recount. A client that calls the endpoint
  directly bypasses the allowance. The product flow is the only enforcement point.
- The count uses Appwrite's creation timestamp, so a row created by a retried
  write could count twice if the first attempt is recorded but its response is
  lost. Writes are not retried, which limits this to a lost-response case.

The meter (`quota-meter.tsx`) and the builder both read the same query.
Mutations on invoices invalidate it. Its own staleness is 30 seconds, and the
server re-checks at save time, so a stale meter cannot admit a save the server
would refuse.

## Admin plan control

Admins set a plan and expiry on an organization through
`PATCH /api/admin/users`. The change is audited. It is the only way besides
settlement to change a plan, and it bypasses DOKU entirely. There is no
reconciliation row for it.

## Provider-side limits

Quota figures for Cloudflare, Appwrite and R2, verified against the providers'
free plans on 2026-10-22, are recorded in `quota.md` and in `PROVIDER_LIMITS`
in `functions/_lib/quota.ts`. R2 is the one service that bills automatically
beyond its included amounts; `quota.md` describes the mitigations.

## Files

- Domain: `src/core/billing/{plans,plan-benefits,plan-availability,payment-state,doku}.ts`.
- Server: `functions/api/payments/{checkout,doku-notify,status,portal}.ts`,
  `functions/_lib/payment-settle.ts`, `functions/_lib/invoice-quota.ts`,
  `functions/api/quota/invoices.ts`.
- Client: `src/app/payments.ts`, `src/app/invoice-quota.ts`,
  `src/components/react/billing/*`, `src/components/react/checkout/*`,
  `src/components/react/dashboard/quota-meter.tsx`.
- Tests: `src/core/billing/*.test.ts`, `tests/checkout.test.ts`,
  `tests/doku-notify.test.ts`, `tests/payment-status.test.ts`,
  `tests/portal.test.ts`, `tests/invoice-link-gate.test.ts`,
  `tests/invoice-quota-endpoint.test.ts`, `tests/quota-endpoints.test.ts`.
