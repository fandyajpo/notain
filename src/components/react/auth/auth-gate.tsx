import { useEffect, type ReactNode } from 'react';
import { Ban } from 'lucide-react';
import { useSession, useSignOut } from '../../../lib/query/hooks/use-session';
import { toast } from '../../../lib/ui/toast';
import { ERROR_CODES, isAppError } from '../../../core/shared/errors';
import { Button } from '../ui/button';
import { ErrorState, LoadingState } from '../ui/state';
import { OrgGate } from './org-gate';

type Props = {
  children: ReactNode;
  /** Rendered while the session is still resolving. */
  fallback?: ReactNode;
};

/** Client-side session gate for the statically rendered protected pages. */
export function AuthGate({ children, fallback }: Props) {
  const { data: session, isLoading, isError, error, refetch, isFetching } = useSession();

  useEffect(() => {
    if (isLoading || isError || session) return;
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    toast('Silakan masuk terlebih dahulu.', { variant: 'info' });
    window.location.replace(`/login?next=${next}`);
  }, [isLoading, isError, session]);

  if (isError) {
    if (isAppError(error) && error.code === ERROR_CODES.SUSPENDED) {
      return <SuspendedScreen message={error.message} />;
    }
    return <SessionLoadError onRetry={() => void refetch()} retrying={isFetching} />;
  }

  if (isLoading || !session) return <>{fallback ?? <LoadingState label="Memeriksa sesi…" />}</>;

  // Admin authorization is independent of organization membership. Settings
  // remains usable without a workspace; the organization settings page itself
  // hides its organization controls when the list is empty.
  const path = window.location.pathname;
  if (path.startsWith('/admin/') || path.startsWith('/settings')) return <>{children}</>;
  return <OrgGate fallback={fallback}>{children}</OrgGate>;
}

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
            .then(() => window.location.assign('/login'))
            .catch(() => toast('Gagal keluar. Coba lagi.', { variant: 'error' }));
        }}
      >
        Keluar
      </Button>
    </div>
  );
}
