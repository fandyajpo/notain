import { LogOut } from 'lucide-react';
import { toAppError } from '../../../appwrite/errors';
import { ERROR_CODES } from '../../../core/shared/errors';
import { useSignOut } from '../../../lib/query/hooks/use-session';
import { toast } from '../../../lib/ui/toast';
import { Button } from '../ui/button';

export function SignOutButton() {
  const signOut = useSignOut();

  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label="Keluar dari akun"
      loading={signOut.isPending}
      onClick={() => {
        signOut
          .mutateAsync()
          .then(() => {
            window.location.assign('/login');
          })
          .catch((error: unknown) => {
            // Normalise first: a raw `AppwriteException` is not an `AppError`,
            // so its status code has to be mapped before we can inspect it.
            const appError = toAppError(error);
            // There is no session left to end — the user is already signed out.
            if (appError.code === ERROR_CODES.UNAUTHENTICATED) {
              window.location.assign('/login');
              return;
            }
            toast(appError.message, { variant: 'error' });
          });
      }}
    >
      <LogOut size={15} aria-hidden="true" />
      <span className="sidebar-label">Keluar</span>
    </Button>
  );
}
