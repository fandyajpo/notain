import { useEffect, useState } from 'react';
import { ChevronDown, Loader2, RefreshCw, Shield, Users } from 'lucide-react';
import { AuthGate } from '../auth/auth-gate';
import { AppProviders } from '../providers';
import { IslandBoundary } from '../ui/island-boundary';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card } from '../ui/card';
import { PageHeader } from '../ui/page-header';
import { TableShell, Th, Td, TBODY_ROW, THEAD_ROW } from '../ui/table';
import { controlClass, FieldShell } from '../ui/field';
import {
  useAdminMembership,
  useAdminUsers,
  useUpdateAdminUser,
} from '../../../lib/query/hooks/use-admin';
import type { AdminUser, AdminUserUpdate } from '../../../app/admin';
import { profileFormSchema } from '../../../core/profile/model';

type PlanVariant = 'neutral' | 'accent' | 'warning';

const PLAN_VARIANTS: Record<string, PlanVariant> = {
  free: 'neutral',
  pro: 'accent',
  business: 'warning',
};

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  business: 'Business',
};

/** Admin panel: list users, update plan and expiry. */
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
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-muted" aria-hidden="true" />
      </div>
    );
  }

  return <>{children}</>;
}

function AdminContent() {
  const { data: users = [], isFetching, error, refetch } = useAdminUsers();
  const updateAdminUser = useUpdateAdminUser();

  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [form, setForm] = useState<AdminUserUpdate>({
    userId: '',
    name: '',
    businessName: '',
    phone: '',
    address: '',
    email: '',
    plan: 'free',
    planExpiresAt: null,
  });
  // The date input works in YYYY-MM-DD; the row stores an ISO string.
  const [expiryDate, setExpiryDate] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const openEdit = (user: AdminUser) => {
    setEditing(user);
    setForm({
      userId: user.userId,
      name: user.name,
      businessName: user.businessName,
      phone: user.phone,
      address: user.address,
      email: user.profileEmail,
      plan: user.plan,
      planExpiresAt: user.planExpiresAt,
    });
    setExpiryDate(user.planExpiresAt ? user.planExpiresAt.slice(0, 10) : '');
    setFormErrors({});
  };

  const setField = (key: keyof AdminUserUpdate, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const saveEdit = async () => {
    if (!editing) return;
    const parsed = profileFormSchema.safeParse({
      name: form.name,
      businessName: form.businessName,
      phone: form.phone,
      address: form.address,
      email: form.email,
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? '');
        if (key && !errs[key]) errs[key] = issue.message;
      }
      setFormErrors(errs);
      return;
    }
    setFormErrors({});
    try {
      await updateAdminUser.mutateAsync({
        userId: editing.userId,
        name: parsed.data.name,
        businessName: parsed.data.businessName,
        phone: parsed.data.phone,
        address: parsed.data.address,
        email: parsed.data.email,
        plan: form.plan,
        planExpiresAt: expiryDate || null,
      });
      setEditing(null);
    } catch {
      // Error is surfaced via updateAdminUser.isError / error below.
    }
  };

  const errorMessage =
    (error instanceof Error ? error.message : null) ??
    (updateAdminUser.error instanceof Error ? updateAdminUser.error.message : null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Shield size={22} aria-hidden="true" className="text-accent" />
            Admin
          </span>
        }
        description="Kelola profil dan subscription plan user."
        actions={
          <Button
            variant="secondary"
            size="sm"
            loading={isFetching}
            onClick={() => void refetch()}
          >
            <RefreshCw size={15} aria-hidden="true" />
            Muat ulang
          </Button>
        }
      />

      {errorMessage && (
        <div className="rounded-control border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger">
          {errorMessage}
        </div>
      )}

      {isFetching && users.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-muted" aria-hidden="true" />
        </div>
      ) : (
        <TableShell minWidth="720px">
          <thead>
            <tr className={THEAD_ROW}>
              <Th>User</Th>
              <Th>Email</Th>
              <Th>Plan</Th>
              <Th>Berlaku sampai</Th>
              <Th>Daftar</Th>
              <Th align="right">Aksi</Th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted">
                  <Users size={20} className="mx-auto mb-2 opacity-50" aria-hidden="true" />
                  Belum ada user terdaftar.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.userId} className={TBODY_ROW}>
                  <Td>
                    <div className="font-medium">{user.name || '—'}</div>
                    {user.businessName && (
                      <div className="text-xs text-muted">{user.businessName}</div>
                    )}
                  </Td>
                  <Td className="text-muted">{user.email}</Td>
                  <Td>
                    <Badge variant={PLAN_VARIANTS[user.plan] ?? 'neutral'}>
                      {PLAN_LABELS[user.plan] ?? user.plan}
                    </Badge>
                  </Td>
                  <Td className="text-muted">
                    {user.planExpiresAt
                      ? new Date(user.planExpiresAt).toLocaleDateString('id-ID')
                      : '—'}
                  </Td>
                  <Td className="text-muted">
                    {new Date(user.createdAt).toLocaleDateString('id-ID')}
                  </Td>
                  <Td align="right">
                    <Button variant="secondary" size="sm" onClick={() => openEdit(user)}>
                      Edit
                    </Button>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </TableShell>
      )}

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4">
          <Card padding="lg" className="w-full max-w-lg">
            <h2 className="text-title">Edit Profil</h2>
            <p className="mt-1 text-sm text-muted">
              {editing.email}
              <span className="text-muted"> · login</span>
            </p>

            <div className="mt-5 flex flex-col gap-4">
              <FieldShell label="Nama" htmlFor="admin-name" required error={formErrors.name}>
                <input
                  id="admin-name"
                  type="text"
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                  className={controlClass({ invalid: Boolean(formErrors.name) })}
                />
              </FieldShell>

              <FieldShell label="Nama usaha" htmlFor="admin-business" error={formErrors.businessName}>
                <input
                  id="admin-business"
                  type="text"
                  value={form.businessName}
                  onChange={(e) => setField('businessName', e.target.value)}
                  className={controlClass({ invalid: Boolean(formErrors.businessName) })}
                />
              </FieldShell>

              <FieldShell
                label="Email"
                htmlFor="admin-email"
                error={formErrors.email}
                hint="Email bisnis (opsional) — bukan email login."
              >
                <input
                  id="admin-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setField('email', e.target.value)}
                  className={controlClass({ invalid: Boolean(formErrors.email) })}
                />
              </FieldShell>

              <FieldShell label="Nomor WhatsApp" htmlFor="admin-phone" error={formErrors.phone}>
                <input
                  id="admin-phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setField('phone', e.target.value)}
                  className={controlClass({ invalid: Boolean(formErrors.phone) })}
                />
              </FieldShell>

              <FieldShell label="Alamat" htmlFor="admin-address" error={formErrors.address}>
                <textarea
                  id="admin-address"
                  value={form.address}
                  onChange={(e) => setField('address', e.target.value)}
                  className={controlClass({ multiline: true, invalid: Boolean(formErrors.address) })}
                />
              </FieldShell>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FieldShell label="Plan" htmlFor="admin-plan">
                  <div className="relative">
                    <select
                      id="admin-plan"
                      value={form.plan}
                      onChange={(e) => setField('plan', e.target.value)}
                      className={`${controlClass()} appearance-none pr-10`}
                    >
                      <option value="free">Free</option>
                      <option value="pro">Pro</option>
                      <option value="business">Business</option>
                    </select>
                    <ChevronDown
                      size={16}
                      className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted"
                      aria-hidden="true"
                    />
                  </div>
                </FieldShell>

                <FieldShell
                  label="Berlaku sampai"
                  htmlFor="admin-expiry"
                  hint="Kosongkan untuk lifetime."
                >
                  <input
                    id="admin-expiry"
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className={controlClass()}
                  />
                </FieldShell>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <Button
                variant="secondary"
                full
                disabled={updateAdminUser.isPending}
                onClick={() => setEditing(null)}
              >
                Batal
              </Button>
              <Button
                full
                loading={updateAdminUser.isPending}
                onClick={() => void saveEdit()}
              >
                Simpan
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
