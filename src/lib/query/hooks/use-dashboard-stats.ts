import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getDashboardStats, refreshDashboardStats } from '../../../app/stats';
import { queryKeys } from '../keys';
import { queryPolicy } from '../policies';

/**
 * Cached dashboard counters plus a one-shot background revalidation.
 *
 * First paint comes from the `stats` row (one small read), then every counter
 * is recomputed from the source tables and written back. The revalidation
 * runs once per mount so a remount (or a Strict-Mode double effect) never
 * double-counts, and a failed refresh simply leaves the cached numbers on
 * screen — the row is a cache, never a hard dependency.
 */
export function useDashboardStats() {
  const queryClient = useQueryClient();
  const revalidated = useRef(false);
  const [revalidating, setRevalidating] = useState(true);

  const query = useQuery({
    queryKey: queryKeys.stats,
    queryFn: getDashboardStats,
    ...queryPolicy('stats'),
  });

  const refresh = useCallback(() => {
    setRevalidating(true);
    refreshDashboardStats()
      .then((stats) => queryClient.setQueryData(queryKeys.stats, stats))
      .catch(() => {
        // Keep whatever the cache shows; the numbers stay as of the last
        // successful refresh rather than blanking the section.
      })
      .finally(() => setRevalidating(false));
  }, [queryClient]);

  useEffect(() => {
    if (revalidated.current) return;
    revalidated.current = true;
    refresh();
  }, [refresh]);

  return { ...query, revalidating, refresh };
}
