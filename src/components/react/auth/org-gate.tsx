import { useEffect, useRef, type ReactNode } from 'react';
import { useSyncExternalStore } from 'react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { getActiveOrgId, setActiveOrgId, subscribeActiveOrg } from '../../../app/active-org';
import { endOrgSwitch, getOrgSwitch, subscribeOrgSwitch } from '../../../app/org-switch';
import { useAcceptPendingInvites, useOrgs } from '../../../lib/query/hooks/use-orgs';
import { toast } from '../../../lib/ui/toast';
import { Button } from '../ui/button';
import { OrgSwitchOverlay } from '../orgs/org-switch-overlay';
import { ErrorState, LoadingState } from '../ui/state';
import { OnboardingModal } from './onboarding-modal';

type Props = {
  children: ReactNode;
  /** Rendered while the org list is still resolving. */
  fallback?: ReactNode;
};

/**
 * Minimum time the switch overlay stays up, so a fast load cannot flash it.
 */
const SWITCH_MIN_MS = 450;
/**
 * Hard cap: the overlay must never outlive a stuck fetch. After it, the page
 * shows its own loading/error states instead.
 */
const SWITCH_MAX_MS = 8000;

/**
 * The tenancy gate every signed-in screen walks through, sitting between the
 * session check (`AuthGate`) and the profile/onboarding check — because since
 * multi-tenancy the profile row IS `profiles/<orgId>`, so nothing about the
 * account can be read before an organization is chosen.
 *
 * Four jobs, in order:
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
 *    screen below, whose final step creates the first organization. When the
 *    invalid pick is the target of an in-flight switch, the previous org is
 *    restored instead of an arbitrary one (a failed switch rolls back).
 * 3. **Swap the data with the org.** Per-org caches (profile, invoices,
 *    stats…) are reset whenever the active org *changes*, so a switch can
 *    never paint org A's numbers under org B's name. The org list is
 *    user-scoped, so its refetch here is a *fresher switcher* — and it is
 *    what validates the target: a membership revoked in another tab arrives
 *    as a rollback below, not a broken page.
 * 4. **Run the switch transition.** While `app/org-switch` holds a switch in
 *    flight, this gate renders the blocking full-screen overlay and ends it
 *    only when the target org is validated AND the shared client has no fetch
 *    in flight — i.e. the new context and its data are genuinely ready. If the
 *    org list errors mid-switch, the previous org is restored and the overlay
 *    drops; a hard cap guarantees neither can hang.
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
  const orgSwitch = useSyncExternalStore(subscribeOrgSwitch, getOrgSwitch, () => null);
  // Re-renders this gate whenever any fetch on the shared client starts or
  // settles — the completion condition for the switch overlay.
  const fetchingCount = useIsFetching();
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
      // A switch whose target vanished from the list is a FAILED switch:
      // restore the org we came from (still in the list) rather than landing
      // arbitrarily on the first one. The completion effect below notices the
      // mismatch and lifts the overlay with an explanatory toast.
      const switchState = getOrgSwitch();
      const restore =
        switchState !== null &&
        switchState.to === activeOrgId &&
        orgs.some((org) => org.id === switchState.from);
      setActiveOrgId(restore ? switchState.from : orgs[0].id);
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
  // is user-scoped and refetching it here is just a fresher switcher — which
  // doubles as the switch's validation pass: the fresh answer is what the
  // ensure effect above checks the target against. The overlay names its
  // target from the switch store (`toName`), not from this cache, so the
  // reset window never blanks the transition label.
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

  // FAILED switch: the org list itself errored while a switch was in flight.
  // Roll back to the previous selection and drop the overlay; the ErrorState
  // below owns the retry UX from there.
  useEffect(() => {
    if (!isError || !orgSwitch) return;
    setActiveOrgId(orgSwitch.from);
    endOrgSwitch();
    toast('Gagal berpindah organisasi. Kembali ke organisasi sebelumnya.', {
      variant: 'error',
    });
  }, [isError, orgSwitch]);

  // SUCCESS path: the overlay may only clear once the target org is validated
  // and the shared client has nothing in flight — the context switch and the
  // refetched per-org data are actually ready. A minimum display time keeps it
  // from flashing; a hard cap guarantees it can never hang on a stuck fetch.
  // Every condition derives from a dep, so the timers below are always
  // re-scheduled when reality moves under them.
  //
  // `isError` bails out entirely: the rollback effect above owns ending the
  // switch on a failed list, and racing it from here could schedule a second
  // path (and a second toast) for the same failure.
  useEffect(() => {
    if (!orgSwitch || isError) return;
    const elapsed = Date.now() - orgSwitch.startedAt;

    if (elapsed >= SWITCH_MAX_MS) {
      endOrgSwitch();
      return;
    }

    const targetValid =
      activeOrgId !== null && data !== undefined && data.orgs.some((org) => org.id === activeOrgId);

    if (targetValid && fetchingCount === 0) {
      const remaining = SWITCH_MIN_MS - elapsed;
      if (remaining <= 0) {
        // The list came back without the switch target (revoked membership,
        // stale cache): the ensure effect above already restored `from`.
        if (activeOrgId !== orgSwitch.to) {
          toast('Organisasi tidak tersedia. Kembali ke organisasi sebelumnya.', {
            variant: 'info',
          });
        }
        endOrgSwitch();
        return;
      }
      const timer = setTimeout(() => {
        // Live re-check at fire time; if a fetch started in the meantime the
        // fetchingCount dep has already re-run this effect and replaced the
        // timer with the hard cap.
        if (queryClient.isFetching() === 0) endOrgSwitch();
      }, remaining);
      return () => clearTimeout(timer);
    }

    const cap = setTimeout(() => endOrgSwitch(), SWITCH_MAX_MS - elapsed);
    return () => clearTimeout(cap);
  }, [orgSwitch, activeOrgId, data, fetchingCount, queryClient, isError]);

  // The overlay is rendered on EVERY exit path: while a switch is pending the
  // gate must keep blocking the previous org's UI even if the list briefly
  // errors or resets underneath it (the effects above end the switch promptly
  // in those cases, so this only covers the frames in between). The name comes
  // from the store — captured by the dropdown before the reset blanked the
  // cache — so it is correct on the very first frame of the transition.
  const overlay = orgSwitch ? <OrgSwitchOverlay name={orgSwitch.toName || 'organisasi'} /> : null;

  if (isError) {
    return (
      <>
        {overlay}
        <ErrorState
          title="Organisasi gagal dimuat"
          message="Periksa koneksi internet kamu lalu coba lagi."
          action={
            <Button size="sm" loading={isFetching} onClick={() => void refetch()}>
              Coba lagi
            </Button>
          }
        />
      </>
    );
  }

  if (isLoading || !data) {
    return (
      <>
        {overlay}
        {fallback ?? <LoadingState label="Memuat organisasi…" />}
      </>
    );
  }

  // With no orgs the answer is the ONBOARDING screen, not a bare "make an
  // organization" card: its two steps collect name + business name and mint
  // the organization FROM the business name on submit — one flow, because
  // the org and the business name are the same thing to the user. Shown only
  // once the invite sweep has settled: signing up with a pending invitation
  // should land in the invited org, never a flash of onboarding.
  if (data.orgs.length === 0) {
    if (accept.isPending) {
      return (
        <>
          {overlay}
          {fallback ?? <LoadingState label="Memuat organisasi…" />}
        </>
      );
    }
    return (
      <>
        {overlay}
        <div className="flex min-h-[60vh] items-center justify-center">
          <OnboardingModal createOrg />
        </div>
      </>
    );
  }

  // The list says orgs exist but the store has not caught up yet (the ensure
  // effect runs after paint): hold the fallback one tick rather than mounting
  // children that would throw on a missing org id.
  const active = activeOrgId !== null && data.orgs.some((org) => org.id === activeOrgId);
  if (!active) {
    return (
      <>
        {overlay}
        {fallback ?? <LoadingState label="Menyiapkan organisasi…" />}
      </>
    );
  }

  return (
    <>
      {overlay}
      {children}
    </>
  );
}
