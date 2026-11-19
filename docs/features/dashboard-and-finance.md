# Dashboard and finance

The signed-in home screen: counters, money metrics, a six-month chart, an
attention list, recent activity, and a setup checklist. All of it is derived
from the organization's invoices and customers — there is no payment
reconciliation.

Route: `/dashboard`. Components: `src/components/react/dashboard/*`. Application:
`src/app/stats.ts`, `src/app/finance.ts`. Domain: `src/core/stats/finance.ts`,
`src/core/stats/model.ts`.

## Two different reads

The dashboard shows two independent things, and they are cached separately:

1. **Counters** — how many invoices exist per status, how many customers, how
   many templates. Backed by the `stats` row per organization.
2. **Money metrics** — revenue, receivables, overdue amounts, a monthly chart,
   the attention list and recent activity. Computed from a projected invoice
   walk in the browser.

`queryKeys.stats` and `queryKeys.dashboardFinance(from, to)` keep them apart, and
invoice mutations invalidate both prefixes.

## Counters and the stats cache

`refreshDashboardStats()` runs once per dashboard visit:

- counts total invoices, and invoices with status `sent`, `paid` and `void`;
- counts customers and templates;
- writes the six numbers into `stats/<orgId>`.

Each count is a `limit: 1` query whose `total` comes from Appwrite's matched-set
count, so counting never transfers rows.

The read is best-effort in both directions:

- reading (`getDashboardStats`) swallows errors and returns `null` when the
  table or row is missing, so the dashboard degrades to live counts;
- writing swallows errors and returns the freshly computed numbers anyway.

Because the row is recomputed on every visit, drift from a failed write or an
out-of-band edit heals itself on the next load. There is no backfill and no
background job.

## Finance metrics

`getDashboardFinance({ range })`:

1. Resolves the fetch window as the union of the selected period and the chart's
   six months (`financeFetchRange`), so a "this week" view still draws the whole
   chart.
2. Walks the organization's invoices in that window through a projection
   (`listFinanceEntries`) — items, discount, tax, status, dates, proof — leaving
   the rich text server-side. Pages of 100, capped at 20 pages.
3. Runs the same rows through pure functions for every metric, plus one small
   query for recent customer creations.

Definitions, as implemented in `src/core/stats/finance.ts`:

- **Received revenue** — grand totals of invoices with status `paid` whose
  invoice date falls in the period. Money is attributed by invoice date, not by
  a payment timestamp, because status flips record no time.
- **Receivables (unpaid)** — grand totals of invoices with status `null` or
  `sent` in the period.
- **Overdue** — unpaid invoices whose `dueDate` is before today. An invoice with
  no due date can never be overdue. Reported as a count and an amount.
- **Invoice count** — every invoice dated in the period, any status. Void
  invoices are excluded from all money buckets but still counted here as
  activity.
- **Chart** — received revenue per calendar month for the last six months,
  bucketed by invoice date, with Indonesian short month labels.
- **Attention list** — up to six unpaid invoices, overdue first (most overdue
  leading), then merely unpaid (newest invoice first).
- **Recent activity** — invoice creations, payment-proof uploads and customer
  creations, newest first, capped. Status flips are deliberately absent: there
  is no timestamp to attribute, and using `$updatedAt` would misstate every later
  edit.

Period selection: `week` (Monday through today), `month` (first of the month
through today), or a custom range. A custom range with blank or malformed dates
falls back to the current month; a reversed range is swapped rather than
rejected.

Totals come from `calculateTotals`, the same calculator the invoice itself uses,
so a dashboard figure and a printed invoice can never disagree.

## Truncation

The walk stops at 20 pages. If a window holds more rows than that, the response
carries `truncated: true` and the UI says so, rather than presenting a partial
sum as complete.

## Setup checklist

`setup-checklist.tsx` nudges the first few steps (business identity, first
invoice, template, customer, logo). It reads existing data and links to the
relevant page; it does not write anything.

## Quota meter

`quota-meter.tsx` renders the free tier's remaining invoices in the sidebar and
in the builder. It waits for the session and the active organization, keys its
query per organization, and shows a loading state and a retry affordance instead
of hiding a failed read. The mechanics are in `features/billing-and-quota.md`.

## Failure modes

- A missing `stats` table: dashboard still works, counters computed live.
- An unreadable invoice page during the finance walk: the whole call fails and
  the section shows an error state with retry — it never renders zeros.
- A very large window: truncated, labelled.
- No organization: the dashboard is behind `OrgGate`, so this state shows the
  shared no-organization screen instead.
- Corrupt older rows: the finance projection reads through the shape schema, so
  a malformed optional field degrades instead of blanking the page.

## Files

- `src/core/stats/finance.ts` — every metric, pure.
- `src/core/stats/model.ts` — the counters' shape.
- `src/app/stats.ts` — recompute and persist.
- `src/app/finance.ts` — window resolution and the cursor walk.
- `src/lib/query/hooks/use-dashboard-stats.ts`,
  `use-dashboard-finance.ts`, `use-invoices.ts` — caching and invalidation.
- `src/components/react/dashboard/{dashboard-app,finance-section,invoice-table,setup-checklist,quota-meter}.tsx`.
