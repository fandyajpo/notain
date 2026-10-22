import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { AuthGate } from '../auth/auth-gate';
import { AppProviders } from '../providers';
import { IslandBoundary } from '../ui/island-boundary';
import { LoadingState } from '../ui/state';
import { PageHeader } from '../ui/page-header';
import { AdminUsersPanel } from './admin-users-panel';
import { AdminAuditPanel } from './admin-audit-panel';
import { AdminContentPanel } from './admin-content-panel';
import { AdminSupportPanel } from './admin-support-panel';
import { useAdminMembership } from '../../../lib/query/hooks/use-admin';

/**
 * The four admin destinations, one page each under `/admin`.
 *
 * The sidebar's Admin Panel group (`AdminNavGroup`) lists them; each Astro
 * page mounts its own island from here. All four share the same gate — the
 * split is at the URL level, not the permission level.
 */
export function AdminUsersApp() {
  return (
    <AdminShell title="Pengguna" description="Kelola akun pengguna dan status langganan.">
      <AdminUsersPanel />
    </AdminShell>
  );
}

export function AdminContentApp() {
  return (
    <AdminShell
      title="Konten pengguna"
      description="Kelola template dan invoice milik satu pengguna."
    >
      <AdminContentPanel />
    </AdminShell>
  );
}

export function AdminSupportApp() {
  return (
    <AdminShell
      title="Support"
      description="Pesan dari pengguna lewat formulir kontak, terbaru di atas."
    >
      <AdminSupportPanel />
    </AdminShell>
  );
}

export function AdminAuditApp() {
  return (
    <AdminShell title="Log aktivitas" description="Jejak aksi admin dan perubahan data.">
      <AdminAuditPanel />
    </AdminShell>
  );
}

function AdminShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <IslandBoundary>
      <AppProviders>
        <AuthGate>
          <AdminGate>
            <div className="flex flex-col gap-6">
              <PageHeader title={title} description={description} />
              {children}
            </div>
          </AdminGate>
        </AuthGate>
      </AppProviders>
    </IslandBoundary>
  );
}

/**
 * Client-side page gate for every `/admin/*` page.
 *
 * The Appwrite session lives in localStorage (the endpoint is cross-origin,
 * so no first-party cookie exists) — a static admin request carries no auth a
 * server middleware could read. So the page gate is enforced here: once
 * membership resolves, anyone who is not in the `admins` team is thrown to the
 * dashboard. Fail closed — an errored check (403/404) counts as "not an
 * admin". The real data boundary is the admin API, which re-checks membership
 * server-side.
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
