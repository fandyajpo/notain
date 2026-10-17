import {
  columnSizingFeature,
  createColumnHelper,
  createSortedRowModel,
  flexRender,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type SortingState,
} from '@tanstack/react-table';
import { useDebouncedCallback } from '@tanstack/react-pacer';
import { ArrowUpDown, ChevronRight, Copy, EllipsisVertical, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { calculateTotals } from '../../../core/invoice/calculator';
import {
  INVOICE_STATUSES,
  INVOICE_STATUS_LABELS,
  UNSET_STATUS_LABEL,
  type Invoice,
  type InvoiceStatus,
} from '../../../core/invoice/model';
import { BUILTIN_TEMPLATES } from '../../../core/template/builtins';
import { formatRupiah } from '../../../core/shared/money';
import { formatTanggalRelatif } from '../../../core/shared/dates';
import { useDeleteInvoice, useInvoices } from '../../../lib/query/hooks/use-invoices';
import { useTemplates } from '../../../lib/query/hooks/use-templates';
import { toast } from '../../../lib/ui/toast';
import { Button } from '../ui/button';
import { Menu } from '../ui/menu';
import { Modal } from '../ui/modal';
import { Notice } from '../ui/notice';
import { SearchField } from '../ui/search-field';
import { Select } from '../ui/select';
import { StatusBadge } from '../ui/status-badge';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';
import { TABLE, TABLE_SHELL, TBODY_ROW, THEAD_ROW, tdClass, thClass } from '../ui/table';
import { useFieldIds } from '../ui/field';

const features = tableFeatures({
  columnSizingFeature,
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

  // Mirror the visible state into the query string. Unknown params (an auth
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
  } = useInvoices(search, { status: statusFilter, templateId: templateFilter });
  const { data: savedTemplates } = useTemplates();
  const deleteInvoice = useDeleteInvoice();

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
      toast('Invoice berhasil dihapus.', { variant: 'success' });
    } catch {
      toast('Invoice gagal dihapus. Coba lagi.', { variant: 'error' });
    } finally {
      setPendingDelete(null);
    }
  }

  const invoices = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);
  // `statusFilter !== undefined` rather than truthiness: the unset filter is
  // `null`, which is falsy but still an active filter.
  const anyFilter = Boolean(search) || statusFilter !== undefined || Boolean(templateFilter);

  const debouncedSearch = useDebouncedCallback((value: string) => setSearch(value), {
    wait: SEARCH_WAIT,
  });

  const columns = useMemo(
    () =>
      columnHelper.columns([
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
          header: 'Customer',
          cell: (info) => info.getValue() || '-',
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
            cell: (info) => (
              <span className="tabular-nums font-medium">{formatRupiah(info.getValue())}</span>
            ),
          },
        ),
        columnHelper.accessor('date', {
          id: 'date',
          header: 'Tanggal',
          size: 140,
          cell: (info) => (
            <span className="text-muted">{formatTanggalRelatif(info.getValue())}</span>
          ),
        }),
        columnHelper.accessor('status', {
          id: 'status',
          header: 'Status',
          size: 120,
          cell: (info) => <StatusBadge status={info.row.original.status} />,
        }),
        columnHelper.display({
          id: 'actions',
          header: '',
          size: 56,
          cell: (info) => (
            <Menu
              label={`Aksi ${info.row.original.invoiceNumber}`}
              align="end"
              items={[
                {
                  label: 'Buka & edit',
                  icon: <ChevronRight size={15} aria-hidden="true" />,
                  href: `/invoice/${info.row.original.id}`,
                },
                {
                  label: 'Duplikat',
                  icon: <Copy size={15} aria-hidden="true" />,
                  href: `/invoice/new?from=${info.row.original.id}`,
                },
                {
                  label: 'Hapus',
                  icon: <Trash2 size={15} aria-hidden="true" />,
                  variant: 'danger',
                  onClick: () => setPendingDelete(info.row.original),
                },
              ]}
            >
              <EllipsisVertical size={16} aria-hidden="true" />
            </Menu>
          ),
        }),
      ]),
    [],
  );

  const table = useTable({
    features,
    data: invoices,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
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
              Cari invoice
            </label>
            <SearchField
              id={searchField.id}
              value={searchInput}
              placeholder="Cari nomor, customer, atau barang…"
              onChange={(value) => {
                setSearchInput(value);
                debouncedSearch(value);
              }}
            />
          </div>
          <div data-tour="invoices-filter" className="w-full sm:w-auto">
            <label htmlFor={statusField.id} className="sr-only">
              Filter status
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
              aria-label="Filter status"
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
            one primary "Buat Invoice" CTA (and the tour points at it), the
            empty state gets its own contextual copy when there is nothing yet. */}
      </div>

      {/* A failed background refresh still has rows to show, so the banner is
          only shown alongside real data. With nothing loaded, the error state
          below owns the panel — showing it next to "Belum ada invoice" would
          claim both "we could not load your invoices" and "you have none". */}
      {isError && invoices.length > 0 && (
        <Notice variant="accent">
          Gagal memperbarui daftar invoice. Menampilkan data terakhir yang dimuat.
        </Notice>
      )}

      {isError && invoices.length === 0 ? (
        <ErrorState
          title="Gagal memuat invoice"
          message="Periksa koneksi internet kamu, lalu coba lagi."
          action={
            <Button size="sm" loading={isFetching} onClick={() => void refetch()}>
              Coba lagi
            </Button>
          }
        />
      ) : isLoading ? (
        <LoadingState label="Memuat invoice…" />
      ) : invoices.length === 0 ? (
        <EmptyState
          title={anyFilter ? 'Tidak ada invoice yang cocok' : 'Belum ada invoice'}
          description={
            anyFilter
              ? 'Coba kata kunci lain, atau ubah/hapus filter di atas.'
              : 'Buat invoice pertama kamu dan kirim ke customer dalam hitungan menit.'
          }
          action={
            !anyFilter ? (
              <Button href="/invoice/new">
                <Plus size={16} aria-hidden="true" />
                Buat Invoice
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div data-tour="invoices-table" className={TABLE_SHELL}>
          <table className={TABLE} style={{ minWidth: '640px' }}>
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className={THEAD_ROW}>
                  {headerGroup.headers.map((header) => {
                    const sortable = header.column.getCanSort();
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        className={thClass(
                          [
                            header.id === 'total' || header.id === 'date' ? 'text-right' : '',
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
                            <ArrowUpDown size={12} aria-hidden="true" />
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
        </div>
      )}

      {invoices.length > 0 && hasNextPage && (
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

      <Modal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        role="alertdialog"
        size="sm"
        ariaLabelledBy="delete-dialog-title"
        title={<span id="delete-dialog-title">Hapus invoice ini?</span>}
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
          {pendingDelete?.invoiceNumber} untuk {pendingDelete?.customerName} akan dihapus permanen.
        </p>
      </Modal>
    </div>
  );
}
