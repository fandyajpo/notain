import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { getShellClient } from '../../../lib/query/shell-client';
import { SignOutButton } from './sign-out-button';

/**
 * Sign-out as a self-contained island for the app shell.
 *
 * The shell lives in `DashboardLayout.astro`, outside every page island, so it
 * needs a `QueryClient` of its own — sign-out ends the Appwrite session itself
 * and then navigates to `/login`, which throws the whole document away;
 * nothing on the page reads that cache afterwards, and reaching across into
 * whichever page island happens to be mounted would couple the shell to pages
 * it does not know about.
 *
 * The shell renders it twice (mobile header + desktop sidebar foot), so the
 * client is shared via `getShellClient` rather than created per instance.
 */
export function SignOutIsland() {
  const [client] = useState(getShellClient);

  return (
    <QueryClientProvider client={client}>
      <SignOutButton />
    </QueryClientProvider>
  );
}
