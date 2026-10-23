import { useQuery } from '@tanstack/react-query';
import { getPublicSite } from '../../../app/public-site';
import { queryPolicy, shouldRetry } from '../policies';

/**
 * The public business page's payload, fetched behind its capability URL.
 * No session stands behind it, so it rides its own key — never the owner's
 * `profile` key, which lives behind auth and would be poisoned by an
 * anonymous read (the same rule as `usePublicInvoice`).
 */
export function usePublicSite(ownerId: string | undefined) {
  return useQuery({
    queryKey: ['public-site', ownerId ?? ''],
    queryFn: () => getPublicSite(ownerId as string),
    enabled: Boolean(ownerId),
    ...queryPolicy('publicSite'),
    // A 404 ("no such page") is final and `shouldRetry` stops there; a
    // dropped connection on someone's storefront gets the normal backoff
    // instead of an error screen on the first blip.
    retry: shouldRetry,
  });
}
