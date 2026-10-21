import { useEffect, useMemo, useState } from 'react';
import { Package, Pencil, Plus, Trash2 } from 'lucide-react';
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
import { Select } from '../ui/select';
import { SearchField } from '../ui/search-field';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';
import { TABLE, TABLE_SHELL, TBODY_ROW, THEAD_ROW, Td, Th } from '../ui/table';
import { usePageTour } from '../../../lib/tour/use-tour';
import {
  useCatalogPage,
  useCreateCatalogItem,
  useDeleteCatalogItem,
  useDeleteCatalogItems,
  useUpdateCatalogItem,
} from '../../../lib/query/hooks/use-catalog';
import { listCatalog } from '../../../app/catalog';
import { formatTanggal, formatTanggalRelatif } from '../../../core/shared/dates';
import { formatRupiah, parseRupiah } from '../../../core/shared/money';
import { toCatalogRows } from '../../../core/excel';
import { takeFieldErrors, toAppError } from '../../../app/errors';
import { toast } from '../../../lib/ui/toast';
import {
  CATALOG_KIND_LABELS,
  type CatalogDraft,
  type CatalogItem,
  type CatalogKind,
} from '../../../core/catalog/model';
import { ExportButtons } from '../excel/export-buttons';

const KIND_OPTIONS = [
  { value: 'barang', label: CATALOG_KIND_LABELS.barang },
  { value: 'jasa', label: CATALOG_KIND_LABELS.jasa },
];

type FormState = { name: string; kind: CatalogKind; unit: string; price: string };

const EMPTY_FORM: FormState = { name: '', kind: 'barang', unit: '', price: '' };

/** `'20.000'` → `20000`; blank or unparseable counts as zero. */
function toPrice(value: string): number {
  const parsed = parseRupiah(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDraft(form: FormState): CatalogDraft {
  return {
    name: form.name.trim(),
    kind: form.kind,
    unit: form.unit.trim(),
    unitPrice: toPrice(form.price),
  };
}

/** The `/catalog` island: the owner's saved barang/jasa, editable in place. */
export function CatalogApp() {
  return (
    <IslandBoundary>
      <AppProviders>
        <AuthGate>
          <CatalogContent />
        </AuthGate>
      </AppProviders>
    </IslandBoundary>
  );
}

function CatalogContent() {
  usePageTour('catalog');
  const {
    data,
    isLoading,
    isError,
    isFetching,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useCatalogPage();
  const items = useMemo(() => data?.pages.flatMap((page) => page.rows) ?? [], [data]);
  const total = data?.pages[0]?.total ?? 0;
  const createItem = useCreateCatalogItem();
  const updateItem = useUpdateCatalogItem();
  const deleteItem = useDeleteCatalogItem();
  const deleteItems = useDeleteCatalogItems();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  // Server-side validation (overlong name/unit, price out of range) comes back
  // as `fieldErrors`, keyed by the schema path.
  const [createFieldErrors, setCreateFieldErrors] = useState<Record<string, string>>({});

  // Edit modal state.
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);
  const [editFieldErrors, setEditFieldErrors] = useState<Record<string, string>>({});

  // Selection for the bulk delete. Wiped whenever the search changes so a bulk
  // action can never touch a row the user can no longer see.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  // List filter.
  const [query, setQuery] = useState('');
  // Delete confirmation.
  const [deleteTarget, setDeleteTarget] = useState<CatalogItem | null>(null);
  // Blocking warning (e.g. a duplicate on create).
  const [warning, setWarning] = useState<string | null>(null);

  const nameIds = useFieldIds();
  const unitIds = useFieldIds();
  const kindIds = useFieldIds();
  const searchIds = useFieldIds();
  const editNameIds = useFieldIds('edit-catalog-name');
  const editUnitIds = useFieldIds('edit-catalog-unit');
  const editKindIds = useFieldIds('edit-catalog-kind');

  const selectedItems = useMemo(
    () => items.filter((item) => selected.has(item.id)),
    [items, selected],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.name.toLowerCase().includes(q));
  }, [items, query]);

  useEffect(() => {
    setSelected(new Set());
  }, [query]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id));
  const someFilteredSelected = filtered.some((c) => selected.has(c.id));

  function handleAdd() {
    if (!form.name.trim()) return;

    createItem.mutate(toDraft(form), {
      onSuccess: () => {
        setForm(EMPTY_FORM);
        setCreateFieldErrors({});
      },
      onError: (error) => {
        const fieldErrors = takeFieldErrors(error);
        if (fieldErrors) setCreateFieldErrors(fieldErrors);
        else setWarning(toAppError(error).message);
      },
    });
  }

  function openEdit(item: CatalogItem) {
    setEditing(item);
    setEditForm({
      name: item.name,
      kind: item.kind,
      unit: item.unit,
      price: item.unitPrice ? String(item.unitPrice) : '',
    });
    setEditFieldErrors({});
  }

  function handleSaveEdit() {
    if (!editing) return;
    if (!editForm.name.trim()) return;

    updateItem.mutate(
      { id: editing.id, draft: toDraft(editForm) },
      {
        onSuccess: () => {
          setEditing(null);
          toast('Barang/jasa berhasil diperbarui.', { variant: 'success' });
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

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const item of filtered) next.delete(item.id);
      } else {
        for (const item of filtered) next.add(item.id);
      }
      return next;
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const { id, name } = deleteTarget;
    deleteItem.mutate(id, {
      onSuccess: () => {
        setDeleteTarget(null);
        toast(`"${name}" dihapus.`, { variant: 'success' });
      },
      onError: (error) => {
        setDeleteTarget(null);
        toast(toAppError(error).message, { variant: 'error' });
      },
    });
  }

  function confirmBulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) {
      setBulkDeleteOpen(false);
      return;
    }
    deleteItems.mutate(ids, {
      onSuccess: () => {
        setSelected(new Set());
        setBulkDeleteOpen(false);
        toast(`${ids.length} barang/jasa dihapus.`, { variant: 'success' });
      },
      onError: (error) => {
        setBulkDeleteOpen(false);
        toast(toAppError(error).message, { variant: 'error' });
      },
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Katalog"
        description="Simpan barang dan jasa tetap kamu sekali, lalu ambil dari katalog saat membuat invoice."
        actions={
          <ExportButtons
            filename="katalog-notain"
            sheetName="Katalog"
            getRows={async () => toCatalogRows(await listCatalog())}
            disabled={items.length === 0}
          />
        }
      />

      <form
        data-tour="catalog-form"
        onSubmit={(event) => {
          event.preventDefault();
          handleAdd();
        }}
        className={cardClass('sm', 'flex flex-col gap-4 lg:flex-row lg:items-end')}
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
              value={form.name}
              onChange={(event) => {
                setForm((f) => ({ ...f, name: event.target.value }));
                if (createFieldErrors.name) setCreateFieldErrors((rest) => ({ ...rest, name: '' }));
              }}
              placeholder="Nasi Goreng / Jasa Pasang"
              autoComplete="off"
              invalid={Boolean(createFieldErrors.name)}
              aria-invalid={createFieldErrors.name ? 'true' : undefined}
            />
          </FieldShell>
        </div>
        <div className="lg:w-36">
          <FieldShell label="Jenis" htmlFor={kindIds.id}>
            <Select
              id={kindIds.id}
              value={form.kind}
              options={KIND_OPTIONS}
              onChange={(value) => setForm((f) => ({ ...f, kind: value as CatalogKind }))}
              aria-label="Jenis"
            />
          </FieldShell>
        </div>
        <div className="lg:w-28">
          <FieldShell
            label="Satuan"
            htmlFor={unitIds.id}
            error={createFieldErrors.unit || undefined}
          >
            <Input
              id={unitIds.id}
              value={form.unit}
              onChange={(event) => {
                setForm((f) => ({ ...f, unit: event.target.value }));
                if (createFieldErrors.unit) setCreateFieldErrors((rest) => ({ ...rest, unit: '' }));
              }}
              placeholder="pcs"
              autoComplete="off"
              invalid={Boolean(createFieldErrors.unit)}
            />
          </FieldShell>
        </div>
        <div className="lg:w-40">
          <FieldShell
            label="Harga"
            htmlFor="catalog-price"
            error={createFieldErrors.unitPrice || undefined}
          >
            <Input
              id="catalog-price"
              value={form.price}
              onChange={(event) => {
                setForm((f) => ({ ...f, price: event.target.value }));
                if (createFieldErrors.unitPrice) {
                  setCreateFieldErrors((rest) => ({ ...rest, unitPrice: '' }));
                }
              }}
              placeholder="0"
              inputMode="numeric"
              autoComplete="off"
              invalid={Boolean(createFieldErrors.unitPrice)}
            />
          </FieldShell>
        </div>
        <Button
          type="submit"
          loading={createItem.isPending}
          disabled={form.name.trim() === ''}
          className="lg:w-auto"
        >
          <Plus size={16} aria-hidden="true" />
          Tambah
        </Button>
      </form>

      {isLoading ? (
        <LoadingState label="Memuat katalog…" />
      ) : isError && items.length === 0 ? (
        <ErrorState
          title="Gagal memuat katalog"
          message="Periksa koneksi internet kamu, lalu coba lagi."
          action={
            <Button size="sm" loading={isFetching} onClick={() => void refetch()}>
              Coba lagi
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Belum ada barang atau jasa"
          description="Tambahkan lewat form di atas, atau centang 'Simpan ke katalog' saat membuat invoice."
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="w-full sm:max-w-xs">
              <label htmlFor={searchIds.id} className="sr-only">
                Cari barang atau jasa
              </label>
              <SearchField
                id={searchIds.id}
                value={query}
                placeholder="Cari nama barang atau jasa…"
                onChange={setQuery}
              />
            </div>
            {total > items.length && (
              <p className="text-xs text-muted">
                {items.length} dari {total} entri dimuat
              </p>
            )}
          </div>

          {selectedItems.length > 0 && (
            <div className={CARD_ROW}>
              <p className="text-sm text-muted">
                <span className="font-medium text-foreground">{selectedItems.length}</span> entri
                dipilih
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <ExportButtons
                  filename="katalog-terpilih"
                  sheetName="Katalog"
                  getRows={() => toCatalogRows(selectedItems)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelected(new Set())}
                  disabled={deleteItems.isPending}
                >
                  Batalkan pilihan
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setBulkDeleteOpen(true)}
                  disabled={deleteItems.isPending}
                >
                  <Trash2 size={15} aria-hidden="true" />
                  Hapus {selectedItems.length}
                </Button>
              </div>
            </div>
          )}

          {filtered.length === 0 ? (
            <EmptyState title="Tidak ada yang cocok." />
          ) : (
            <div data-tour="catalog-list" className={TABLE_SHELL}>
              <table className={TABLE} style={{ minWidth: '720px' }}>
                <thead>
                  <tr className={THEAD_ROW}>
                    <Th className="w-11">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        ref={(element) => {
                          if (element) {
                            element.indeterminate = someFilteredSelected && !allFilteredSelected;
                          }
                        }}
                        onChange={toggleSelectAll}
                        aria-label="Pilih semua entri yang dimuat"
                        className="h-4 w-4 accent-accent"
                        disabled={filtered.length === 0}
                      />
                    </Th>
                    <Th>Nama</Th>
                    <Th className="w-24">Jenis</Th>
                    <Th className="w-24">Satuan</Th>
                    <Th align="right" className="w-36">
                      Harga
                    </Th>
                    <Th className="w-40">Terakhir dipakai</Th>
                    <Th align="right" className="w-14" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr key={item.id} className={TBODY_ROW}>
                      <Td className="w-11">
                        <input
                          type="checkbox"
                          checked={selected.has(item.id)}
                          onChange={() => toggleSelected(item.id)}
                          aria-label={`Pilih ${item.name}`}
                          className="h-4 w-4 accent-accent"
                        />
                      </Td>
                      <Td>
                        <span
                          className="block max-w-[260px] truncate font-medium"
                          title={item.name}
                        >
                          {item.name}
                        </span>
                      </Td>
                      <Td>
                        <span className="text-muted">{CATALOG_KIND_LABELS[item.kind]}</span>
                      </Td>
                      <Td>
                        <span className="text-muted">{item.unit || '-'}</span>
                      </Td>
                      <Td className="text-right">
                        <span className="tabular-nums">{formatRupiah(item.unitPrice)}</span>
                      </Td>
                      <Td>
                        <span
                          className="text-muted"
                          title={item.lastUsedAt ? formatTanggal(item.lastUsedAt) : undefined}
                        >
                          {item.lastUsedAt ? formatTanggalRelatif(item.lastUsedAt) : '-'}
                        </span>
                      </Td>
                      <Td className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(item)}
                            aria-label={`Edit ${item.name}`}
                          >
                            <Pencil size={15} aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteTarget(item)}
                            aria-label={`Hapus ${item.name}`}
                          >
                            <Trash2 size={15} aria-hidden="true" />
                          </Button>
                        </div>
                      </Td>
                    </tr>
                  ))}
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

      {/* Edit entry */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        size="md"
        title="Edit Barang/Jasa"
        actions={[
          {
            label: 'Batal',
            variant: 'secondary',
            disabled: updateItem.isPending,
            onClick: () => setEditing(null),
          },
          {
            label: 'Simpan',
            loading: updateItem.isPending,
            disabled: editForm.name.trim() === '',
            onClick: handleSaveEdit,
          },
        ]}
      >
        <div className="flex flex-col gap-4">
          <FieldShell label="Nama" htmlFor={editNameIds.id} required error={editFieldErrors.name}>
            <Input
              id={editNameIds.id}
              type="text"
              value={editForm.name}
              onChange={(e) => {
                setEditForm((f) => ({ ...f, name: e.target.value }));
                if (editFieldErrors.name) setEditFieldErrors((r) => ({ ...r, name: '' }));
              }}
              invalid={Boolean(editFieldErrors.name)}
            />
          </FieldShell>
          <FieldShell label="Jenis" htmlFor={editKindIds.id}>
            <Select
              id={editKindIds.id}
              value={editForm.kind}
              options={KIND_OPTIONS}
              onChange={(value) => setEditForm((f) => ({ ...f, kind: value as CatalogKind }))}
              aria-label="Jenis"
            />
          </FieldShell>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldShell label="Satuan" htmlFor={editUnitIds.id} error={editFieldErrors.unit}>
              <Input
                id={editUnitIds.id}
                type="text"
                value={editForm.unit}
                onChange={(e) => {
                  setEditForm((f) => ({ ...f, unit: e.target.value }));
                  if (editFieldErrors.unit) setEditFieldErrors((r) => ({ ...r, unit: '' }));
                }}
                placeholder="pcs"
                invalid={Boolean(editFieldErrors.unit)}
              />
            </FieldShell>
            <FieldShell
              label="Harga"
              htmlFor="edit-catalog-price"
              error={editFieldErrors.unitPrice}
            >
              <Input
                id="edit-catalog-price"
                type="text"
                inputMode="numeric"
                value={editForm.price}
                onChange={(e) => {
                  setEditForm((f) => ({ ...f, price: e.target.value }));
                  if (editFieldErrors.unitPrice) {
                    setEditFieldErrors((r) => ({ ...r, unitPrice: '' }));
                  }
                }}
                placeholder="0"
                invalid={Boolean(editFieldErrors.unitPrice)}
              />
            </FieldShell>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        role="alertdialog"
        size="sm"
        ariaLabelledBy="delete-catalog-title"
        title={<span id="delete-catalog-title">Hapus entri ini?</span>}
        actions={[
          { label: 'Batal', variant: 'secondary', onClick: () => setDeleteTarget(null) },
          {
            label: 'Hapus',
            variant: 'danger',
            loading: deleteItem.isPending,
            onClick: confirmDelete,
          },
        ]}
      >
        <p className="text-sm text-muted">
          {deleteTarget?.name} akan dihapus permanen dari katalog kamu.
        </p>
      </Modal>

      {/* Bulk delete confirmation */}
      <Modal
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        role="alertdialog"
        size="sm"
        ariaLabelledBy="bulk-delete-catalog-title"
        title={
          <span id="bulk-delete-catalog-title">Hapus {selectedItems.length} entri terpilih?</span>
        }
        actions={[
          { label: 'Batal', variant: 'secondary', onClick: () => setBulkDeleteOpen(false) },
          {
            label: 'Hapus',
            variant: 'danger',
            loading: deleteItems.isPending,
            onClick: confirmBulkDelete,
          },
        ]}
      >
        <p className="text-sm text-muted">
          Entri yang dipilih akan dihapus permanen dari katalog kamu dan tidak bisa dikembalikan.
        </p>
      </Modal>

      {/* Blocking warning (e.g. a duplicate on create) */}
      <Modal
        open={warning !== null}
        onClose={() => setWarning(null)}
        role="alertdialog"
        size="sm"
        ariaLabelledBy="catalog-warning-title"
        title={<span id="catalog-warning-title">Tidak bisa menambah</span>}
        actions={[{ label: 'Mengerti', onClick: () => setWarning(null) }]}
      >
        <p className="text-sm text-muted">{warning}</p>
      </Modal>
    </div>
  );
}
