import { useMemo, useState } from 'react';
import { Package, Pencil, Plus, Trash2 } from 'lucide-react';
import { AuthGate } from '../auth/auth-gate';
import { AppProviders } from '../providers';
import { IslandBoundary } from '../ui/island-boundary';
import { Button } from '../ui/button';
import { cardClass } from '../ui/card';
import { LoadMore } from '../ui/load-more';
import { Modal } from '../ui/modal';
import { PageHeader } from '../ui/page-header';
import { FieldShell, useFieldIds } from '../ui/field';
import { Input } from '../ui/input';
import { Select } from '../ui/select';
import { SearchField } from '../ui/search-field';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';
import { TABLE, TableFrame, TBODY_ROW, THEAD_ROW, Td, Th } from '../ui/table';
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
import {
  exportRows,
  resolveSelected,
  useSelectionScope,
} from '../../../lib/query/hooks/use-selection';
import { setManyInScope, useSelection } from '../../../lib/selection';
import { SelectionToolbar, hasSelection } from '../excel/selection-toolbar';
import { SelectAllMenu } from '../ui/select-all-menu';

const KIND_OPTIONS = [
  { value: 'barang', label: CATALOG_KIND_LABELS.barang },
  { value: 'jasa', label: CATALOG_KIND_LABELS.jasa },
];

type FormState = { name: string; kind: CatalogKind; unit: string; price: string };

const EMPTY_FORM: FormState = { name: '', kind: 'barang', unit: '', price: '' };

/** Snapshot criteria for "select all that match" — the same search the table applies. */
type CatalogCriteria = { query: string };

/**
 * The table's client-side narrowing, shared verbatim by the selection scope's
 * matching walk so "select everything matching" is the same predicate the
 * user is looking at, not a second interpretation of it.
 */
function filterCatalog(rows: CatalogItem[], query: string): CatalogItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((item) => item.name.toLowerCase().includes(q));
}

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

  /**
   * Global, id-based selection (see `lib/selection`): ids in a module-scoped
   * store, so it survives "Muat lebih banyak", refetches, sorting, remounts
   * *and* search changes. Nothing clears it but the user or an action that
   * consumed it.
   */
  const selection = useSelection<CatalogCriteria>('catalog');
  const snapshot = selection.getSnapshot();
  /** Full-dataset and matching-filter walks, shared by count, export and delete. */
  const loaders = useMemo(
    () => ({
      all: () => listCatalog(),
      matching: ({ query: q }: CatalogCriteria) =>
        listCatalog().then((rows) => filterCatalog(rows, q)),
    }),
    [],
  );
  const scopeView = useSelectionScope('catalog', snapshot.all, loaders, data ? total : null);
  /** The global count — `null` while an all-scope walk is still resolving. */
  const selectionCount = selection.count(scopeView.size);
  /** True while the selection is being resolved to records (a network walk). */
  const [resolving, setResolving] = useState(false);
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

  // Client-side filter over the pages loaded so far. No effect clears the
  // selection when this changes — filtering must not silently drop what the
  // user ticked; hidden rows simply read as unticked and the count stays exact.
  const filtered = useMemo(() => filterCatalog(items, query), [items, query]);

  /** Whether one id is currently selected, under the active scope (or plain). */
  const isSelected = (id: string) => selection.isSelected(id, scopeView.has(id));

  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => isSelected(c.id));
  const someFilteredSelected = filtered.some((c) => isSelected(c.id));

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
    selection.toggle(id, scopeView.has(id));
  }

  function toggleSelectAll() {
    setManyInScope(
      selection,
      filtered.map((item) => item.id),
      !allFilteredSelected,
      scopeView.has,
    );
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

  /**
   * The export getter: resolves the complete selection (revalidating against
   * the catalog, so a deleted row is skipped with a toast instead of landing
   * in the file) and maps it to sheet rows.
   */
  async function exportSelectedRows() {
    const rows = await exportRows({ snapshot: selection.getSnapshot(), loaders, noun: 'entri' });
    return toCatalogRows(rows);
  }

  /**
   * The bulk action behind the selection bar's "Hapus" button — resolved to
   * live records first so the success toast counts what actually went.
   */
  async function confirmBulkDelete() {
    setResolving(true);
    try {
      const rows = await resolveSelected({
        snapshot: selection.getSnapshot(),
        loaders,
        noun: 'entri',
      });
      const ids = rows.map((row) => row.id);
      if (ids.length === 0) {
        setBulkDeleteOpen(false);
        return;
      }
      deleteItems.mutate(ids, {
        onSuccess: () => {
          selection.clear();
          setBulkDeleteOpen(false);
          toast(`${ids.length} barang/jasa dihapus.`, { variant: 'success' });
        },
        onError: (error) => {
          setBulkDeleteOpen(false);
          toast(toAppError(error).message, { variant: 'error' });
        },
      });
    } catch (error) {
      setBulkDeleteOpen(false);
      toast(toAppError(error).message, { variant: 'error' });
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Katalog barang dan jasa"
        description="Simpan barang dan jasa yang sering kamu jual, lalu pilih lagi saat membuat nota."
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
          title="Katalog belum bisa dimuat"
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
          description="Tambahkan lewat form di atas atau centang 'Simpan ke katalog' saat membuat nota."
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

          {/* Appears the moment anything is ticked: the count, an export of
              exactly that set across every page, the bulk delete, and a way out. */}
          {hasSelection(selectionCount) && (
            <SelectionToolbar
              count={selectionCount}
              noun="entri"
              onClear={() => selection.clear()}
              clearDisabled={deleteItems.isPending || resolving}
              exportOptions={{
                filename: 'barang-jasa-terpilih',
                sheetName: 'Katalog',
                getRows: exportSelectedRows,
                pdfTitle: 'Katalog barang dan jasa terpilih',
              }}
              actions={
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setBulkDeleteOpen(true)}
                  disabled={deleteItems.isPending || resolving}
                >
                  <Trash2 size={15} aria-hidden="true" />
                  Hapus {selectionCount ?? 0}
                </Button>
              }
            />
          )}

          {filtered.length === 0 ? (
            <EmptyState title="Tidak ada yang cocok." />
          ) : (
            <TableFrame data-tour="catalog-list">
              <table className={TABLE} style={{ minWidth: '720px' }}>
                <thead>
                  <tr className={THEAD_ROW}>
                    <Th className="w-24">
                      <span className="flex items-center gap-1">
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
                        <SelectAllMenu
                          noun="entri"
                          pageCount={filtered.length}
                          onSelectPage={() =>
                            setManyInScope(
                              selection,
                              filtered.map((item) => item.id),
                              true,
                              scopeView.has,
                            )
                          }
                          onSelectFiltered={
                            query.trim()
                              ? () =>
                                  selection.selectScope({ kind: 'filtered', criteria: { query } })
                              : undefined
                          }
                          onSelectDataset={() => selection.selectScope({ kind: 'dataset' })}
                        />
                      </span>
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
                          checked={isSelected(item.id)}
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
                            aria-label={`Ubah ${item.name}`}
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
            </TableFrame>
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
        title="Ubah barang atau jasa"
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
          <span id="bulk-delete-catalog-title">Hapus {selectionCount ?? 0} entri terpilih?</span>
        }
        actions={[
          { label: 'Batal', variant: 'secondary', onClick: () => setBulkDeleteOpen(false) },
          {
            label: 'Hapus',
            variant: 'danger',
            loading: deleteItems.isPending || resolving,
            onClick: () => void confirmBulkDelete(),
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
