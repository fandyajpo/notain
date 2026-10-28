import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { getShellClient } from '../../lib/query/shell-client';

type Props = {
  children: ReactNode;
};

/**
 * Client-only wrapper that supplies the app-wide `QueryClient`.
 *
 * The client is the module-level singleton (`getShellClient`), NOT a fresh one
 * per island: page islands unmount and remount on every ClientRouter
 * navigation, and a per-mount client meant the org list, session and profile
 * were refetched from scratch on every menu click — and worse, a mutation's
 * `invalidateQueries` (e.g. renaming the organization) only reached the cache
 * of whichever island ran it, so the sidebar dropdown kept showing the old
 * name. One shared cache makes navigation cheap and invalidation global,
 * exactly the contract the shell islands already relied on.
 */
export function AppProviders({ children }: Props) {
  const [client] = useState<QueryClient>(getShellClient);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
