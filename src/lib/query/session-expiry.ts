import type { QueryClient } from '@tanstack/react-query';
import { isUnauthenticated } from '../../appwrite/errors';
import { forgetSession } from '../../app/session';
import { queryKeys } from './keys';
import { toast } from '../ui/toast';

/**
 * Pages that are already about authentication. Landing on one of them again
 * would just re-run the redirect, so an expired session detected here is left
 * alone rather than bounced in a loop.
 */
const AUTH_PATHS = ['/login', '/register', '/forgot-password', '/reset-password'];

/**
 * Handles a session that expired while the app was open.
 *
 * Appwrite keeps sessions server-side, so a token can lapse mid-edit without
 * any client warning — the next data call simply comes back 401. Left alone
 * that surfaces as a confusing "gagal" on whatever the user was doing. Instead
 * we treat the 401 as the single source of truth for "signed out": clear the
 * memoised session, flip the cached one so `AuthGate` reacts, say so in plain
 * words, and send the user back through login carrying `next` so they return
 * to where they were.
 *
 * The re-entry guard matters because several queries and mutations can fail at
 * once when the session lapses; only the first one should announce it and
 * navigate.
 */
export function createSessionExpiryHandler() {
  let handling = false;

  return function handleSessionExpiry(client: QueryClient, error: unknown): void {
    if (!isUnauthenticated(error)) return;
    if (typeof window === 'undefined') return;
    if (handling) return;
    if (AUTH_PATHS.some((path) => window.location.pathname.startsWith(path))) return;

    handling = true;
    forgetSession();
    client.setQueryData(queryKeys.session, null);

    const next = window.location.pathname + window.location.search;
    toast('Sesi kamu berakhir. Masuk lagi untuk melanjutkan.', { variant: 'info' });

    window.setTimeout(() => {
      window.location.assign(`/login?next=${encodeURIComponent(next)}`);
    }, 1200);
  };
}
