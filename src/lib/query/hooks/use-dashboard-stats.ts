import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getActiveOrgGeneration, subscribeActiveOrg } from '../../../app/active-org';
import { getDashboardStats, refreshDashboardStats } from '../../../app/stats';
import { queryKeys } from '../keys';
import { queryPolicy } from '../policies';
import { captureOrgMutationContext, isCurrentOrgMutation } from '../org-mutation';

/**
 * Cached dashboard counters plus a one-shot background revalidation per org.
 *
 * First paint comes from the `stats` row (one small read), then every counter
 * is recomputed from the source tables and written back. The revalidation
 * runs once per org generation so a remount (or a Strict-Mode double effect)
 * never double-counts, and a failed refresh simply leaves the cached numbers
 * on screen — the row is a cache, never a hard dependency.
 */
export function useDashboardStats() {
  const queryClient = useQueryClient();
  const orgGeneration = useSyncExternalStore(
    subscribeActiveOrg,
    getActiveOrgGeneration,
    getActiveOrgGeneration,
  );
  const revalidated = useRef<number | null>(null);
  const [revalidating, setRevalidating] = useState(true);

  const query = useQuery({
    queryKey: queryKeys.stats,
    queryFn: getDashboardStats,
    ...queryPolicy('stats'),
  });

  const refresh = useCallback(() => {
    const orgContext = captureOrgMutationContext();
    setRevalidating(true);
    refreshDashboardStats()
      .then((stats) => {
        if (isCurrentOrgMutation(orgContext)) queryClient.setQueryData(queryKeys.stats, stats);
      })
      .catch(() => {
        // Keep whatever the cache shows; the numbers stay as of the last
        // successful refresh rather than blanking the section.
      })
      .finally(() => {
        if (isCurrentOrgMutation(orgContext)) setRevalidating(false);
      });
  }, [queryClient]);

  useEffect(() => {
    if (revalidated.current === orgGeneration) return;
    revalidated.current = orgGeneration;
    refresh();
  }, [orgGeneration, refresh]);

  return { ...query, revalidating, refresh };
}
