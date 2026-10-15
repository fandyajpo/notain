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
import { useMemo, useState } from 'react';
import { calculateTotals } from '../../../core/invoice/calculator';
import {
  INVOICE_STATUSES,
  INVOICE_STATUS_LABELS,
  type Invoice,
  type InvoiceStatus,
} from '../../../core/invoice/model';
import { formatRupiah } from '../../../core/shared/money';
import { formatTanggalRelatif } from '../../../core/shared/dates';
import { useDeleteInvoice, useInvoices } from '../../../lib/query/hooks/use-invoices';
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

export function InvoiceTable() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  // `undefined` means "all statuses" — no server-side filter is sent.
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | undefined>(undefined);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pendingDelete, setPendingDelete] = useState<Invoice | null>(null);

  const {
    data,
    isLoading,
    isError,
    refetch,
    isFetching,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInvoices(search, { status: statusFilter });
  const deleteInvoice = useDeleteInvoice();

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
              value={statusFilter ?? ''}
              aria-label="Filter status"
              placeholder="Semua status"
              options={INVOICE_STATUSES.map((status) => ({
                value: status,
                label: INVOICE_STATUS_LABELS[status],
              }))}
              onChange={(next) =>
                setStatusFilter(next === '' ? undefined : (next as InvoiceStatus))
              }
              className="w-full sm:w-auto"
            />
          </div>
        </div>
        <Button href="/invoice/new">
          <Plus size={16} aria-hidden="true" />
          Buat Invoice
        </Button>
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
          title={search || statusFilter ? 'Tidak ada invoice yang cocok' : 'Belum ada invoice'}
          description={
            search || statusFilter
              ? 'Coba kata kunci lain, atau ubah/hapus filter pencarian dan status.'
              : 'Buat invoice pertama kamu dan kirim ke customer dalam hitungan menit.'
          }
          action={
            !(search || statusFilter) ? (
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
          { label: 'Hapus', variant: 'danger', loading: deleteInvoice.isPending, onClick: confirmDelete },
        ]}
      >
        <p className="text-sm text-muted">
          {pendingDelete?.invoiceNumber} untuk {pendingDelete?.customerName} akan dihapus permanen.
        </p>
      </Modal>
    </div>
  );
}
