import { useEffect, useState } from 'react';
import { AuthGate } from '../auth/auth-gate';
import { AppProviders } from '../providers';
import { IslandBoundary } from '../ui/island-boundary';
import { SegmentedControl } from '../ui/segmented';
import { LoadingState } from '../ui/state';
import { AdminUsersPanel } from './admin-users-panel';
import { AdminAuditPanel } from './admin-audit-panel';
import { AdminContentPanel } from './admin-content-panel';
import { useAdminMembership } from '../../../lib/query/hooks/use-admin';

type AdminTab = 'users' | 'content' | 'audit';

/** Admin panel: manage users, manage one user's content, read the action log. */
export function AdminApp() {
  return (
    <IslandBoundary>
      <AppProviders>
        <AuthGate>
          <AdminGate>
            <AdminContent />
          </AdminGate>
        </AuthGate>
      </AppProviders>
    </IslandBoundary>
  );
}

/**
 * Client-side page gate for `/admin`.
 *
 * The Appwrite session lives in localStorage (the endpoint is cross-origin,
 * so no first-party cookie exists) — a static `/admin` request carries no
 * auth a server middleware could read. So the page gate is enforced here:
 * once membership resolves, anyone who is not in the `admins` team is thrown
 * to the dashboard. Fail closed — an errored check (403/404) counts as
 * "not an admin". The real data boundary is the admin API, which re-checks
 * membership server-side.
 */
function AdminGate({ children }: { children: React.ReactNode }) {
  const { data: isAdmin, isLoading } = useAdminMembership();

  useEffect(() => {
    if (isLoading) return;
    if (isAdmin !== true) window.location.replace('/dashboard');
  }, [isLoading, isAdmin]);

  if (isLoading || isAdmin !== true) {
    return <LoadingState label="Memeriksa akses admin…" />;
  }

  return <>{children}</>;
}

function AdminContent() {
  const [tab, setTab] = useState<AdminTab>('users');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold text-foreground">Admin</h1>
        <SegmentedControl<AdminTab>
          value={tab}
          onChange={setTab}
          variant="accent"
          size="sm"
          ariaLabel="Tab admin"
          options={[
            { value: 'users', label: 'Pengguna' },
            { value: 'content', label: 'Konten pengguna' },
            { value: 'audit', label: 'Log aktivitas' },
          ]}
        />
      </div>

      {tab === 'users' ? (
        <AdminUsersPanel />
      ) : tab === 'content' ? (
        <AdminContentPanel />
      ) : (
        <AdminAuditPanel />
      )}
    </div>
  );
}
