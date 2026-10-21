import { useQuery } from '@tanstack/react-query';
import { getDashboardFinance, type DashboardFinance } from '../../../app/finance';
import { periodRange, type PeriodChoice } from '../../../core/stats/finance';
import { queryKeys } from '../keys';
import { queryPolicy } from '../policies';

/**
 * The dashboard's money screen: summary cards, revenue chart, attention list
 * and activity feed — one query per resolved period window.
 *
 * The period choice resolves to concrete dates *before* querying, so the
 * cache key is the window itself: "this month" on October 5 and on October 6
 * are different queries (the range moved), but flipping week → month → week
 * within a session reuses the earlier result instead of refetching.
 *
 * Invoice mutations invalidate the whole `dashboard-finance` prefix (see
 * `invalidateCollections`), so a status flip, a new invoice, or a delete
 * re-runs every cached period rather than showing stale money.
 */
export function useDashboardFinance(input: {
  choice: PeriodChoice;
  customFrom: string;
  customTo: string;
  now?: string;
  /**
   * Plan entitlement (Pro sells "laporan bisnis"). A free account never
   * fires the query at all — the section renders its upgrade card instead,
   * so gating saves the request rather than merely hiding its result.
   */
  enabled?: boolean;
}) {
  const range = periodRange(
    input.choice,
    { from: input.customFrom, to: input.customTo },
    input.now,
  );

  return useQuery<DashboardFinance>({
    queryKey: queryKeys.dashboardFinance(range.from, range.to),
    queryFn: () => getDashboardFinance(input.now ? { range, now: input.now } : { range }),
    enabled: input.enabled ?? true,
    ...queryPolicy('dashboardFinance'),
  });
}
