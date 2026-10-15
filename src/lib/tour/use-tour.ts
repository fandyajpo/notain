import { useEffect } from 'react';
import { useSession } from '../query/hooks/use-session';
import { maybeRunPageTour, stopTour } from './tour-manager';

/**
 * Runs the tour for the current page the first time it is seen (or the pending
 * welcome tour, if one was just scheduled by onboarding). Must be called from
 * inside `AppProviders` so the session is available for per-user persistence.
 *
 * On unmount (Astro client-side navigation) the active tour is torn down
 * without being recorded as complete, so it can still run later.
 */
export function usePageTour(tourId: string): void {
  const { data: session } = useSession();
  const userId = session?.id;

  useEffect(() => {
    let cancelled = false;
    // Give the island a beat to render its data-tour targets before starting.
    const timer = setTimeout(() => {
      if (!cancelled) void maybeRunPageTour(tourId, { userId });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      stopTour();
    };
  }, [tourId, userId]);
}
