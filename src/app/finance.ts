import { container } from '../infra/container';
import {
  attentionItems,
  financeFetchRange,
  recentActivity,
  revenueByMonth,
  summarizeFinance,
  type ActivityEvent,
  type AttentionItem,
  type ChartPoint,
  type DateRange,
  type FinanceSummary,
} from '../core/stats/finance';
import { todayIsoDate } from '../core/shared/dates';
import { requireSession } from './session';

/**
 * Upper bound on pages walked in one finance fetch. `DEFAULT_PAGE` rows per
 * page, so this covers tens of thousands of invoices *inside the window*
 * before truncating — no real account gets close, and the bound exists so a
 * bug can never become an unbounded request loop. When it trips, the summary
 * says so rather than silently under-reporting.
 */
const MAX_PAGES = 20;
const DEFAULT_PAGE = 100;

/** How many recent customer creations feed the activity feed. */
const CUSTOMER_EVENT_LIMIT = 10;

export type DashboardFinance = {
  /** The resolved period window the cards describe. */
  range: DateRange;
  summary: FinanceSummary;
  /** Received revenue per month for the last six calendar months. */
  chart: ChartPoint[];
  /** Most urgent unpaid invoices, overdue first. */
  attention: AttentionItem[];
  /** Invoice, proof-upload and customer events, newest first. */
  activity: ActivityEvent[];
  /** True when the window held more rows than one walk may fetch. */
  truncated: boolean;
};

/**
 * Everything the dashboard's money screen needs, from as few round trips as
 * the backend allows.
 *
 * The fetch strategy in one paragraph: Appwrite exposes no SUM/GROUP
 * aggregation and invoice totals are *derived* from the items JSON, so the
 * totals cannot be asked for server-side. Instead one projected walk —
 * `Query.select` of just the columns the math reads, filtered to a date
 * window on the existing `owner_date` index, rich text left behind
 * server-side — is fetched once and folded into every metric: the period
 * cards, the six-month chart, and the attention list all read the same rows.
 * The only extra read is a handful of recent customer creations for the
 * activity feed. No per-card queries, no N+1, no full-table reads.
 *
 * The window is the union of the selected period and the chart's six months
 * (`financeFetchRange`), so a "this week" click still draws the whole chart
 * without a second fetch.
 */
export async function getDashboardFinance(input: {
  range: DateRange;
  now?: string;
}): Promise<DashboardFinance> {
  const user = await requireSession();
  const now = input.now ?? todayIsoDate();
  const window = financeFetchRange(input.range, now);

  const [walk, customers] = await Promise.all([
    walkFinanceWindow(user.id, window),
    container.customers.listRecentCreations(user.id, CUSTOMER_EVENT_LIMIT),
  ]);

  // A wider-than-needed walk still summarizes against the *selected* period —
  // the extra rows exist purely to feed the chart and the attention list.
  return {
    range: input.range,
    summary: summarizeFinance(walk.rows, input.range, now),
    chart: revenueByMonth(walk.rows, now),
    attention: attentionItems(walk.rows, now, 6),
    activity: recentActivity(walk.rows, customers),
    truncated: walk.truncated,
  };
}

/**
 * Cursor-walks the finance projection across the window, oldest data staying
 * server-side: one page per request, stopping at exhaustion or the cap.
 */
async function walkFinanceWindow(
  ownerId: string,
  window: DateRange,
): Promise<{
  rows: Awaited<ReturnType<typeof container.invoices.listFinanceEntries>>;
  truncated: boolean;
}> {
  const rows: Awaited<ReturnType<typeof container.invoices.listFinanceEntries>> = [];
  let cursorAfter: string | undefined;
  let truncated = false;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const batch = await container.invoices.listFinanceEntries(ownerId, {
      from: window.from,
      to: window.to,
      limit: DEFAULT_PAGE,
      cursorAfter,
    });
    rows.push(...batch);

    const last = batch.at(-1);
    if (batch.length < DEFAULT_PAGE || !last) return { rows, truncated };
    cursorAfter = last.id;
    // One more full page would follow — flag it if this was the last allowed.
    if (page === MAX_PAGES - 1) truncated = true;
  }

  return { rows, truncated };
}

export type { AttentionItem, ChartPoint, DateRange, FinanceSummary };
