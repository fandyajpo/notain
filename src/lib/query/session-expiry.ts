import type { QueryClient } from '@tanstack/react-query';
import { isUnauthenticated } from '../../app/errors';
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
 * Appwrite answers `user_unauthorized` for two very different situations: a
 * lapsed token, *and* a resource the account simply cannot touch — most often a
 * table that has not been provisioned yet. Signing the user out on the second
 * is what turns a missing table into an endless `/page ↔ /login` bounce, so
 * `verifySession` re-checks the account before anything is forgotten: only a
 * session that is genuinely gone triggers the sign-out. A 401 that leaves the
 * session intact is left for the caller to render as its own error.
 *
 * The re-entry guard matters because several queries and mutations can fail at
 * once when the session lapses; only the first one should announce it and
 * navigate.
 */
export function createSessionExpiryHandler(
  /** Resolves `true` while the account still has a valid session. */
  verifySession: () => Promise<boolean> = async () => false,
) {
  let handling = false;

  return async function handleSessionExpiry(client: QueryClient, error: unknown): Promise<void> {
    if (!isUnauthenticated(error)) return;
    if (typeof window === 'undefined') return;
    if (handling) return;
    if (AUTH_PATHS.some((path) => window.location.pathname.startsWith(path))) return;

    // Claim the guard before the await so a burst of simultaneous 401s still
    // funnels into one decision.
    handling = true;

    let stillSignedIn: boolean;
    try {
      stillSignedIn = await verifySession();
    } catch {
      // Could not confirm — fall through and treat it as an expiry, the
      // pre-existing behaviour, rather than silently swallowing the 401.
      stillSignedIn = false;
    }

    if (stillSignedIn) {
      // The session is fine, so this 401 belongs to a specific resource. Leave
      // the account alone and release the guard for a later real expiry.
      handling = false;
      return;
    }

    forgetSession();
    client.setQueryData(queryKeys.session, null);

    const next = window.location.pathname + window.location.search;
    toast('Sesi kamu berakhir. Masuk lagi untuk melanjutkan.', { variant: 'info' });

    window.setTimeout(() => {
      window.location.assign(`/login?next=${encodeURIComponent(next)}`);
    }, 1200);
  };
}
