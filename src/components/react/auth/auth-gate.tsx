import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { Ban } from 'lucide-react';
import { useSession, useSignOut } from '../../../lib/query/hooks/use-session';
import { useProfile } from '../../../lib/query/hooks/use-profile';
import { getActiveOrgId, subscribeActiveOrg } from '../../../app/active-org';
import { toast } from '../../../lib/ui/toast';
import { ERROR_CODES, isAppError } from '../../../core/shared/errors';
import { Button } from '../ui/button';
import { ErrorState, LoadingState } from '../ui/state';
import { OnboardingModal } from './onboarding-modal';
import { OrgGate } from './org-gate';

type Props = {
  children: ReactNode;
  /** Rendered while the session is still resolving. */
  fallback?: ReactNode;
};

/**
 * Client-side session gate. The site is statically rendered, so protected
 * pages render their shell and swap in a redirect once the session resolves.
 *
 * Three stages, each blocking the next:
 *
 * 1. **Session** — confirmed here; a missing one redirects to `/login`.
 * 2. **Organization** (`OrgGate`) — since multi-tenancy the profile row IS
 *    `profiles/<orgId>`, so nothing about the account can be read before an
 *    organization is active. Zero orgs = the onboarding, whose final step
 *    creates the first organization from the business name.
 * 3. **Profile/onboarding** — until both `name` and `businessName` are filled
 *    the children are NOT rendered — no dashboard DOM, no data fetches,
 *    nothing to inspect-and-delete. The onboarding modal is the only thing on
 *    screen. Once onboarding completes the children mount and the page loads
 *    normally.
 */
export function AuthGate({ children, fallback }: Props) {
  const { data: session, isLoading, isError, error, refetch, isFetching } = useSession();
  const orgId = useSyncExternalStore(subscribeActiveOrg, getActiveOrgId, () => null);
  // The profile read throws (as the UI's domain error) without an active org,
  // so the query stays disabled until the OrgGate has chosen one — otherwise
  // it would cache that throw as a non-retriable FORBIDDEN failure for the
  // whole session. `isPending` (not `isLoading`) guards the hand-off: a query
  // that just became enabled is pending before it is fetching, and that gap
  // must not read as "profile missing → start onboarding over".
  const { data: profile, isPending: profilePending } = useProfile(
    Boolean(session) && orgId !== null,
  );

  useEffect(() => {
    // Only a completed query that answers "no session" may redirect. An error
    // means we do not know the answer — bouncing to /login there would sign
    // the user out over a single dropped packet.
    if (isLoading || isError || session) return;
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    toast('Silakan masuk terlebih dahulu.', { variant: 'info' });
    window.location.replace(`/login?next=${next}`);
  }, [isLoading, isError, session]);

  if (isError) {
    // A blocked account answers every request (including the session check)
    // with `user_blocked`. It is a permanent state, not a load failure — the
    // user gets a dedicated screen with no menus and a way out.
    if (isAppError(error) && error.code === ERROR_CODES.SUSPENDED) {
      return <SuspendedScreen message={error.message} />;
    }
    return <SessionLoadError onRetry={() => void refetch()} retrying={isFetching} />;
  }

  if (isLoading || !session) {
    return <>{fallback ?? <SessionFallback />}</>;
  }

  // Session confirmed → organization next. Everything the profile stage needs
  // is org-scoped, so the OrgGate wraps it (and, through it, the children).
  return (
    <OrgGate fallback={fallback}>
      <ProfileStage fallback={fallback} profile={profile} pending={profilePending}>
        {children}
      </ProfileStage>
    </OrgGate>
  );
}

/** Stage 3 of {@link AuthGate}: profile load → onboarding → children. */
function ProfileStage({
  children,
  fallback,
  profile,
  pending,
}: {
  children: ReactNode;
  fallback?: ReactNode;
  profile: ReturnType<typeof useProfile>['data'];
  pending: boolean;
}) {
  // Wait for the profile before deciding what to render.
  if (pending) {
    return <>{fallback ?? <SessionFallback />}</>;
  }

  // Onboarding incomplete: block the children entirely. The modal is the only
  // interactive element; deleting it from the DOM just reveals the blocked
  // state because `children` was never mounted.
  const onboarded =
    profile != null && profile.name.trim() !== '' && (profile.businessName ?? '').trim() !== '';

  if (!onboarded) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <OnboardingModal />
      </div>
    );
  }

  return <>{children}</>;
}

function SessionFallback() {
  return <LoadingState label="Memeriksa sesi…" />;
}

/**
 * The session query could not be answered. Shown instead of the sign-in
 * redirect, because "we could not reach the server" is not "you are logged out".
 */
function SessionLoadError({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <ErrorState
      title="Gagal memeriksa sesi"
      message="Periksa koneksi internet kamu."
      action={
        <Button size="sm" loading={retrying} onClick={onRetry}>
          Coba lagi
        </Button>
      }
    />
  );
}

/**
 * Full-viewport dead end for a blocked account. No sidebar, no menus, no
 * children — the Appwrite middleware already rejects every request from a
 * blocked user, so there is nothing the app could usefully render behind it.
 */
function SuspendedScreen({ message }: { message: string }) {
  const signOut = useSignOut();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <Ban size={32} className="text-muted" aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-foreground">Akun dinonaktifkan</h1>
        <p className="max-w-sm text-sm text-muted">{message}</p>
      </div>
      <Button
        size="sm"
        loading={signOut.isPending}
        onClick={() => {
          signOut
            .mutateAsync()
            .then(() => {
              window.location.assign('/login');
            })
            .catch(() => {
              // `signOut` already swallows the blocked-session failure and
              // forgets locally; this only fires for a genuine network error.
              toast('Gagal keluar. Coba lagi.', { variant: 'error' });
            });
        }}
      >
        Keluar
      </Button>
    </div>
  );
}
