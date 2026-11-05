import {
  columnSizingFeature,
  createColumnHelper,
  createSortedRowModel,
  flexRender,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type RowSelectionState,
  type SortingState,
} from '@tanstack/react-table';
import { useDebouncedCallback } from '@tanstack/react-pacer';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronRight,
  Copy,
  EllipsisVertical,
  ExternalLink,
  Image as ImageIcon,
  ImageUp,
  Plus,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { calculateTotals } from '../../../core/invoice/calculator';
import {
  INVOICE_STATUSES,
  INVOICE_STATUS_LABELS,
  UNSET_STATUS_LABEL,
  needsPaymentCheck,
  type Invoice,
  type InvoiceStatus,
} from '../../../core/invoice/model';
import { PAYMENT_PROOF_ACCEPT, PAYMENT_PROOF_MAX_BYTES } from '../../../core/invoice/payment-proof';
import { BUILTIN_TEMPLATES } from '../../../core/template/builtins';
import { EMPTY_PROFILE, hasProAccess } from '../../../core/profile/model';
import { toInvoiceRows } from '../../../core/excel/invoices';
import { formatRupiah } from '../../../core/shared/money';
import { formatTanggal, formatTanggalRelatif } from '../../../core/shared/dates';
import {
  useDeleteInvoice,
  useDeleteInvoices,
  useInvoices,
} from '../../../lib/query/hooks/use-invoices';
import {
  useDeletePaymentProof,
  useUploadOwnerPaymentProof,
} from '../../../lib/query/hooks/use-public-invoice';
import { useProfile } from '../../../lib/query/hooks/use-profile';
import { useTemplates } from '../../../lib/query/hooks/use-templates';
import { toast } from '../../../lib/ui/toast';
import { setManyInScope, useSelection } from '../../../lib/selection';
import {
  exportRows,
  resolveSelected,
  useSelectionScope,
} from '../../../lib/query/hooks/use-selection';
import { listAllInvoices } from '../../../app/invoices';
import { toAppError } from '../../../app/errors';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { SelectionToolbar, hasSelection } from '../excel/selection-toolbar';
import { SelectAllMenu } from '../ui/select-all-menu';
import { Menu } from '../ui/menu';
import { Modal } from '../ui/modal';
import { Notice } from '../ui/notice';
import { SearchField } from '../ui/search-field';
import { Select } from '../ui/select';
import { StatusBadge } from '../ui/status-badge';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';
import { TABLE, TableFrame, TBODY_ROW, THEAD_ROW, tdClass, thClass } from '../ui/table';
import { useFieldIds } from '../ui/field';

const features = tableFeatures({
  columnSizingFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});
const columnHelper = createColumnHelper<typeof features, Invoice>();
const SEARCH_WAIT = 300;

/**
 * Every filter and the sort live in the URL query string (`keyword`,
 * `status`, `template`, `sort`, `dir`) — state that survives reload, back
 * navigation and copy-paste into another tab. The React state below is seeded
 * from the query on first render (the island is client-only, so `window` is
 * always there, the same read `invoice-new-app` does for `from`), then written
 * back with `replaceState`, which does not stack an entry per keystroke into
 * the session's history.
 */
const PARAMS = {
  keyword: 'keyword',
  status: 'status',
  template: 'template',
  sort: 'sort',
  dir: 'dir',
} as const;
/** Sortable column ids — anything else in `?sort=` is ignored as junk. */
const SORTABLE_IDS = new Set(['invoiceNumber', 'customerName', 'total', 'date', 'status']);
/**
 * Query-string value for the unset status filter ("Belum dikirim").
 *
 * The domain represents that state as `null`, which cannot ride a query
 * string, so the URL gets a sentinel word that `readParams` maps back.
 */
const UNSET_STATUS_FILTER = 'unset';

type TableParams = {
  keyword: string;
  /**
   * Tri-state like the port's: a value filters that lifecycle state, `null`
   * filters "Belum dikirim", `undefined` sends no filter at all.
   */
  status: InvoiceStatus | null | undefined;
  template: string | undefined;
  sorting: SortingState;
};

/** Snapshot criteria for "select all that match" — the filters the table sends. */
type InvoiceCriteria = {
  search: string;
  status?: InvoiceStatus | null;
  templateId?: string;
};

function readParams(): TableParams {
  if (typeof window === 'undefined') {
    return { keyword: '', status: undefined, template: undefined, sorting: [] };
  }
  const query = new URLSearchParams(window.location.search);
  const keyword = query.get(PARAMS.keyword) ?? '';
  const status = query.get(PARAMS.status);
  const template = query.get(PARAMS.template);
  const sort = query.get(PARAMS.sort);
  const dir = query.get(PARAMS.dir);
  return {
    keyword,
    status:
      status === UNSET_STATUS_FILTER
        ? null
        : status && (INVOICE_STATUSES as readonly string[]).includes(status)
          ? (status as InvoiceStatus)
          : undefined,
    template: template || undefined,
    sorting: sort && SORTABLE_IDS.has(sort) ? [{ id: sort, desc: dir !== 'asc' }] : [],
  };
}

export function InvoiceTable() {
  // "Invoice link" is a Pro benefit (pricing page) and the server answers
  // the public endpoint with a 402 for free accounts — so the menu points at
  // checkout instead of a link that would only bounce the customer.
  const { data: profile } = useProfile();
  const publicLinkReady = hasProAccess(profile ?? EMPTY_PROFILE);
  const initial = useMemo(readParams, []);
  const [searchInput, setSearchInput] = useState(initial.keyword);
  const [search, setSearch] = useState(initial.keyword);
  // Tri-state: `undefined` is "all statuses" (no server-side filter), `null`
  // is the "Belum dikirim" filter, anything else is that lifecycle state.
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | null | undefined>(
    initial.status,
  );
  // `undefined` means "all templates" — no server-side filter is sent.
  const [templateFilter, setTemplateFilter] = useState<string | undefined>(initial.template);
  const [sorting, setSorting] = useState<SortingState>(initial.sorting);
  const [pendingDelete, setPendingDelete] = useState<Invoice | null>(null);
  /**
   * Global, id-based selection (see `lib/selection`). TanStack's
   * `rowSelection` is derived from this per render — never an independent
   * copy — so ids outlive "Muat lebih banyak", refetches, sorting *and*
   * filter changes: ticking a row never gets undone by the table doing its
   * job, and every action revalidates against the source before it runs.
   */
  const selection = useSelection<InvoiceCriteria>('invoices');
  const snapshot = selection.getSnapshot();
  /** Full-dataset and matching-filter walks for count, export and bulk delete. */
  const invoiceLoaders = useMemo(
    () => ({
      all: () => listAllInvoices(),
      matching: (criteria: InvoiceCriteria) => listAllInvoices(criteria),
    }),
    [],
  );
  /** The bulk-delete confirmation modal's open flag. */
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  /** True while the selection is being resolved to records (a network walk). */
  const [resolving, setResolving] = useState(false);
  /** Whose uploaded proof to show full-size in the viewer modal. */
  const [proofView, setProofView] = useState<Invoice | null>(null);
  /** Whose uploaded proof the owner is about to delete (one-shot reset). */
  const [proofDelete, setProofDelete] = useState<Invoice | null>(null);
  /** Which row's hidden file input is armed for an owner-side proof upload. */
  const proofUpload = useRef<Invoice | null>(null);
  const proofFileRef = useRef<HTMLInputElement>(null);

  // A filter change deliberately does NOT touch the selection (see its state
  // comment); this effect only mirrors the visible filters into the URL. Unknown params (an auth
  // token, a tour flag) are preserved — this only owns its own five keys.
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const set = (key: string, value: string) => {
      if (value) query.set(key, value);
      else query.delete(key);
    };
    set(PARAMS.keyword, search);
    // The unset filter (`null`) serialises to its sentinel word, not to ''
    // — '' would mean "delete the param" and silently drop the filter.
    set(
      PARAMS.status,
      statusFilter === undefined ? '' : statusFilter === null ? UNSET_STATUS_FILTER : statusFilter,
    );
    set(PARAMS.template, templateFilter ?? '');
    set(PARAMS.sort, sorting[0]?.id ?? '');
    set(PARAMS.dir, sorting[0] ? (sorting[0].desc ? 'desc' : 'asc') : '');
    const qs = query.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
    if (next !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', next);
    }
  }, [search, statusFilter, templateFilter, sorting]);

  const {
    data,
    isLoading,
    isError,
    refetch,
    isFetching,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isPlaceholderData,
  } = useInvoices(search, { status: statusFilter, templateId: templateFilter });
  const { data: savedTemplates } = useTemplates();
  const deleteInvoice = useDeleteInvoice();
  const deleteInvoices = useDeleteInvoices();
  const deleteProof = useDeletePaymentProof();
  const uploadProof = useUploadOwnerPaymentProof();

  /** Built-ins first, then the user's saved copies — same order as the picker. */
  const templateOptions = useMemo(() => {
    const options = [
      ...BUILTIN_TEMPLATES.map((template) => ({ value: template.id, label: template.name })),
      ...(savedTemplates ?? []).map((template) => ({
        value: template.id,
        label: template.name,
      })),
    ];
    // A filter pointing at a template that no longer exists (deleted while the
    // tab was open) still has to render as *something* selectable and
    // clearable, instead of the select silently reading as "all templates".
    if (templateFilter && !options.some((option) => option.value === templateFilter)) {
      options.push({ value: templateFilter, label: templateFilter });
    }
    return options;
  }, [savedTemplates, templateFilter]);

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await deleteInvoice.mutateAsync(pendingDelete.id);
      toast('Nota berhasil dihapus.', { variant: 'success' });
    } catch {
      toast('Nota belum bisa dihapus. Coba lagi ya.', { variant: 'error' });
    } finally {
      setPendingDelete(null);
    }
  }

  /** The bulk action behind the selection bar's "Hapus" button. */
  async function confirmBulkDelete() {
    setResolving(true);
    try {
      // Resolve the global selection first: it may name rows another tab
      // deleted, and the success toast must count what actually went.
      const rows = await resolveSelected({
        snapshot: selection.getSnapshot(),
        loaders: invoiceLoaders,
        noun: 'nota',
      });
      const ids = rows.map((row) => row.id);
      if (ids.length === 0) return;
      try {
        await deleteInvoices.mutateAsync(ids);
        selection.clear();
        toast(`${ids.length} nota berhasil dihapus.`, { variant: 'success' });
      } catch {
        toast('Beberapa nota belum bisa dihapus. Coba lagi ya.', { variant: 'error' });
      }
    } catch (error) {
      toast(toAppError(error).message, { variant: 'error' });
    } finally {
      setResolving(false);
      setBulkDeleteOpen(false);
    }
  }

  async function confirmProofDelete() {
    const key = proofDelete?.paymentProof?.key;
    if (!key) {
      setProofDelete(null);
      return;
    }
    try {
      await deleteProof.mutateAsync(key);
      toast('Bukti pembayaran dihapus. Pelanggan bisa mengirim ulang.', { variant: 'success' });
    } catch {
      toast('Bukti pembayaran gagal dihapus. Coba lagi.', { variant: 'error' });
    } finally {
      setProofDelete(null);
    }
  }

  /**
   * Owner-side upload: same browser re-encoding as the customer's form (HEIC
   * → WebP, 5 MB ceiling), but sent with the session JWT so the server skips
   * the status gate and one-shot rule — this may replace an existing proof.
   *
   * The invoice to upload for lives in a ref (armed by the row's menu item),
   * not in state: the column defs are memoised once, so per-render state
   * would freeze inside them while the ref stays truthful at click time.
   */
  async function handleProofFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Allow re-picking the same file after a failure.
    event.target.value = '';
    const invoice = proofUpload.current;
    proofUpload.current = null;
    if (!file || !invoice) return;

    if (file.size > PAYMENT_PROOF_MAX_BYTES) {
      toast('Ukuran berkas maksimal 5 MB. Foto akan dikompres otomatis setelah dipilih.', {
        variant: 'error',
      });
      return;
    }

    try {
      await uploadProof.mutateAsync({ invoiceId: invoice.id, file });
      toast('Bukti pembayaran tersimpan.', { variant: 'success' });
    } catch (error) {
      toast(
        error instanceof Error ? error.message : 'Bukti pembayaran gagal diunggah. Coba lagi.',
        {
          variant: 'error',
        },
      );
    }
  }

  const invoices = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);
  // `statusFilter !== undefined` rather than truthiness: the unset filter is
  // `null`, which is falsy but still an active filter.
  const anyFilter = Boolean(search) || statusFilter !== undefined || Boolean(templateFilter);

  // The server reports `total` for the *current query*: it is the dataset size
  // only while no filter narrows it. With a filter active the dataset scope
  // walks the source instead (the hook's own fallback).
  const datasetTotal = anyFilter ? null : (data?.pages[0]?.total ?? null);
  const scopeView = useSelectionScope('invoices', snapshot.all, invoiceLoaders, datasetTotal);
  /** The global count — `null` while an all-scope walk is still resolving. */
  const selectionCount = selection.count(scopeView.size);
  /** Whether one id is currently selected, under the active scope (or plain). */
  const isSelected = (id: string) => selection.isSelected(id, scopeView.has(id));

  /**
   * TanStack's `rowSelection`, derived fresh from the store each render:
   * loaded rows only — all the feature needs — with everything outside the
   * current page left to the store. One source of truth, nothing to drift.
   */
  const rowSelection: RowSelectionState = {};
  for (const invoice of invoices) {
    if (isSelected(invoice.id)) rowSelection[invoice.id] = true;
  }

  /**
   * Translates TanStack's selection updates (a row tick, "select this page")
   * back into store operations for the loaded ids; rows the current page
   * never showed keep whatever the store already holds for them.
   */
  function applyRowSelectionChange(
    updater: RowSelectionState | ((old: RowSelectionState) => RowSelectionState),
  ) {
    const next = typeof updater === 'function' ? updater(rowSelection) : updater;
    const addInside: string[] = [];
    const addOutside: string[] = [];
    const dropInside: string[] = [];
    const dropOutside: string[] = [];
    for (const invoice of invoices) {
      const inScope = scopeView.has(invoice.id);
      const wanted = Boolean(next[invoice.id]);
      if (wanted === isSelected(invoice.id)) continue;
      let bucket: string[];
      if (wanted) bucket = inScope ? addInside : addOutside;
      else bucket = inScope ? dropInside : dropOutside;
      bucket.push(invoice.id);
    }
    if (addInside.length) selection.setMany(addInside, true, true);
    if (addOutside.length) selection.setMany(addOutside, true, false);
    if (dropInside.length) selection.setMany(dropInside, false, true);
    if (dropOutside.length) selection.setMany(dropOutside, false, false);
  }

  /** Export getter: resolves the complete selection, revalidating first. */
  async function exportSelectedRows() {
    const rows = await exportRows({
      snapshot: selection.getSnapshot(),
      loaders: invoiceLoaders,
      noun: 'nota',
    });
    return toInvoiceRows(rows);
  }

  /**
   * The header's scope menu — built here so it closes over this render's
   * filters, store and scope; the column defs memo on it below.
   */
  const selectAllMenu = (
    <SelectAllMenu
      noun="nota"
      pageCount={invoices.length}
      onSelectPage={() =>
        setManyInScope(
          selection,
          invoices.map((invoice) => invoice.id),
          true,
          scopeView.has,
        )
      }
      onSelectFiltered={
        anyFilter
          ? () =>
              selection.selectScope({
                kind: 'filtered',
                criteria: { search, status: statusFilter, templateId: templateFilter },
              })
          : undefined
      }
      onSelectDataset={() => selection.selectScope({ kind: 'dataset' })}
    />
  );

  const debouncedSearch = useDebouncedCallback((value: string) => setSearch(value), {
    wait: SEARCH_WAIT,
  });

  const columns = useMemo(
    () =>
      columnHelper.columns([
        // Row checkboxes, first column so the eye lands on them and the
        // select-all header sits above the column. The `select` id is also
        // why sorting is skipped for it — display columns have no accessor.
        columnHelper.display({
          id: 'select',
          size: 96,
          header: ({ table }) => (
            // The checkbox toggles what is on screen; the menu beside it
            // offers the wider scopes (this page / this filter / everything).
            <span className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={table.getIsAllPageRowsSelected()}
                ref={(element) => {
                  // Block body (not a concise arrow): React 19 treats a
                  // returned non-function as a ref-cleanup error, and this
                  // assignment is a side effect, not a return value.
                  if (element) {
                    element.indeterminate = table.getIsSomePageRowsSelected();
                  }
                }}
                onChange={table.getToggleAllPageRowsSelectedHandler()}
                aria-label="Pilih semua nota yang dimuat"
                className="h-4 w-4 accent-accent"
              />
              {selectAllMenu}
            </span>
          ),
          cell: ({ row }) => (
            // The invoice-number cell's stretched link `::after` overlays the
            // whole `tr`; a positioned wrapper with a higher z-index keeps the
            // checkbox clickable above it.
            <span className="relative z-10 inline-flex">
              <input
                type="checkbox"
                checked={row.getIsSelected()}
                onChange={row.getToggleSelectedHandler()}
                aria-label={`Pilih nota ${row.original.invoiceNumber}`}
                className="h-4 w-4 accent-accent"
              />
            </span>
          ),
        }),
        columnHelper.accessor('invoiceNumber', {
          id: 'invoiceNumber',
          header: 'Nomor',
          size: 140,
          // The stretched link is what makes the whole row clickable: its
          // `::after` covers the row (the `tr` is the positioned ancestor),
          // while controls in later cells sit above it in paint order.
          cell: (info) => (
            <a
              href={`/invoice/${info.row.original.id}`}
              className="rounded-control font-medium tabular-nums focus-ring after:absolute after:inset-0"
            >
              {info.getValue()}
            </a>
          ),
        }),
        columnHelper.accessor('customerName', {
          id: 'customerName',
          header: 'Pelanggan',
          // Long names stretch an auto-layout column and shove everything
          // else off-screen; clamp per-cell instead, with the full value on
          // hover.
          cell: (info) => {
            const name = info.getValue();
            if (!name) return <span className="text-muted">-</span>;
            return (
              <span className="block max-w-[220px] truncate" title={name}>
                {name}
              </span>
            );
          },
        }),
        columnHelper.accessor(
          (invoice) =>
            calculateTotals({
              items: invoice.items,
              discount: invoice.discount,
              tax: invoice.tax,
            }).grandTotal,
          {
            id: 'total',
            header: 'Total',
            size: 140,
            // Money reads as a right-aligned numeric column — and it has to
            // match the header, which was already right-aligned.
            cell: (info) => (
              <span className="block text-right tabular-nums font-medium">
                {formatRupiah(info.getValue())}
              </span>
            ),
          },
        ),
        columnHelper.accessor('date', {
          id: 'date',
          header: 'Tanggal',
          size: 140,
          cell: (info) => (
            <span className="text-muted" title={formatTanggal(info.getValue())}>
              {formatTanggalRelatif(info.getValue())}
            </span>
          ),
        }),
        columnHelper.accessor('status', {
          id: 'status',
          header: 'Status',
          size: 150,
          cell: (info) => {
            const invoice = info.row.original;
            return (
              // One line where both fit, wrapping gracefully where they do
              // not — a stacked second badge made every flagged row taller
              // than its neighbours.
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusBadge status={invoice.status} />
                {needsPaymentCheck(invoice) && (
                  <Badge variant="warning" size="sm">
                    <ShieldAlert size={11} aria-hidden="true" />
                    Perlu cek pembayaran
                  </Badge>
                )}
              </div>
            );
          },
        }),
        columnHelper.display({
          id: 'actions',
          header: '',
          size: 56,
          cell: (info) => {
            const invoice = info.row.original;
            const proof = invoice.paymentProof ?? null;
            return (
              <Menu
                label={`Aksi nota ${invoice.invoiceNumber}`}
                align="end"
                items={[
                  {
                    label: 'Buka & edit',
                    icon: <ChevronRight size={15} aria-hidden="true" />,
                    href: `/invoice/${invoice.id}`,
                  },
                  {
                    label: 'Duplikat',
                    icon: <Copy size={15} aria-hidden="true" />,
                    href: `/invoice/new?from=${invoice.id}`,
                  },
                  publicLinkReady
                    ? {
                        label: 'Buka halaman tagihan',
                        icon: <ExternalLink size={15} aria-hidden="true" />,
                        // The capability URL the customer uses: shows the
                        // invoice and the one-shot proof upload form.
                        href: `/invoice/print/${invoice.id}`,
                      }
                    : {
                        label: 'Pilih Pro untuk berbagi tautan tagihan',
                        icon: <Sparkles size={15} aria-hidden="true" />,
                        href: '/checkout?plan=pro',
                      },
                  {
                    // The owner's own upload: allowed on any status (the
                    // customer's form closes on Lunas/Batal) and replaces an
                    // existing proof instead of requiring a delete first.
                    label: proof ? 'Ganti bukti pembayaran' : 'Unggah bukti pembayaran',
                    icon: <ImageUp size={15} aria-hidden="true" />,
                    onClick: () => {
                      proofUpload.current = invoice;
                      proofFileRef.current?.click();
                    },
                  },
                  ...(proof
                    ? [
                        {
                          label: 'Lihat bukti pembayaran',
                          icon: <ImageIcon size={15} aria-hidden="true" />,
                          onClick: () => setProofView(invoice),
                        },
                        {
                          label: 'Hapus bukti pembayaran',
                          icon: <Trash2 size={15} aria-hidden="true" />,
                          variant: 'danger' as const,
                          onClick: () => setProofDelete(invoice),
                        },
                      ]
                    : []),
                  {
                    label: 'Hapus',
                    icon: <Trash2 size={15} aria-hidden="true" />,
                    variant: 'danger',
                    onClick: () => setPendingDelete(invoice),
                  },
                ]}
              >
                <EllipsisVertical size={16} aria-hidden="true" />
              </Menu>
            );
          },
        }),
      ]),
    // `selectAllMenu` is rebuilt every render (it closes over the live store
    // and filters) and `publicLinkReady` flips when the profile lands —
    // recreating the defs keeps both truthful. Column ids are stable, so
    // sizing and other column state are unaffected.
    [selectAllMenu, publicLinkReady],
  );

  const table = useTable({
    features,
    data: invoices,
    columns,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: applyRowSelectionChange,
    // Stable ids so a checked row stays checked when a later page loads and
    // the row index shifts underneath it.
    getRowId: (invoice) => invoice.id,
    defaultColumn: { size: 140 },
  });

  const searchField = useFieldIds();
  const statusField = useFieldIds();
  const templateField = useFieldIds();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full flex-col gap-2 sm:max-w-md sm:flex-row sm:items-center">
          <div data-tour="invoices-search" className="w-full sm:max-w-xs">
            <label htmlFor={searchField.id} className="sr-only">
              Cari nota
            </label>
            <SearchField
              id={searchField.id}
              value={searchInput}
              placeholder="Cari nomor, pelanggan, atau barang…"
              onChange={(value) => {
                setSearchInput(value);
                debouncedSearch(value);
              }}
            />
          </div>
          <div data-tour="invoices-filter" className="w-full sm:w-auto">
            <label htmlFor={statusField.id} className="sr-only">
              Saring status
            </label>
            <Select
              id={statusField.id}
              size="sm"
              clearable
              value={
                statusFilter === undefined
                  ? ''
                  : statusFilter === null
                    ? UNSET_STATUS_FILTER
                    : statusFilter
              }
              aria-label="Saring status"
              placeholder="Semua status"
              options={[
                // "Belum dikirim" first: it is where every invoice starts,
                // so the list of options reads in lifecycle order.
                { value: UNSET_STATUS_FILTER, label: UNSET_STATUS_LABEL },
                ...INVOICE_STATUSES.map((status) => ({
                  value: status,
                  label: INVOICE_STATUS_LABELS[status],
                })),
              ]}
              onChange={(next) =>
                setStatusFilter(
                  next === ''
                    ? undefined
                    : next === UNSET_STATUS_FILTER
                      ? null
                      : (next as InvoiceStatus),
                )
              }
              className="w-full sm:w-auto"
            />
          </div>
          <div data-tour="invoices-template-filter" className="w-full sm:w-auto">
            <label htmlFor={templateField.id} className="sr-only">
              Filter template
            </label>
            <Select
              id={templateField.id}
              size="sm"
              clearable
              value={templateFilter ?? ''}
              aria-label="Filter template"
              placeholder="Semua template"
              options={templateOptions}
              onChange={(next) => setTemplateFilter(next || undefined)}
              className="w-full sm:w-auto"
            />
          </div>
        </div>
        {/* No create button here on purpose: the page header already owns the
            one primary "Buat invoice" CTA (and the tour points at it), the
            empty state gets its own contextual copy when there is nothing yet. */}
      </div>

      {/* A failed background refresh still has rows to show, so the banner is
          only shown alongside real data. With nothing loaded, the error state
          below owns the panel — showing it next to "Belum ada invoice" would
          claim both "we could not load your invoices" and "you have none". */}
      {isError && invoices.length > 0 && (
        <Notice variant="accent">
          Daftar nota belum diperbarui. Yang tampil masih data terakhir.
        </Notice>
      )}

      {/* Appears the moment anything is ticked: the count, an export of the
          COMPLETE selection (revalidated across every page), the bulk delete,
          and a way out. */}
      {hasSelection(selectionCount) && (
        <SelectionToolbar
          count={selectionCount}
          noun="nota"
          onClear={() => selection.clear()}
          clearDisabled={deleteInvoices.isPending || resolving}
          exportOptions={{
            filename: 'nota-terpilih',
            sheetName: 'Nota',
            getRows: exportSelectedRows,
            pdfTitle: 'Nota terpilih',
          }}
          actions={
            <Button
              variant="danger"
              size="sm"
              onClick={() => setBulkDeleteOpen(true)}
              disabled={deleteInvoices.isPending || resolving}
            >
              <Trash2 size={15} aria-hidden="true" />
              Hapus {selectionCount ?? 0}
            </Button>
          }
        />
      )}

      {isError && invoices.length === 0 ? (
        <ErrorState
          title="Nota belum bisa dimuat"
          message="Periksa koneksi internet kamu, lalu coba lagi."
          action={
            <Button size="sm" loading={isFetching} onClick={() => void refetch()}>
              Coba lagi
            </Button>
          }
        />
      ) : isLoading ? (
        <LoadingState label="Memuat nota…" />
      ) : invoices.length === 0 ? (
        <EmptyState
          title={anyFilter ? 'Belum ada nota yang cocok' : 'Belum ada nota'}
          description={
            anyFilter
              ? 'Coba kata kunci lain, atau ubah/hapus filter di atas.'
              : 'Buat nota pertamamu, simpan sebagai PDF, lalu lampirkan sendiri di WhatsApp untuk dikirim.'
          }
          action={
            !anyFilter ? (
              <Button href="/invoice/new">
                <Plus size={16} aria-hidden="true" />
                Buat nota
              </Button>
            ) : undefined
          }
        />
      ) : (
        <TableFrame data-tour="invoices-table" aria-busy={isFetching}>
          <table className={TABLE} style={{ minWidth: '640px' }}>
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className={THEAD_ROW}>
                  {headerGroup.headers.map((header) => {
                    const sortable = header.column.getCanSort();
                    const sorted = header.column.getIsSorted();
                    const SortIcon =
                      sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown;
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        // Assistive tech reads this off the column header, so
                        // the sort state has to live here rather than on the
                        // button inside it.
                        aria-sort={
                          sortable
                            ? sorted === 'asc'
                              ? 'ascending'
                              : sorted === 'desc'
                                ? 'descending'
                                : 'none'
                            : undefined
                        }
                        className={thClass(
                          [
                            // Only money right-aligns: its cell does too. The
                            // date column reads left with its cell (relative
                            // text like "Kemarin" hangs off the left edge).
                            header.id === 'total' ? 'text-right' : '',
                            header.id === 'actions' ? 'w-14 text-right' : '',
                          ]
                            .filter(Boolean)
                            .join(' '),
                        )}
                        style={{ width: header.getSize() }}
                      >
                        {sortable ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="inline-flex items-center gap-1 rounded-control transition-colors hover:text-foreground focus-ring"
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            <SortIcon size={12} aria-hidden="true" />
                          </button>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className={TBODY_ROW}>
                  {row.getAllCells().map((cell) => (
                    <td key={cell.id} className={tdClass()}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </TableFrame>
      )}

      {invoices.length > 0 && hasNextPage && !isPlaceholderData && (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            size="sm"
            loading={isFetchingNextPage}
            onClick={() => void fetchNextPage()}
          >
            Muat lebih banyak
          </Button>
        </div>
      )}

      {/* One shared picker for every row: the menu arms it with the target
          invoice (a ref, so the memoised column defs stay fresh) and opens
          it. Hidden but focusable-by-code — the file dialog needs no label. */}
      <input
        ref={proofFileRef}
        type="file"
        accept={PAYMENT_PROOF_ACCEPT}
        className="sr-only"
        aria-label="Pilih berkas bukti pembayaran"
        onChange={(event) => void handleProofFile(event)}
      />

      <Modal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        role="alertdialog"
        size="sm"
        ariaLabelledBy="delete-dialog-title"
        title={<span id="delete-dialog-title">Hapus nota ini?</span>}
        actions={[
          { label: 'Batal', variant: 'secondary', onClick: () => setPendingDelete(null) },
          {
            label: 'Hapus',
            variant: 'danger',
            loading: deleteInvoice.isPending,
            onClick: confirmDelete,
          },
        ]}
      >
        <p className="text-sm text-muted">
          Nota {pendingDelete?.invoiceNumber} untuk {pendingDelete?.customerName} akan dihapus
          permanen.
        </p>
      </Modal>

      <Modal
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        role="alertdialog"
        size="sm"
        ariaLabelledBy="bulk-delete-dialog-title"
        title={
          <span id="bulk-delete-dialog-title">Hapus {selectionCount ?? 0} nota terpilih?</span>
        }
        actions={[
          { label: 'Batal', variant: 'secondary', onClick: () => setBulkDeleteOpen(false) },
          {
            label: 'Hapus',
            variant: 'danger',
            loading: deleteInvoices.isPending || resolving,
            onClick: () => void confirmBulkDelete(),
          },
        ]}
      >
        <p className="text-sm text-muted">
          Nota yang dipilih akan dihapus permanen dan tidak bisa dipulihkan.
        </p>
      </Modal>

      <Modal
        open={proofView !== null}
        onClose={() => setProofView(null)}
        size="md"
        ariaLabelledBy="proof-dialog-title"
        title={
          <span id="proof-dialog-title">Bukti pembayaran nota {proofView?.invoiceNumber ?? ''}</span>
        }
        actions={[{ label: 'Tutup', variant: 'secondary', onClick: () => setProofView(null) }]}
      >
        {proofView?.paymentProof && (
          <div className="flex flex-col gap-3">
            <img
              src={`/api/proof/${encodeURIComponent(proofView.paymentProof.key)}`}
              alt={`Bukti pembayaran nota ${proofView.invoiceNumber}`}
              className="mx-auto max-h-[60vh] rounded-control border border-border object-contain"
            />
            <p className="text-center text-xs text-muted">
              Diunggah {formatTanggalRelatif(proofView.paymentProof.uploadedAt)}
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={proofDelete !== null}
        onClose={() => setProofDelete(null)}
        role="alertdialog"
        size="sm"
        ariaLabelledBy="proof-delete-dialog-title"
        title={<span id="proof-delete-dialog-title">Hapus bukti pembayaran ini?</span>}
        actions={[
          { label: 'Batal', variant: 'secondary', onClick: () => setProofDelete(null) },
          {
            label: 'Hapus',
            variant: 'danger',
            loading: deleteProof.isPending,
            onClick: confirmProofDelete,
          },
        ]}
      >
        <p className="text-sm text-muted">
          Bukti pembayaran untuk nota {proofDelete?.invoiceNumber} akan dihapus. Pelanggan bisa
          mengirim bukti baru lewat tautan nota.
        </p>
      </Modal>
    </div>
  );
}
