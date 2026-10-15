import { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Search, Shield, Users } from 'lucide-react';
import { AuthGate } from '../auth/auth-gate';
import { AppProviders } from '../providers';
import { IslandBoundary } from '../ui/island-boundary';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Modal } from '../ui/modal';
import { PageHeader } from '../ui/page-header';
import { Select } from '../ui/select';
import { TableShell, Th, Td, TBODY_ROW, THEAD_ROW } from '../ui/table';
import { Textarea } from '../ui/textarea';
import { FieldShell, useFieldIds } from '../ui/field';
import { toast } from '../../../lib/ui/toast';
import {
  useAdminMembership,
  useAdminUsers,
  useUpdateAdminUser,
} from '../../../lib/query/hooks/use-admin';
import type { AdminUser, AdminUserUpdate } from '../../../app/admin';
import { toAppError } from '../../../appwrite/errors';
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

const PLAN_OPTIONS = [
  { value: 'free', label: PLAN_LABELS.free },
  { value: 'pro', label: PLAN_LABELS.pro },
  { value: 'business', label: PLAN_LABELS.business },
];

/** Quick subscribe only offers the paid tiers (free is the "Lepas" outcome). */
const SUBSCRIBE_PLAN_OPTIONS = [
  { value: 'pro', label: PLAN_LABELS.pro },
  { value: 'business', label: PLAN_LABELS.business },
];

/**
 * Builds a plan-only update payload, carrying the user's existing profile
 * fields forward.
 *
 * The admin PATCH endpoint re-validates the whole profile (name is required),
 * so a plan change has to ship the current fields alongside the new plan —
 * otherwise it would blank them.
 */
function planUpdate(user: AdminUser, plan: string, planExpiresAt: string | null): AdminUserUpdate {
  return {
    userId: user.userId,
    name: user.name,
    businessName: user.businessName,
    phone: user.phone,
    address: user.address,
    email: user.profileEmail,
    plan,
    planExpiresAt,
  };
}

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

  // List filter.
  const [query, setQuery] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const searchIds = useFieldIds();
  const planFilterIds = useFieldIds();

  // Quick subscribe (pick a plan) / unsubscribe (back to free).
  const [subscribeTarget, setSubscribeTarget] = useState<AdminUser | null>(null);
  const [subPlan, setSubPlan] = useState('pro');
  const [subExpiry, setSubExpiry] = useState('');
  const subPlanIds = useFieldIds();
  const subExpiryIds = useFieldIds();
  const [unsubscribeTarget, setUnsubscribeTarget] = useState<AdminUser | null>(null);

  // Client-side filter over the loaded list (already capped server-side).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((user) => {
      if (planFilter && user.plan !== planFilter) return false;
      if (!q) return true;
      return (
        user.name.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q) ||
        user.businessName.toLowerCase().includes(q)
      );
    });
  }, [users, query, planFilter]);

  const openEdit = (user: AdminUser) => {
    updateAdminUser.reset();
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

  // Normalized through `toAppError` so a raw `HTTP 500`-style string from the
  // admin route never reaches the user.
  const errorMessage =
    (error ? toAppError(error).message : null) ??
    (updateAdminUser.error ? toAppError(updateAdminUser.error).message : null);

  function openSubscribe(user: AdminUser) {
    updateAdminUser.reset();
    setSubscribeTarget(user);
    setSubPlan('pro');
    setSubExpiry('');
  }

  async function confirmSubscribe() {
    if (!subscribeTarget) return;
    // The PATCH endpoint re-validates the whole profile and requires a name,
    // so a nameless user would be rejected server-side. Say so up front.
    if (!subscribeTarget.name.trim()) {
      toast('User ini belum punya nama. Lengkapi lewat Edit dulu.', { variant: 'error' });
      return;
    }
    try {
      await updateAdminUser.mutateAsync(
        planUpdate(subscribeTarget, subPlan, subExpiry || null),
      );
      toast(`${subscribeTarget.name || subscribeTarget.email} kini berlangganan ${PLAN_LABELS[subPlan] ?? subPlan}.`, {
        variant: 'success',
      });
      setSubscribeTarget(null);
    } catch {
      // Surfaced via updateAdminUser.error in the banner.
    }
  }

  async function confirmUnsubscribe() {
    if (!unsubscribeTarget) return;
    if (!unsubscribeTarget.name.trim()) {
      toast('User ini belum punya nama. Lengkapi lewat Edit dulu.', { variant: 'error' });
      return;
    }
    try {
      await updateAdminUser.mutateAsync(planUpdate(unsubscribeTarget, 'free', null));
      toast(`Langganan ${unsubscribeTarget.name || unsubscribeTarget.email} dilepas.`, {
        variant: 'success',
      });
      setUnsubscribeTarget(null);
    } catch {
      // Surfaced via updateAdminUser.error in the banner.
    }
  }

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

      {users.length > 0 && (
        <div className="flex w-full flex-col gap-2 sm:max-w-md sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-xs">
            <Search
              size={15}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <label htmlFor={searchIds.id} className="sr-only">
              Cari user
            </label>
            <Input
              id={searchIds.id}
              type="search"
              value={query}
              placeholder="Cari nama, email, atau usaha…"
              className="h-10 pr-3 pl-9"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="w-full sm:w-auto">
            <label htmlFor={planFilterIds.id} className="sr-only">
              Filter plan
            </label>
            <Select
              id={planFilterIds.id}
              size="sm"
              clearable
              value={planFilter}
              aria-label="Filter plan"
              placeholder="Semua plan"
              options={PLAN_OPTIONS}
              onChange={setPlanFilter}
              className="w-full sm:w-auto"
            />
          </div>
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
                  {error ? (
                    // The list failed to load — don't claim there are no users.
                    <>
                      <p className="font-medium text-danger">Gagal memuat user</p>
                      <p className="mt-1 text-sm text-muted">
                        Periksa koneksi internet kamu, lalu muat ulang.
                      </p>
                      <div className="mt-4 flex justify-center">
                        <Button size="sm" loading={isFetching} onClick={() => void refetch()}>
                          Coba lagi
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <Users size={20} className="mx-auto mb-2 opacity-50" aria-hidden="true" />
                      Belum ada user terdaftar.
                    </>
                  )}
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted">
                  Tidak ada user yang cocok.
                </td>
              </tr>
            ) : (
              filtered.map((user) => (
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
                    <div className="flex items-center justify-end gap-1.5">
                      {user.plan === 'free' ? (
                        <Button size="sm" onClick={() => openSubscribe(user)}>
                          Subscribe
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            updateAdminUser.reset();
                            setUnsubscribeTarget(user);
                          }}
                          className="text-muted hover:border-danger/40 hover:text-danger"
                        >
                          Lepas
                        </Button>
                      )}
                      <Button variant="secondary" size="sm" onClick={() => openEdit(user)}>
                        Edit
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </TableShell>
      )}

      {/* Edit modal */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        size="lg"
        title={
          <>
            Edit Profil
            <span className="block text-sm font-normal text-muted">{editing?.email} · login</span>
          </>
        }
        actions={[
          {
            label: 'Batal',
            variant: 'secondary',
            disabled: updateAdminUser.isPending,
            onClick: () => setEditing(null),
          },
          {
            label: 'Simpan',
            loading: updateAdminUser.isPending,
            onClick: () => void saveEdit(),
          },
        ]}
      >
        <div className="flex flex-col gap-4">
          {updateAdminUser.isError && (
            <p
              role="alert"
              className="rounded-control border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-danger"
            >
              {toAppError(updateAdminUser.error).message}
            </p>
          )}
          <FieldShell label="Nama" htmlFor="admin-name" required error={formErrors.name}>
            <Input
              id="admin-name"
              type="text"
              value={form.name}
              invalid={Boolean(formErrors.name)}
              onChange={(e) => setField('name', e.target.value)}
            />
          </FieldShell>

          <FieldShell label="Nama usaha" htmlFor="admin-business" error={formErrors.businessName}>
            <Input
              id="admin-business"
              type="text"
              value={form.businessName}
              invalid={Boolean(formErrors.businessName)}
              onChange={(e) => setField('businessName', e.target.value)}
            />
          </FieldShell>

          <FieldShell
            label="Email"
            htmlFor="admin-email"
            error={formErrors.email}
            hint="Email bisnis (opsional) — bukan email login."
          >
            <Input
              id="admin-email"
              type="email"
              value={form.email}
              invalid={Boolean(formErrors.email)}
              onChange={(e) => setField('email', e.target.value)}
            />
          </FieldShell>

          <FieldShell label="Nomor WhatsApp" htmlFor="admin-phone" error={formErrors.phone}>
            <Input
              id="admin-phone"
              type="tel"
              value={form.phone}
              invalid={Boolean(formErrors.phone)}
              onChange={(e) => setField('phone', e.target.value)}
            />
          </FieldShell>

          <FieldShell label="Alamat" htmlFor="admin-address" error={formErrors.address}>
            <Textarea
              id="admin-address"
              value={form.address}
              invalid={Boolean(formErrors.address)}
              onChange={(e) => setField('address', e.target.value)}
            />
          </FieldShell>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FieldShell label="Plan" htmlFor="admin-plan">
              <Select
                id="admin-plan"
                value={form.plan}
                options={PLAN_OPTIONS}
                onChange={(next) => setField('plan', next)}
              />
            </FieldShell>

            <FieldShell
              label="Berlaku sampai"
              htmlFor="admin-expiry"
              hint="Kosongkan untuk lifetime."
            >
              <Input
                id="admin-expiry"
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </FieldShell>
          </div>
        </div>
      </Modal>

      {/* Quick subscribe: pick a plan + optional expiry. */}
      <Modal
        open={subscribeTarget !== null}
        onClose={() => setSubscribeTarget(null)}
        size="sm"
        title="Subscribe user"
        actions={[
          {
            label: 'Batal',
            variant: 'secondary',
            disabled: updateAdminUser.isPending,
            onClick: () => setSubscribeTarget(null),
          },
          {
            label: 'Subscribe',
            loading: updateAdminUser.isPending,
            onClick: () => void confirmSubscribe(),
          },
        ]}
      >
        <div className="flex flex-col gap-4">
          {updateAdminUser.isError && (
            <p
              role="alert"
              className="rounded-control border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-danger"
            >
              {toAppError(updateAdminUser.error).message}
            </p>
          )}
          <p className="text-sm text-muted">
            {subscribeTarget?.name || subscribeTarget?.email} akan diberi plan berbayar.
          </p>
          <FieldShell label="Plan" htmlFor={subPlanIds.id}>
            <Select
              id={subPlanIds.id}
              value={subPlan}
              options={SUBSCRIBE_PLAN_OPTIONS}
              onChange={setSubPlan}
            />
          </FieldShell>
          <FieldShell label="Berlaku sampai" htmlFor={subExpiryIds.id} hint="Kosongkan untuk lifetime.">
            <Input
              id={subExpiryIds.id}
              type="date"
              value={subExpiry}
              onChange={(e) => setSubExpiry(e.target.value)}
            />
          </FieldShell>
        </div>
      </Modal>

      {/* Unsubscribe confirmation: back to free, expiry cleared. */}
      <Modal
        open={unsubscribeTarget !== null}
        onClose={() => setUnsubscribeTarget(null)}
        role="alertdialog"
        size="sm"
        ariaLabelledBy="unsubscribe-title"
        title={<span id="unsubscribe-title">Lepas langganan?</span>}
        actions={[
          { label: 'Batal', variant: 'secondary', onClick: () => setUnsubscribeTarget(null) },
          {
            label: 'Lepas',
            variant: 'danger',
            loading: updateAdminUser.isPending,
            onClick: () => void confirmUnsubscribe(),
          },
        ]}
      >
        {updateAdminUser.isError && (
          <p
            role="alert"
            className="mb-3 rounded-control border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-danger"
          >
            {toAppError(updateAdminUser.error).message}
          </p>
        )}
        <p className="text-sm text-muted">
          Plan <span className="font-medium text-foreground">{unsubscribeTarget?.name || unsubscribeTarget?.email}</span>{' '}
          akan kembali ke Free dan masa berlakunya dihapus.
        </p>
      </Modal>
    </div>
  );
}
