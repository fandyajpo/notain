import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { getShellClient } from '../../../lib/query/shell-client';
import { useAdminMembership } from '../../../lib/query/hooks/use-admin';
import { navLinkClass } from '../../../lib/ui/classes';
import { ADMIN_GROUP_LABEL, ADMIN_NAV_ITEMS } from '../../../lib/nav';

/**
 * The Admin Panel section of the sidebar: a section label plus one link per
 * admin page, rendered only when the signed-in user is a member of the
 * `admins` team. Both parts are one island because the membership check
 * decides whether the *group* exists at all — a non-admin must not see an
 * empty heading.
 *
 * The check is cached by TanStack Query so navigating between pages does not
 * re-hit Appwrite each time, and it fails closed: 403/404 leaves `isAdmin`
 * falsy. Server-side protection is enforced separately by the admin API, and
 * each linked page re-runs the same gate client-side.
 *
 * Rendered in the app shell (`DashboardLayout.astro`), outside every page
 * island, so it brings its own shell-scoped `QueryClient` — the same one
 * sign-out uses. The label is deliberately outside `sidebar-label`'s item
 * styling but carries the class, so collapsing the rail drops the heading
 * along with the link text.
 *
 * Each link carries `data-nav-link`, so the shell's `syncNav` script keeps
 * the active styling in step with the URL after every ClientRouter swap (and
 * paints the right one on first load, before React mounts).
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
  const [pathname, setPathname] = useState(() => window.location.pathname);

  // The sidebar is a persist region, so this island does not remount on a
  // ClientRouter swap; re-read the path when one lands so the active chip
  // follows the URL (the shell's syncNav does the same for plain links, but
  // this island mounts after it has already run once).
  useEffect(() => {
    const sync = () => setPathname(window.location.pathname);
    document.addEventListener('astro:page-load', sync);
    return () => document.removeEventListener('astro:page-load', sync);
  }, []);

  if (!isAdmin) return null;

  return (
    <div className="mt-2 flex flex-col gap-1">
      <p className="sidebar-label px-3 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wider text-muted">
        {ADMIN_GROUP_LABEL}
      </p>
      {ADMIN_NAV_ITEMS.map(({ href, label, Icon }) => (
        <a
          key={href}
          href={href}
          data-astro-prefetch
          data-nav-link
          aria-label={label}
          title={label}
          className={`sidebar-link flex items-center gap-2 rounded-control px-3 py-2 text-sm transition-colors ${navLinkClass(isActiveAdminLink(pathname, href))}`}
        >
          <Icon size={16} aria-hidden="true" />
          <span className="sidebar-label">{label}</span>
        </a>
      ))}
    </div>
  );
}

/** Same rule the shell's syncNav uses: exact match, or a child of the link. */
function isActiveAdminLink(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
