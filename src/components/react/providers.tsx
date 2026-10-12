import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { createQueryClient } from '../../lib/query/client';

type Props = {
  children: ReactNode;
};

/** Client-only wrapper that owns the app-wide `QueryClient`. */
export function AppProviders({ children }: Props) {
  const [client] = useState<QueryClient>(createQueryClient);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
