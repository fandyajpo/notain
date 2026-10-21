import { useMemo, useState } from 'react';
import { Ban, CheckCircle2, RefreshCw, Search, Users } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { LoadMore } from '../ui/load-more';
import { Modal } from '../ui/modal';
import { Notice } from '../ui/notice';
import { SearchField } from '../ui/search-field';
import { Select } from '../ui/select';
import { ErrorState, LoadingState } from '../ui/state';
import { TableShell, Th, Td, TBODY_ROW, THEAD_ROW } from '../ui/table';
import { Textarea } from '../ui/textarea';
import { FieldShell, useFieldIds } from '../ui/field';
import { toast } from '../../../lib/ui/toast';
import {
  useAdminUsers,
  useSetAdminUserStatus,
  useUpdateAdminUser,
} from '../../../lib/query/hooks/use-admin';
import type { AdminUser, AdminUserUpdate } from '../../../app/admin';
import { toAppError } from '../../../app/errors';
import { profileFormSchema } from '../../../core/profile/model';
import { AdminDrilldownModal } from './admin-drilldown-modal';

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

/** Users tab: list, search, plan management, suspend, and drill-down. */
export function AdminUsersPanel() {
  const { data, isFetching, hasNextPage, isFetchingNextPage, fetchNextPage, error, refetch } =
    useAdminUsers();
  const updateAdminUser = useUpdateAdminUser();
  const setUserStatus = useSetAdminUserStatus();

  const users = useMemo(() => data?.pages.flatMap((page) => page.users) ?? [], [data]);
  const total = data?.pages[0]?.total ?? 0;

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
  const planFilterIds = useFieldIds();

  // Quick subscribe (pick a plan) / unsubscribe (back to free).
  const [subscribeTarget, setSubscribeTarget] = useState<AdminUser | null>(null);
  const [subPlan, setSubPlan] = useState('pro');
  const [subExpiry, setSubExpiry] = useState('');
  const subPlanIds = useFieldIds();
  const subExpiryIds = useFieldIds();
  const [unsubscribeTarget, setUnsubscribeTarget] = useState<AdminUser | null>(null);

  // Suspend / unsuspend confirmation.
  const [statusTarget, setStatusTarget] = useState<AdminUser | null>(null);

  // Drill-down modal.
  const [detailTarget, setDetailTarget] = useState<AdminUser | null>(null);

  // Client-side filter over the pages loaded so far.
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
    (updateAdminUser.error ? toAppError(updateAdminUser.error).message : null) ??
    (setUserStatus.error ? toAppError(setUserStatus.error).message : null);

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
      await updateAdminUser.mutateAsync(planUpdate(subscribeTarget, subPlan, subExpiry || null));
      toast(
        `${subscribeTarget.name || subscribeTarget.email} kini berlangganan ${PLAN_LABELS[subPlan] ?? subPlan}.`,
        { variant: 'success' },
      );
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

  async function confirmStatusChange() {
    if (!statusTarget) return;
    const action = statusTarget.status ? 'suspend' : 'unsuspend';
    try {
      await setUserStatus.mutateAsync({ userId: statusTarget.userId, action });
      toast(
        action === 'suspend'
          ? `${statusTarget.name || statusTarget.email} dinonaktifkan.`
          : `${statusTarget.name || statusTarget.email} diaktifkan kembali.`,
        { variant: 'success' },
      );
      setStatusTarget(null);
    } catch {
      // Surfaced via setUserStatus.error in the banner.
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {total > 0
            ? `${users.length} dari ${total} user dimuat`
            : 'Kelola profil dan subscription plan user.'}
        </p>
        <Button
          variant="secondary"
          size="sm"
          loading={isFetching && !isFetchingNextPage}
          onClick={() => void refetch()}
        >
          <RefreshCw size={15} aria-hidden="true" />
          Muat ulang
        </Button>
      </div>

      {errorMessage && <Notice variant="danger">{errorMessage}</Notice>}

      {users.length > 0 && (
        <div className="flex w-full flex-col gap-2 sm:max-w-md sm:flex-row sm:items-center">
          <SearchField
            value={query}
            placeholder="Cari nama, email, atau usaha…"
            aria-label="Cari user"
            onChange={setQuery}
          />
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
        <LoadingState label="Memuat user…" />
      ) : (
        <TableShell minWidth="840px">
          <thead>
            <tr className={THEAD_ROW}>
              <Th>User</Th>
              <Th>Email</Th>
              <Th>Status</Th>
              <Th>Plan</Th>
              <Th>Berlaku sampai</Th>
              <Th>Daftar</Th>
              <Th align="right">Aksi</Th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-4 text-center text-muted">
                  {error ? (
                    // The list failed to load — don't claim there are no users.
                    <ErrorState
                      inline
                      title="Gagal memuat user"
                      message="Periksa koneksi internet kamu, lalu muat ulang."
                      action={
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={isFetching}
                          onClick={() => void refetch()}
                        >
                          Coba lagi
                        </Button>
                      }
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-8">
                      <Users size={22} className="text-muted" aria-hidden="true" />
                      <p className="text-section text-foreground">Belum ada user terdaftar.</p>
                    </div>
                  )}
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-muted">
                  <div className="flex flex-col items-center gap-2">
                    <Search size={22} className="text-muted" aria-hidden="true" />
                    <p className="text-section text-foreground">Tidak ada user yang cocok.</p>
                  </div>
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
                    {user.status ? (
                      <Badge variant="success">Aktif</Badge>
                    ) : (
                      <Badge variant="danger">Dinonaktifkan</Badge>
                    )}
                  </Td>
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
                        <Button variant="secondary" size="sm" onClick={() => openSubscribe(user)}>
                          Subscribe
                        </Button>
                      ) : (
                        <Button
                          variant="danger-soft"
                          size="sm"
                          onClick={() => {
                            updateAdminUser.reset();
                            setUnsubscribeTarget(user);
                          }}
                        >
                          Lepas
                        </Button>
                      )}
                      {user.status ? (
                        <Button
                          variant="danger-soft"
                          size="sm"
                          onClick={() => {
                            setUserStatus.reset();
                            setStatusTarget(user);
                          }}
                        >
                          <Ban size={14} aria-hidden="true" />
                          Jeda
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setUserStatus.reset();
                            setStatusTarget(user);
                          }}
                        >
                          <CheckCircle2 size={14} aria-hidden="true" />
                          Aktifkan
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => setDetailTarget(user)}>
                        Detail
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(user)}>
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

      <LoadMore
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        fetchNextPage={() => void fetchNextPage()}
      />

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
            <Notice variant="danger">{toAppError(updateAdminUser.error).message}</Notice>
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
            <Notice variant="danger">{toAppError(updateAdminUser.error).message}</Notice>
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
          <FieldShell
            label="Berlaku sampai"
            htmlFor={subExpiryIds.id}
            hint="Kosongkan untuk lifetime."
          >
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
          <Notice variant="danger" className="mb-3">
            {toAppError(updateAdminUser.error).message}
          </Notice>
        )}
        <p className="text-sm text-muted">
          Plan{' '}
          <span className="font-medium text-foreground">
            {unsubscribeTarget?.name || unsubscribeTarget?.email}
          </span>{' '}
          akan kembali ke Free dan masa berlakunya dihapus.
        </p>
      </Modal>

      {/* Suspend / unsuspend confirmation. */}
      <Modal
        open={statusTarget !== null}
        onClose={() => setStatusTarget(null)}
        role="alertdialog"
        size="sm"
        ariaLabelledBy="status-title"
        title={
          <span id="status-title">
            {statusTarget?.status ? 'Nonaktifkan akun?' : 'Aktifkan kembali akun?'}
          </span>
        }
        actions={[
          { label: 'Batal', variant: 'secondary', onClick: () => setStatusTarget(null) },
          statusTarget?.status
            ? {
                label: 'Nonaktifkan',
                variant: 'danger',
                loading: setUserStatus.isPending,
                onClick: () => void confirmStatusChange(),
              }
            : {
                label: 'Aktifkan',
                loading: setUserStatus.isPending,
                onClick: () => void confirmStatusChange(),
              },
        ]}
      >
        {setUserStatus.isError && (
          <Notice variant="danger" className="mb-3">
            {toAppError(setUserStatus.error).message}
          </Notice>
        )}
        <p className="text-sm text-muted">
          {statusTarget?.status ? (
            <>
              <span className="font-medium text-foreground">
                {statusTarget?.name || statusTarget?.email}
              </span>{' '}
              tidak akan bisa masuk, dan sesi yang sedang berjalan akan berhenti berfungsi.
            </>
          ) : (
            <>
              <span className="font-medium text-foreground">
                {statusTarget?.name || statusTarget?.email}
              </span>{' '}
              akan bisa masuk dan memakai aplikasi kembali.
            </>
          )}
        </p>
      </Modal>

      <AdminDrilldownModal user={detailTarget} onClose={() => setDetailTarget(null)} />
    </div>
  );
}
