import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from './keys';
import { setActiveOrgId } from '../../app/active-org';
import type { SessionUser } from '../../ports/auth-repository';

/**
 * Makes the cache reflect exactly one account.
 *
 * Query keys in this app are not namespaced by user id — `['invoices', search]`
 * is the same key for everyone — so anything already cached belongs to whoever
 * was signed in before. Clearing first is what keeps one user's invoices, profile
 * and invoice numbers from being handed to the next account that signs in on the
 * same page.
 *
 * Signing out also drops the ORGANIZATION selection: the persisted pick
 * belongs to whoever was signed in, and the next account's `OrgGate` picks
 * from its own list. (Signing *in* as someone else without signing out first
 * leaves the pick alone — it is validated against the new account's list on
 * the next screen anyway, and keeping it lets the same user land back in the
 * workspace they last chose.)
 *
 * The session is written after the clear so it survives as the single entry
 * point `AuthGate` reads.
 */
export function adoptSession(queryClient: QueryClient, user: SessionUser | null): void {
  queryClient.clear();
  if (user === null) setActiveOrgId(null);
  queryClient.setQueryData<SessionUser | null>(queryKeys.session, user);
}
