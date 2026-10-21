import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Shield } from 'lucide-react';
import { getShellClient } from '../../../lib/query/shell-client';
import { useAdminMembership } from '../../../lib/query/hooks/use-admin';
import { navLinkClass } from '../../../lib/ui/classes';
import { ADMIN_GROUP_LABEL } from '../../../lib/nav';

/**
 * The Administration section of the sidebar: a section label plus the link to
 * `/admin`, rendered only when the signed-in user is a member of the `admins`
 * team. Both parts are one island because the membership check decides whether
 * the *group* exists at all — a non-admin must not see an empty heading.
 *
 * The check is cached by TanStack Query so navigating between pages does not
 * re-hit Appwrite each time, and it fails closed: 403/404 leaves `isAdmin`
 * falsy. Server-side protection is enforced separately by the admin API.
 *
 * Rendered in the app shell (`DashboardLayout.astro`), outside every page
 * island, so it brings its own shell-scoped `QueryClient` — the same one
 * sign-out uses. The label is deliberately outside `sidebar-label`'s item
 * styling but carries the class, so collapsing the rail drops the heading
 * along with the link text.
 */
export function AdminNavGroup() {
  const [client] = useState(getShellClient);

  return (
    <QueryClientProvider client={client}>
      <AdminGroup />
    </QueryClientProvider>
  );
}

function AdminGroup() {
  const { data: isAdmin } = useAdminMembership();

  if (!isAdmin) return null;

  return (
    <div className="mt-2 flex flex-col gap-1">
      <p className="sidebar-label px-3 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wider text-muted">
        {ADMIN_GROUP_LABEL}
      </p>
      <a
        href="/admin"
        data-astro-prefetch
        data-nav-link
        aria-label="Admin Panel"
        title="Admin Panel"
        className={`sidebar-link flex items-center gap-2 rounded-control px-3 py-2 text-sm transition-colors ${navLinkClass(false)}`}
      >
        <Shield size={16} aria-hidden="true" />
        <span className="sidebar-label">Admin Panel</span>
      </a>
    </div>
  );
}
