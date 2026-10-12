import { useEffect, type ReactNode } from 'react';
import { useSession } from '../../../lib/query/hooks/use-session';
import { toast } from '../../../lib/ui/toast';
import { Button } from '../ui/button';

type Props = {
  children: ReactNode;
  /** Rendered while the session is still resolving. */
  fallback?: ReactNode;
};

/**
 * Client-side session gate. The site is statically rendered, so protected
 * pages render their shell and swap in a redirect once the session resolves.
 */
export function AuthGate({ children, fallback }: Props) {
  const { data: session, isLoading, isError, refetch, isFetching } = useSession();

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

  return <>{children}</>;
}

function SessionFallback() {
  return (
    <div className="rounded-card border border-border bg-card p-10 text-center text-sm text-muted">
      Memeriksa sesi…
    </div>
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
