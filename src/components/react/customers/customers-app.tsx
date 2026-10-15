import { useMemo, useState } from 'react';
import { Check, Merge, Pencil, Plus, Search, Trash2, Users, X } from 'lucide-react';
import { AuthGate } from '../auth/auth-gate';
import { AppProviders } from '../providers';
import { IslandBoundary } from '../ui/island-boundary';
import { Button } from '../ui/button';
import { Card, cardClass, EmptyCard } from '../ui/card';
import { Modal } from '../ui/modal';
import { PageHeader } from '../ui/page-header';
import { FieldShell, useFieldIds } from '../ui/field';
import { Input } from '../ui/input';
import { usePageTour } from '../../../lib/tour/use-tour';
import {
  useCreateCustomer,
  useCustomers,
  useDeleteCustomer,
  useMergeCustomers,
  useUpdateCustomer,
} from '../../../lib/query/hooks/use-customers';
import { formatTanggalRelatif } from '../../../core/shared/dates';
import { toCustomerRows } from '../../../core/excel';
import { toAppError } from '../../../appwrite/errors';
import { toast } from '../../../lib/ui/toast';
import type { Customer, CustomerDraft } from '../../../core/customer/model';
import { ExportButtons } from '../excel/export-buttons';
import { CustomerImportPanel } from './customer-import';

const EMPTY_DRAFT: CustomerDraft = { name: '', email: '', phone: '' };

/**
 * Field-keyed validation messages on an `AppError`, or `null` when the failure
 * was not a validation one (duplicate, network, storage) and so has no field
 * to attach a message to.
 */
function takeFieldErrors(error: unknown): Record<string, string> | null {
  const fields = toAppError(error).fieldErrors;
  return Object.keys(fields).length > 0 ? { ...fields } : null;
}

/** The `/customers` island: the saved-customer directory, editable in place. */
export function CustomersApp() {
  return (
    <IslandBoundary>
      <AppProviders>
        <AuthGate>
          <CustomersContent />
        </AuthGate>
      </AppProviders>
    </IslandBoundary>
  );
}

function CustomersContent() {
  usePageTour('customers');
  const { data: customers, isLoading, isError, isFetching, refetch } = useCustomers();
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const deleteCustomer = useDeleteCustomer();
  const mergeCustomers = useMergeCustomers();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  // Server-side validation (overlong name/email/phone) comes back as
  // `fieldErrors`, keyed by the schema path. Rejected instead of the blocking
  // warning modal so the message sits under the field that caused it.
  const [createFieldErrors, setCreateFieldErrors] = useState<Record<string, string>>({});

  // Edit modal state.
  const [editing, setEditing] = useState<Customer | null>(null);
  const [editForm, setEditForm] = useState<CustomerDraft>(EMPTY_DRAFT);
  const [editFieldErrors, setEditFieldErrors] = useState<Record<string, string>>({});

  // Merge mode state.
  const [mergeMode, setMergeMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeChoices, setMergeChoices] = useState<CustomerDraft>(EMPTY_DRAFT);

  // List filter.
  const [query, setQuery] = useState('');
  // Delete confirmation.
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  // Blocking warning (e.g. an exact duplicate on create).
  const [warning, setWarning] = useState<string | null>(null);

  const nameIds = useFieldIds();
  const emailIds = useFieldIds();
  const phoneIds = useFieldIds();
  const searchIds = useFieldIds();

  const selectedCustomers = useMemo(
    () => (customers ?? []).filter((c) => selected.has(c.id)),
    [customers, selected],
  );

  // Client-side filter over the already-loaded directory (it is fetched whole,
  // so narrowing here needs no extra round-trip).
  const filtered = useMemo(() => {
    const list = customers ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.includes(q),
    );
  }, [customers, query]);

  function handleAdd() {
    const trimmed = name.trim();
    if (!trimmed) return;

    createCustomer.mutate(
      { name: trimmed, email: email.trim(), phone: phone.trim() },
      {
        onSuccess: () => {
          setName('');
          setEmail('');
          setPhone('');
          setCreateFieldErrors({});
        },
        onError: (error) => {
          const fieldErrors = takeFieldErrors(error);
          // Only a validation failure carries field keys — a duplicate or a
          // network drop still gets the blocking warning.
          if (fieldErrors) setCreateFieldErrors(fieldErrors);
          else setWarning(toAppError(error).message);
        },
      },
    );
  }

  function openEdit(customer: Customer) {
    setEditing(customer);
    setEditForm({ name: customer.name, email: customer.email, phone: customer.phone });
    setEditFieldErrors({});
  }

  function handleSaveEdit() {
    if (!editing) return;
    const trimmed = editForm.name.trim();
    if (!trimmed) return;

    updateCustomer.mutate(
      { id: editing.id, draft: { ...editForm, name: trimmed } },
      {
        onSuccess: () => {
          setEditing(null);
          toast('Customer berhasil diperbarui.', { variant: 'success' });
        },
        onError: (error) => {
          const fieldErrors = takeFieldErrors(error);
          if (fieldErrors) setEditFieldErrors(fieldErrors);
          else toast(toAppError(error).message, { variant: 'error' });
        },
      },
    );
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const { id, name } = deleteTarget;
    deleteCustomer.mutate(id, {
      onSuccess: () => {
        setDeleteTarget(null);
        toast(`Customer "${name}" dihapus.`, { variant: 'success' });
      },
      onError: (error) => {
        setDeleteTarget(null);
        toast(toAppError(error).message, { variant: 'error' });
      },
    });
  }

  function exitMergeMode() {
    setMergeMode(false);
    setSelected(new Set());
    setMergeOpen(false);
  }

  function openMergeDialog() {
    // Seed each field with the first non-empty value across the selection, so
    // a radio is always checked whenever any value exists. Seeding from
    // `selectedCustomers[0]` alone would leave a field un-checked when the
    // first row left it blank but a later row has a value — and confirming
    // then would save empty and drop the real value when the sources are
    // deleted.
    const firstWith = (field: keyof CustomerDraft) =>
      selectedCustomers.find((c) => c[field].trim())?.[field].trim() ?? '';

    setMergeChoices({
      name: firstWith('name'),
      email: firstWith('email'),
      phone: firstWith('phone'),
    });
    setMergeOpen(true);
  }

  function handleConfirmMerge() {
    const [target, ...sources] = selectedCustomers;
    if (!target || sources.length === 0) return;

    mergeCustomers.mutate(
      { targetId: target.id, sourceIds: sources.map((c) => c.id), draft: mergeChoices },
      {
        onSuccess: () => {
          exitMergeMode();
          toast(`${sources.length + 1} customer digabungkan.`, { variant: 'success' });
        },
        onError: (error) => {
          toast(toAppError(error).message, { variant: 'error' });
        },
      },
    );
  }

  /** Distinct non-empty values for one field across the selected customers. */
  function distinctValues(field: keyof CustomerDraft): string[] {
    const seen = new Set<string>();
    for (const c of selectedCustomers) {
      const value = c[field].trim();
      if (value) seen.add(value);
    }
    return [...seen];
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Customer"
        description="Daftar customer yang pernah kamu buat invoice. Otomatis terisi tiap kali kamu simpan invoice."
        actions={
          <div className="flex items-center gap-2">
            {mergeMode ? (
              <>
                <Button variant="secondary" size="sm" onClick={exitMergeMode}>
                  <X size={15} aria-hidden="true" />
                  Batal
                </Button>
                <Button
                  size="sm"
                  disabled={selectedCustomers.length < 2}
                  loading={mergeCustomers.isPending}
                  onClick={openMergeDialog}
                >
                  <Merge size={15} aria-hidden="true" />
                  Gabung {selectedCustomers.length > 0 ? selectedCustomers.length : ''}
                </Button>
              </>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                disabled={!customers || customers.length < 2}
                onClick={() => {
                  setMergeMode(true);
                  setSelected(new Set());
                }}
              >
                <Merge size={15} aria-hidden="true" />
                Gabungkan
              </Button>
            )}
            <ExportButtons
              filename="customer-notain"
              sheetName="Customer"
              getRows={() => toCustomerRows(customers ?? [])}
              disabled={!customers}
            />
          </div>
        }
      />

      <form
        data-tour="cust-form"
        onSubmit={(event) => {
          event.preventDefault();
          handleAdd();
        }}
        className={cardClass('sm', 'flex flex-col gap-4 sm:flex-row sm:items-end')}
      >
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor={nameIds.id} className="text-sm font-medium text-foreground">
            Nama <span className="text-danger">*</span>
          </label>
          <Input
            id={nameIds.id}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (createFieldErrors.name) setCreateFieldErrors((rest) => ({ ...rest, name: '' }));
            }}
            placeholder="Budi Santoso"
            autoComplete="off"
            invalid={Boolean(createFieldErrors.name)}
            aria-invalid={createFieldErrors.name ? 'true' : undefined}
            aria-describedby={createFieldErrors.name ? nameIds.errorId : undefined}
          />
          {createFieldErrors.name && (
            <p id={nameIds.errorId} role="alert" className="text-xs font-medium text-danger">
              {createFieldErrors.name}
            </p>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor={emailIds.id} className="text-sm font-medium text-foreground">
            Email
          </label>
          <Input
            id={emailIds.id}
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (createFieldErrors.email) {
                setCreateFieldErrors((rest) => ({ ...rest, email: '' }));
              }
            }}
            placeholder="budi@email.com"
            autoComplete="off"
            inputMode="email"
            invalid={Boolean(createFieldErrors.email)}
            aria-invalid={createFieldErrors.email ? 'true' : undefined}
            aria-describedby={createFieldErrors.email ? emailIds.errorId : undefined}
          />
          {createFieldErrors.email && (
            <p id={emailIds.errorId} role="alert" className="text-xs font-medium text-danger">
              {createFieldErrors.email}
            </p>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor={phoneIds.id} className="text-sm font-medium text-foreground">
            WhatsApp
          </label>
          <Input
            id={phoneIds.id}
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value);
              if (createFieldErrors.phone) {
                setCreateFieldErrors((rest) => ({ ...rest, phone: '' }));
              }
            }}
            placeholder="0812…"
            autoComplete="off"
            inputMode="tel"
            invalid={Boolean(createFieldErrors.phone)}
            aria-invalid={createFieldErrors.phone ? 'true' : undefined}
            aria-describedby={createFieldErrors.phone ? phoneIds.errorId : undefined}
          />
          {createFieldErrors.phone && (
            <p id={phoneIds.errorId} role="alert" className="text-xs font-medium text-danger">
              {createFieldErrors.phone}
            </p>
          )}
        </div>
        <Button
          type="submit"
          loading={createCustomer.isPending}
          disabled={name.trim() === ''}
          className="sm:w-auto"
        >
          <Plus size={16} aria-hidden="true" />
          Tambah
        </Button>
      </form>

      <CustomerImportPanel />

      {isLoading ? (
        <Card padding="none" className="px-4 py-10 text-center text-sm text-muted">
          Memuat customer…
        </Card>
      ) : isError && !customers ? (
        // A failed load must not masquerade as "Belum ada customer" — copy the
        // invoice table's two-state handling: full error + retry when empty,
        // stale rows when we still have them.
        <div
          role="alert"
          className="rounded-card border border-danger/25 bg-danger-soft px-6 py-12 text-center"
        >
          <p className="text-base font-semibold text-danger">Gagal memuat customer</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
            Periksa koneksi internet kamu, lalu coba lagi.
          </p>
          <div className="mt-5 flex justify-center">
            <Button size="sm" loading={isFetching} onClick={() => void refetch()}>
              Coba lagi
            </Button>
          </div>
        </div>
      ) : !customers || customers.length === 0 ? (
        <EmptyCard>
          <Users size={24} className="mx-auto text-muted" aria-hidden="true" />
          <p className="mt-2 font-medium">Belum ada customer</p>
          <p className="mt-1 text-sm text-muted">
            Tambahkan lewat form di atas, atau simpan invoice.
          </p>
        </EmptyCard>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="relative w-full sm:max-w-xs">
            <Search
              size={15}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <label htmlFor={searchIds.id} className="sr-only">
              Cari customer
            </label>
            <Input
              id={searchIds.id}
              type="search"
              value={query}
              placeholder="Cari nama, email, atau nomor…"
              className="h-10 pr-3 pl-9"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          {filtered.length === 0 ? (
            <Card padding="none" className="px-4 py-10 text-center text-sm text-muted">
              Tidak ada customer yang cocok.
            </Card>
          ) : (
            <ul data-tour="cust-list" className={cardClass('none', 'flex flex-col divide-y divide-border')}>
              {filtered.map((customer) => (
            <li key={customer.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                {mergeMode && (
                  <input
                    type="checkbox"
                    checked={selected.has(customer.id)}
                    onChange={() => toggleSelected(customer.id)}
                    className="h-4 w-4 shrink-0 accent-accent"
                    aria-label={`Pilih ${customer.name}`}
                  />
                )}
                <div className="min-w-0">
                  <p className="truncate font-medium">{customer.name}</p>
                  <p className="text-sm text-muted">
                    {[customer.email, customer.phone].filter(Boolean).join(' · ') ||
                      'Tanpa kontak'}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className="mr-2 hidden text-xs text-muted sm:inline">
                  {customer.lastUsedAt ? formatTanggalRelatif(customer.lastUsedAt) : ''}
                </span>
                {!mergeMode && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEdit(customer)}
                    aria-label={`Edit ${customer.name}`}
                  >
                    <Pencil size={15} aria-hidden="true" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteTarget(customer)}
                  aria-label={`Hapus ${customer.name}`}
                >
                  <Trash2 size={15} aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
            </ul>
          )}
        </div>
      )}

      {/* Edit customer */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        size="md"
        title="Edit Customer"
        actions={[
          {
            label: 'Batal',
            variant: 'secondary',
            disabled: updateCustomer.isPending,
            onClick: () => setEditing(null),
          },
          {
            label: 'Simpan',
            loading: updateCustomer.isPending,
            disabled: editForm.name.trim() === '',
            onClick: handleSaveEdit,
          },
        ]}
      >
        <div className="flex flex-col gap-4">
          <FieldShell label="Nama" htmlFor="edit-customer-name" required error={editFieldErrors.name}>
            <Input
              id="edit-customer-name"
              type="text"
              value={editForm.name}
              onChange={(e) => {
                setEditForm((f) => ({ ...f, name: e.target.value }));
                if (editFieldErrors.name) setEditFieldErrors((r) => ({ ...r, name: '' }));
              }}
              invalid={Boolean(editFieldErrors.name)}
            />
          </FieldShell>
          <FieldShell label="Email" htmlFor="edit-customer-email" error={editFieldErrors.email}>
            <Input
              id="edit-customer-email"
              type="email"
              value={editForm.email}
              onChange={(e) => {
                setEditForm((f) => ({ ...f, email: e.target.value }));
                if (editFieldErrors.email) setEditFieldErrors((r) => ({ ...r, email: '' }));
              }}
              invalid={Boolean(editFieldErrors.email)}
            />
          </FieldShell>
          <FieldShell label="WhatsApp" htmlFor="edit-customer-phone" error={editFieldErrors.phone}>
            <Input
              id="edit-customer-phone"
              type="tel"
              value={editForm.phone}
              onChange={(e) => {
                setEditForm((f) => ({ ...f, phone: e.target.value }));
                if (editFieldErrors.phone) setEditFieldErrors((r) => ({ ...r, phone: '' }));
              }}
              invalid={Boolean(editFieldErrors.phone)}
            />
          </FieldShell>
        </div>
      </Modal>

      {/* Merge dialog: pick the surviving value for each field. */}
      <Modal
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
        size="md"
        title="Gabungkan Customer"
        actions={[
          {
            label: 'Batal',
            variant: 'secondary',
            disabled: mergeCustomers.isPending,
            onClick: () => setMergeOpen(false),
          },
          {
            label: 'Gabung',
            icon: <Check size={15} aria-hidden="true" />,
            loading: mergeCustomers.isPending,
            onClick: handleConfirmMerge,
          },
        ]}
      >
        <p className="mb-4 text-sm text-muted">
          Pilih data yang ingin dipertahankan. Customer lain yang dipilih akan digabungkan ke
          dalamnya.
        </p>
        <div className="flex flex-col gap-5">
          {(['name', 'email', 'phone'] as const).map((field) => {
            const values = distinctValues(field);
            const label = field === 'name' ? 'Nama' : field === 'email' ? 'Email' : 'WhatsApp';
            return (
              <fieldset key={field}>
                <legend className="mb-2 text-sm font-medium text-foreground">{label}</legend>
                {values.length === 0 ? (
                  <p className="text-sm text-muted">Kosong</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {values.map((value) => (
                      <label
                        key={value}
                        className="flex cursor-pointer items-center gap-2 rounded-control px-2 py-1.5 text-sm hover:bg-background"
                      >
                        <input
                          type="radio"
                          name={`merge-${field}`}
                          checked={mergeChoices[field] === value}
                          onChange={() => setMergeChoices((c) => ({ ...c, [field]: value }))}
                          className="accent-accent"
                        />
                        <span className="truncate">{value}</span>
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>
            );
          })}
        </div>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        role="alertdialog"
        size="sm"
        ariaLabelledBy="delete-customer-title"
        title={<span id="delete-customer-title">Hapus customer ini?</span>}
        actions={[
          { label: 'Batal', variant: 'secondary', onClick: () => setDeleteTarget(null) },
          {
            label: 'Hapus',
            variant: 'danger',
            loading: deleteCustomer.isPending,
            onClick: confirmDelete,
          },
        ]}
      >
        <p className="text-sm text-muted">
          {deleteTarget?.name} akan dihapus permanen dari daftar customer kamu.
        </p>
      </Modal>

      {/* Blocking warning (e.g. an exact duplicate on create) */}
      <Modal
        open={warning !== null}
        onClose={() => setWarning(null)}
        role="alertdialog"
        size="sm"
        ariaLabelledBy="customer-warning-title"
        title={<span id="customer-warning-title">Tidak bisa menambah customer</span>}
        actions={[{ label: 'Mengerti', onClick: () => setWarning(null) }]}
      >
        <p className="text-sm text-muted">{warning}</p>
      </Modal>
    </div>
  );
}
