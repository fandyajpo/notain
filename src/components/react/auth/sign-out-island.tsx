import { AppProviders } from '../providers';
import { SignOutButton } from './sign-out-button';

/**
 * Sign-out as a self-contained island for the app shell.
 *
 * The shell lives in `DashboardLayout.astro`, outside every page island, so it
 * gets its own `QueryClient` here. That is deliberate: sign-out ends the
 * Appwrite session itself and then navigates to `/login`, which throws the
 * whole document away — nothing on the page reads that cache afterwards, and
 * the alternative (reaching across into whichever page island happens to be
 * mounted) would couple the shell to pages it does not know about.
 */
export function SignOutIsland() {
  return (
    <AppProviders>
      <SignOutButton />
    </AppProviders>
  );
}
