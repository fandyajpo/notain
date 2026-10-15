import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Shield } from 'lucide-react';
import { getShellClient } from '../../../lib/query/shell-client';
import { useAdminMembership } from '../../../lib/query/hooks/use-admin';
import { navLinkClass } from '../../../lib/ui/classes';

/**
 * Admin nav link that only renders when the signed-in user is a member of
 * the `admins` team. The membership check is cached by TanStack Query so
 * navigating between pages does not re-hit Appwrite each time.
 * Server-side route protection is enforced separately by the admin API.
 *
 * Rendered in the app shell (`DashboardLayout.astro`), outside every page
 * island, so it brings its own shell-scoped `QueryClient` — the same one
 * sign-out uses.
 */
export function AdminNavLink() {
  const [client] = useState(getShellClient);

  return (
    <QueryClientProvider client={client}>
      <AdminLink />
    </QueryClientProvider>
  );
}

function AdminLink() {
  const { data: isAdmin } = useAdminMembership();

  if (!isAdmin) return null;

  return (
    <a
      href="/admin"
      data-astro-prefetch
      data-nav-link
      aria-label="Admin"
      className={`flex items-center gap-2 rounded-control px-3 py-2 text-sm transition-colors ${navLinkClass(false)}`}
    >
      <Shield size={16} aria-hidden="true" />
      <span className="sidebar-label">Admin</span>
    </a>
  );
}
