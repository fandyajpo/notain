import { useEffect, useMemo, useState } from 'react';
import { Check, Merge, Pencil, Plus, Trash2, Users, X } from 'lucide-react';
import { AuthGate } from '../auth/auth-gate';
import { AppProviders } from '../providers';
import { IslandBoundary } from '../ui/island-boundary';
import { Button } from '../ui/button';
import { CARD_ROW, cardClass } from '../ui/card';
import { LoadMore } from '../ui/load-more';
import { Modal } from '../ui/modal';
import { PageHeader } from '../ui/page-header';
import { FieldShell, useFieldIds } from '../ui/field';
import { Input } from '../ui/input';
import { SearchField } from '../ui/search-field';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';
import { TABLE, TABLE_SHELL, TBODY_ROW, THEAD_ROW, Td, Th } from '../ui/table';
import { usePageTour } from '../../../lib/tour/use-tour';
import {
  useCreateCustomer,
  useCustomersPage,
  useDeleteCustomer,
  useDeleteCustomers,
  useMergeCustomers,
  useUpdateCustomer,
} from '../../../lib/query/hooks/use-customers';
import { listCustomers } from '../../../app/customers';
import { formatTanggal, formatTanggalRelatif } from '../../../core/shared/dates';
import { toCustomerRows } from '../../../core/excel';
import { takeFieldErrors, toAppError } from '../../../app/errors';
import { toast } from '../../../lib/ui/toast';
import type { Customer, CustomerDraft } from '../../../core/customer/model';
import { ExportButtons } from '../excel/export-buttons';
import { CustomerImportPanel } from './customer-import';

const EMPTY_DRAFT: CustomerDraft = { name: '', email: '', phone: '' };

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
  const {
    data,
    isLoading,
    isError,
    isFetching,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useCustomersPage();
  const customers = useMemo(() => data?.pages.flatMap((page) => page.rows) ?? [], [data]);
  const total = data?.pages[0]?.total ?? 0;
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const deleteCustomer = useDeleteCustomer();
  const deleteCustomers = useDeleteCustomers();
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
  /**
   * Checked row ids — same contract as the invoice table's selection: it
   * survives "Muat lebih banyak" (the ids outlive the pages) but is wiped
   * whenever the search changes, so a bulk action can never touch a row the
   * user can no longer see.
   */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeChoices, setMergeChoices] = useState<CustomerDraft>(EMPTY_DRAFT);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

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
    () => customers.filter((c) => selected.has(c.id)),
    [customers, selected],
  );

  // Client-side filter over the pages loaded so far (the search box narrows
  // what is on screen; "Muat lebih banyak" pulls the rest).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.includes(q),
    );
  }, [customers, query]);

  // A search change invalidates the selection — see the state's comment above.
  useEffect(() => {
    setSelected(new Set());
  }, [query]);

  /** Every currently-visible row is checked — what the select-all box reads. */
  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id));
  const someFilteredSelected = filtered.some((c) => selected.has(c.id));

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

  /** Checks every visible row, or unchecks them all if they already were. */
  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const customer of filtered) next.delete(customer.id);
      } else {
        for (const customer of filtered) next.add(customer.id);
      }
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

  /** The bulk action behind the selection bar's "Hapus" button. */
  function confirmBulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) {
      setBulkDeleteOpen(false);
      return;
    }
    deleteCustomers.mutate(ids, {
      onSuccess: () => {
        setSelected(new Set());
        setBulkDeleteOpen(false);
        toast(`${ids.length} pelanggan berhasil dihapus.`, { variant: 'success' });
      },
      onError: (error) => {
        setBulkDeleteOpen(false);
        toast(toAppError(error).message, { variant: 'error' });
      },
    });
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
          toast(`${sources.length + 1} pelanggan digabungkan.`, { variant: 'success' });
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
        description="Daftar pelanggan yang pernah kamu buat invoice. Otomatis terisi tiap kali kamu simpan invoice."
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
                disabled={customers.length < 2}
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
              // The export always ships the whole directory, not just the pages
              // loaded on screen — `getRows` may return a promise for exactly
              // this reason.
              getRows={async () => toCustomerRows(await listCustomers())}
              disabled={customers.length === 0}
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
        <div className="flex-1">
          <FieldShell
            label="Nama"
            htmlFor={nameIds.id}
            required
            error={createFieldErrors.name || undefined}
          >
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
            />
          </FieldShell>
        </div>
        <div className="flex-1">
          <FieldShell
            label="Email"
            htmlFor={emailIds.id}
            error={createFieldErrors.email || undefined}
          >
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
            />
          </FieldShell>
        </div>
        <div className="flex-1">
          <FieldShell
            label="WhatsApp"
            htmlFor={phoneIds.id}
            error={createFieldErrors.phone || undefined}
          >
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
            />
          </FieldShell>
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
        <LoadingState label="Memuat pelanggan…" />
      ) : isError && customers.length === 0 ? (
        // A failed load must not masquerade as "Belum ada pelanggan" — copy the
        // invoice table's two-state handling: full error + retry when empty,
        // stale rows when we still have them.
        <ErrorState
          title="Gagal memuat pelanggan"
          message="Periksa koneksi internet kamu, lalu coba lagi."
          action={
            <Button size="sm" loading={isFetching} onClick={() => void refetch()}>
              Coba lagi
            </Button>
          }
        />
      ) : customers.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Belum ada pelanggan"
          description="Tambahkan lewat form di atas, atau simpan invoice."
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="w-full sm:max-w-xs">
              <label htmlFor={searchIds.id} className="sr-only">
                Cari pelanggan
              </label>
              <SearchField
                id={searchIds.id}
                value={query}
                placeholder="Cari nama, email, atau nomor…"
                onChange={setQuery}
              />
            </div>
            {total > customers.length && (
              <p className="text-xs text-muted">
                {customers.length} dari {total} customer dimuat
              </p>
            )}
          </div>

          {/* Appears the moment a checkbox is ticked: the count, an export of
              exactly that set, the bulk delete, and a way out. Merge mode has
              its own action bar up top, so this one stays out of the way. */}
          {!mergeMode && selectedCustomers.length > 0 && (
            <div className={CARD_ROW}>
              <p className="text-sm text-muted">
                <span className="font-medium text-foreground">{selectedCustomers.length}</span>{' '}
                pelanggan dipilih
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <ExportButtons
                  filename="customer-terpilih"
                  sheetName="Customer"
                  getRows={() => toCustomerRows(selectedCustomers)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelected(new Set())}
                  disabled={deleteCustomers.isPending}
                >
                  Batalkan pilihan
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setBulkDeleteOpen(true)}
                  disabled={deleteCustomers.isPending}
                >
                  <Trash2 size={15} aria-hidden="true" />
                  Hapus {selectedCustomers.length}
                </Button>
              </div>
            </div>
          )}

          {filtered.length === 0 ? (
            <EmptyState title="Tidak ada pelanggan yang cocok." />
          ) : (
            <div data-tour="cust-list" className={TABLE_SHELL}>
              <table className={TABLE} style={{ minWidth: '640px' }}>
                <thead>
                  <tr className={THEAD_ROW}>
                    {/* Select-all sits in the header, above the column it
                        governs — the invoice table's arrangement. */}
                    <Th className="w-11">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        ref={(element) => {
                          // Block body (not a concise arrow): React 19 treats a
                          // returned non-function as a ref-cleanup error, and this
                          // assignment is a side effect, not a return value.
                          if (element) {
                            element.indeterminate = someFilteredSelected && !allFilteredSelected;
                          }
                        }}
                        onChange={toggleSelectAll}
                        aria-label="Pilih semua pelanggan yang dimuat"
                        className="h-4 w-4 accent-accent"
                        disabled={filtered.length === 0}
                      />
                    </Th>
                    <Th>Customer</Th>
                    <Th>Kontak</Th>
                    <Th>Terakhir dipakai</Th>
                    <Th align="right" className="w-14" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((customer) => {
                    const contact =
                      [customer.email, customer.phone].filter(Boolean).join(' · ') ||
                      'Tanpa kontak';
                    return (
                      <tr key={customer.id} className={TBODY_ROW}>
                        <Td className="w-11">
                          <input
                            type="checkbox"
                            checked={selected.has(customer.id)}
                            onChange={() => toggleSelected(customer.id)}
                            aria-label={`Pilih ${customer.name}`}
                            className="h-4 w-4 accent-accent"
                          />
                        </Td>
                        <Td>
                          <span
                            className="block max-w-[220px] truncate font-medium"
                            title={customer.name}
                          >
                            {customer.name}
                          </span>
                        </Td>
                        <Td>
                          <span className="block max-w-[260px] truncate text-muted" title={contact}>
                            {contact}
                          </span>
                        </Td>
                        <Td>
                          <span
                            className="text-muted"
                            title={
                              customer.lastUsedAt ? formatTanggal(customer.lastUsedAt) : undefined
                            }
                          >
                            {customer.lastUsedAt ? formatTanggalRelatif(customer.lastUsedAt) : '-'}
                          </span>
                        </Td>
                        <Td className="text-right">
                          <div className="flex items-center justify-end gap-1">
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
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <LoadMore
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            fetchNextPage={() => void fetchNextPage()}
          />
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
          <FieldShell
            label="Nama"
            htmlFor="edit-customer-name"
            required
            error={editFieldErrors.name}
          >
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
        title={<span id="delete-customer-title">Hapus pelanggan ini?</span>}
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
          {deleteTarget?.name} akan dihapus permanen dari daftar pelanggan kamu.
        </p>
      </Modal>

      {/* Bulk delete confirmation */}
      <Modal
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        role="alertdialog"
        size="sm"
        ariaLabelledBy="bulk-delete-customer-title"
        title={
          <span id="bulk-delete-customer-title">
            Hapus {selectedCustomers.length} pelanggan terpilih?
          </span>
        }
        actions={[
          { label: 'Batal', variant: 'secondary', onClick: () => setBulkDeleteOpen(false) },
          {
            label: 'Hapus',
            variant: 'danger',
            loading: deleteCustomers.isPending,
            onClick: confirmBulkDelete,
          },
        ]}
      >
        <p className="text-sm text-muted">
          Customer yang dipilih akan dihapus permanen dari daftar kamu dan tidak bisa dikembalikan.
        </p>
      </Modal>

      {/* Blocking warning (e.g. an exact duplicate on create) */}
      <Modal
        open={warning !== null}
        onClose={() => setWarning(null)}
        role="alertdialog"
        size="sm"
        ariaLabelledBy="customer-warning-title"
        title={<span id="customer-warning-title">Tidak bisa menambah pelanggan</span>}
        actions={[{ label: 'Mengerti', onClick: () => setWarning(null) }]}
      >
        <p className="text-sm text-muted">{warning}</p>
      </Modal>
    </div>
  );
}
