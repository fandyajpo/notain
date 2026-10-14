import { useEffect, type ReactNode } from 'react';
import { useSession } from '../../../lib/query/hooks/use-session';
import { useProfile } from '../../../lib/query/hooks/use-profile';
import { toast } from '../../../lib/ui/toast';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { OnboardingModal } from './onboarding-modal';

type Props = {
  children: ReactNode;
  /** Rendered while the session is still resolving. */
  fallback?: ReactNode;
};

/**
 * Client-side session gate. The site is statically rendered, so protected
 * pages render their shell and swap in a redirect once the session resolves.
 *
 * After the session is confirmed the profile is checked. Until both `name`
 * and `businessName` are filled the children are NOT rendered — no dashboard
 * DOM, no data fetches, nothing to inspect-and-delete. The onboarding modal
 * is the only thing on screen. Once onboarding completes the children mount
 * and the page loads normally.
 */
export function AuthGate({ children, fallback }: Props) {
  const { data: session, isLoading, isError, refetch, isFetching } = useSession();
  const { data: profile, isLoading: profileLoading } = useProfile(Boolean(session));

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
    return <SessionLoadError onRetry={() => void refetch()} retrying={isFetching} />;
  }

  if (isLoading || !session) {
    return <>{fallback ?? <SessionFallback />}</>;
  }

  // Session confirmed. Wait for the profile before deciding what to render.
  if (profileLoading) {
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
  return (
    <Card padding="none" className="px-6 py-10 text-center text-sm text-muted">
      Memeriksa sesi…
    </Card>
  );
}

/**
 * The session query could not be answered. Shown instead of the sign-in
 * redirect, because "we could not reach the server" is not "you are logged out".
 */
function SessionLoadError({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <div
      role="alert"
      className="rounded-card border border-danger/25 bg-danger-soft p-10 text-center"
    >
      <p className="text-sm font-medium text-danger">
        Gagal memeriksa sesi. Periksa koneksi internet kamu.
      </p>
      <div className="mt-4 flex justify-center">
        <Button size="sm" loading={retrying} onClick={onRetry}>
          Coba lagi
        </Button>
      </div>
    </div>
  );
}
