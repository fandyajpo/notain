import { useEffect, useRef, type ReactNode } from 'react';
import { useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getActiveOrgId, setActiveOrgId, subscribeActiveOrg } from '../../../app/active-org';
import { useAcceptPendingInvites, useOrgs } from '../../../lib/query/hooks/use-orgs';
import { Button } from '../ui/button';
import { ErrorState, LoadingState } from '../ui/state';
import { OnboardingModal } from './onboarding-modal';

type Props = {
  children: ReactNode;
  /** Rendered while the org list is still resolving. */
  fallback?: ReactNode;
};

/**
 * The tenancy gate every signed-in screen walks through, sitting between the
 * session check (`AuthGate`) and the profile/onboarding check — because since
 * multi-tenancy the profile row IS `profiles/<orgId>`, so nothing about the
 * account can be read before an organization is chosen.
 *
 * Three jobs, in order:
 *
 * 1. **Accept invitations.** `POST /api/orgs/accept` fires once per load, in
 *    the background: an invite addressed to this email becomes an active
 *    membership the moment its owner signs in (or signs up). A failure is
 *    silent — the invites stay pending for the next load, and an automatic
 *    background action must never block the app.
 * 2. **Ensure a valid active org.** The persisted choice (`active-org`)
 *    is re-checked against the server's list every time it changes: a deleted
 *    org, a revoked membership or another browser's stale pick all resolve to
 *    "first org in the list" — and an empty list resolves to the onboarding
 *    screen below, whose final step creates the first organization.
 * 3. **Swap the data with the org.** Per-org caches (profile, invoices,
 *    stats…) are reset whenever the active org *changes*, so a switch can
 *    never paint org A's numbers under org B's name. The org list itself is
 *    user-scoped and survives the reset untouched.
 *
 * Until an org is active the children do not mount: an unscoped render would
 * either error on `requireActiveOrgId` or — worse — briefly show another
 * tenant's cached data.
 */
export function OrgGate({ children, fallback }: Props) {
  const { data, isLoading, isError, refetch, isFetching } = useOrgs();
  const accept = useAcceptPendingInvites();
  const queryClient = useQueryClient();
  const activeOrgId = useSyncExternalStore(subscribeActiveOrg, getActiveOrgId, () => null);
  const acceptStarted = useRef(false);
  const previousOrg = useRef<string | null | undefined>(undefined);

  // Fire the invite sweep exactly once per mount, regardless of re-renders.
  // `mutateAsync().catch`, NOT a bare `mutate()`: the sweep is fire-and-forget
  // by design (a failure retries next load), but an uncaught mutation promise
  // rejects into the layout's global unhandledrejection handler and toasts
  // "unexpected error" on every page the account visits.
  useEffect(() => {
    if (acceptStarted.current) return;
    acceptStarted.current = true;
    void accept.mutateAsync().catch(() => {});
  }, [accept]);

  // Keep the active org inside the server's answer. This re-runs whenever the
  // list changes (accept, leave, delete) and whenever the store changes, so
  // both directions converge: a stale pick falls back to the first org, and
  // an empty list clears the selection.
  useEffect(() => {
    if (!data) return;
    const orgs = data.orgs;
    if (orgs.length === 0) {
      // An empty answer arriving mid-refetch can be stale — the create flow
      // invalidates this very list right after adding to it — and undoing the
      // selection there would bounce a brand-new org straight off the screen.
      if (!isFetching) setActiveOrgId(null);
      return;
    }
    if (activeOrgId === null || !orgs.some((org) => org.id === activeOrgId)) {
      setActiveOrgId(orgs[0].id);
    }
  }, [data, activeOrgId, isFetching]);

  // Reset every per-org cache when the selection actually changes between two
  // meaningful states. `resetQueries`, NOT `clear()`: clearing destroys query
  // instances without re-attaching the live observers already mounted on
  // them — every mounted query would sit dead with no fetch scheduled until
  // some unrelated re-render. Reset restores each query's initial state AND
  // refetches the active ones through the observers' normal notify path, so a
  // switch repaints the page for the new org under its loading state instead
  // of org A's rows or an empty void.
  //
  // null → org resets nothing: no per-org data can exist under a null
  // selection. The session survives every switch (its staleTime is Infinity
  // by policy — only sign-in/sign-out may invalidate it); the org list itself
  // is user-scoped and refetching it here is just a fresher switcher.
  useEffect(() => {
    if (
      previousOrg.current !== undefined &&
      previousOrg.current !== null &&
      previousOrg.current !== activeOrgId
    ) {
      void queryClient.resetQueries({
        predicate: (query) => query.queryKey[0] !== 'session',
      });
    }
    previousOrg.current = activeOrgId;
  }, [activeOrgId, queryClient]);

  if (isError) {
    return (
      <ErrorState
        title="Organisasi gagal dimuat"
        message="Periksa koneksi internet kamu lalu coba lagi."
        action={
          <Button size="sm" loading={isFetching} onClick={() => void refetch()}>
            Coba lagi
          </Button>
        }
      />
    );
  }

  if (isLoading || !data) {
    return <>{fallback ?? <LoadingState label="Memuat organisasi…" />}</>;
  }

  // With no orgs the answer is the ONBOARDING screen, not a bare "make an
  // organization" card: its two steps collect name + business name and mint
  // the organization FROM the business name on submit — one flow, because
  // the org and the business name are the same thing to the user. Shown only
  // once the invite sweep has settled: signing up with a pending invitation
  // should land in the invited org, never a flash of onboarding.
  if (data.orgs.length === 0) {
    if (accept.isPending) return <>{fallback ?? <LoadingState label="Memuat organisasi…" />}</>;
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <OnboardingModal createOrg />
      </div>
    );
  }

  // The list says orgs exist but the store has not caught up yet (the ensure
  // effect runs after paint): hold the fallback one tick rather than mounting
  // children that would throw on a missing org id.
  const active = activeOrgId !== null && data.orgs.some((org) => org.id === activeOrgId);
  if (!active) return <>{fallback ?? <LoadingState label="Menyiapkan organisasi…" />}</>;

  return <>{children}</>;
}
