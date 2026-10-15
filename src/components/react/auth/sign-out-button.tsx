import { LogOut } from 'lucide-react';
import { toAppError } from '../../../appwrite/errors';
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
            // `signOut` already forgets the local session when the server
            // says the session is gone or the account is blocked; anything
            // reaching here is a genuine network failure.
            toast(toAppError(error).message, { variant: 'error' });
          });
      }}
    >
      <LogOut size={15} aria-hidden="true" />
      <span className="sidebar-label">Keluar</span>
    </Button>
  );
}
