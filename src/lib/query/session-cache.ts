import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from './keys';
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
 * The session is written after the clear so it survives as the single entry
 * point `AuthGate` reads.
 */
export function adoptSession(queryClient: QueryClient, user: SessionUser | null): void {
  queryClient.clear();
  queryClient.setQueryData<SessionUser | null>(queryKeys.session, user);
}
