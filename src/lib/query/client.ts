import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { DEFAULT_QUERY_POLICY, retryDelay, shouldRetry } from './policies';
import { createSessionExpiryHandler } from './session-expiry';

/**
 * Query client tuned for a small, personal dataset backed by Appwrite.
 *
 * Retry and backoff come from `policies.ts`; per-datatype `staleTime`/`gcTime`
 * are declared next to each hook so the number sits beside the question it
 * answers. The values here are only the floor for an untagged query.
 *
 * A session that lapses mid-edit answers 401 on whatever call was in flight.
 * Both caches funnel into one handler so a query and a mutation failing at the
 * same moment produce a single, calm sign-out instead of scattered "gagal"s.
 */
export function createQueryClient(): QueryClient {
  const handleSessionExpiry = createSessionExpiryHandler();

  // The caches are handed to the constructor, which runs before the client
  // itself is available — but `onError` only fires later, by which point it
  // is. The holder lets those callbacks reach the client without pulling on
  // `query.client`, which the public types do not expose.
  const holder: { current?: QueryClient } = {};
  const onCacheError = (error: unknown) => {
    if (holder.current) handleSessionExpiry(holder.current, error);
  };

  const client = new QueryClient({
    queryCache: new QueryCache({ onError: onCacheError }),
    mutationCache: new MutationCache({ onError: onCacheError }),
    defaultOptions: {
      queries: {
        staleTime: DEFAULT_QUERY_POLICY.staleTime,
        gcTime: DEFAULT_QUERY_POLICY.gcTime,
        refetchOnWindowFocus: false,
        retry: shouldRetry,
        // TanStack passes the failed query's error as a second argument. Our
        // backoff does not depend on it, so it is dropped here rather than
        // widening `retryDelay`, whose second parameter is the injected jitter.
        retryDelay: (attemptIndex: number) => retryDelay(attemptIndex),
      },
      mutations: {
        // A mutation changes server state; replaying it blindly is how you end
        // up with a duplicate invoice.
        retry: false,
      },
    },
  });

  holder.current = client;
  return client;
}
