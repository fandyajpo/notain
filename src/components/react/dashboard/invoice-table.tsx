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
import { ArrowUpDown, ChevronRight, Copy, EllipsisVertical, Search, Trash2 } from 'lucide-react';
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
import {
  useDeleteInvoice,
  useInvoices,
  useUpdateInvoiceStatus,
} from '../../../lib/query/hooks/use-invoices';
import { toast } from '../../../lib/ui/toast';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Input } from '../ui/input';
import { Menu } from '../ui/menu';
import { Modal } from '../ui/modal';
import { Select } from '../ui/select';
import { StatusSelect } from '../ui/status-select';
import { TABLE, TABLE_SHELL, TBODY_ROW, THEAD_ROW, thClass } from '../ui/table';
import { useFieldIds } from '../ui/field';

const features = tableFeatures({
  columnSizingFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});
const columnHelper = createColumnHelper<typeof features, Invoice>();
const SEARCH_WAIT = 300;

/**
 * The status cell: flips an invoice's lifecycle state straight from the table.
 *
 * Persistence is a targeted status-only write, not a full-draft round-trip —
 * rich-text sections are never shipped just to change one enum.
 */
function StatusCell({ invoice }: { invoice: Invoice }) {
  const updateStatus = useUpdateInvoiceStatus();

  return (
    <StatusSelect
      value={invoice.status}
      label={invoice.invoiceNumber}
      disabled={updateStatus.isPending}
      onChange={(status) => {
        if (status === invoice.status) return;
        updateStatus.mutateAsync({ id: invoice.id, status }).catch(() => {
          toast('Status gagal disimpan. Coba lagi.', { variant: 'error' });
        });
      }}
    />
  );
}

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
          cell: (info) => <span className="font-medium tabular-nums">{info.getValue()}</span>,
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
          cell: (info) => <StatusCell invoice={info.row.original} />,
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
          <div data-tour="invoices-search" className="relative w-full sm:max-w-xs">
            <Search
              size={15}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <label htmlFor={searchField.id} className="sr-only">
              Cari invoice
            </label>
            <Input
              id={searchField.id}
              type="search"
              value={searchInput}
              placeholder="Cari nomor, customer, atau barang…"
              className="h-10 pr-3 pl-9"
              onChange={(event) => {
                setSearchInput(event.target.value);
                debouncedSearch(event.target.value);
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
        <Button href="/invoice/new">+ Buat Invoice</Button>
      </div>

      {/* A failed background refresh still has rows to show, so the banner is
          only shown alongside real data. With nothing loaded, the error state
          below owns the panel — showing it next to "Belum ada invoice" would
          claim both "we could not load your invoices" and "you have none". */}
      {isError && invoices.length > 0 && (
        <p
          role="alert"
          className="rounded-control border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger"
        >
          Gagal memperbarui daftar invoice. Menampilkan data terakhir yang dimuat.
        </p>
      )}

      {isError && invoices.length === 0 ? (
        <div
          role="alert"
          className="rounded-card border border-danger/25 bg-danger-soft px-6 py-14 text-center"
        >
          <p className="text-base font-semibold text-danger">Gagal memuat invoice</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
            Periksa koneksi internet kamu, lalu coba lagi.
          </p>
          <div className="mt-6 flex justify-center">
            <Button size="sm" loading={isFetching} onClick={() => void refetch()}>
              Coba lagi
            </Button>
          </div>
        </div>
      ) : isLoading ? (
        <Card padding="none" className="px-6 py-10 text-center text-sm text-muted">
          Memuat invoice…
        </Card>
      ) : invoices.length === 0 ? (
        <Card padding="none" className="px-6 py-14 text-center">
          <p className="text-base font-semibold">
            {search || statusFilter ? 'Tidak ada invoice yang cocok' : 'Belum ada invoice'}
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
            {search || statusFilter
              ? 'Coba kata kunci lain, atau ubah/hapus filter pencarian dan status.'
              : 'Buat invoice pertama kamu dan kirim ke customer dalam hitungan menit.'}
          </p>
          {!(search || statusFilter) && (
            <div className="mt-6 flex justify-center">
              <Button onClick={() => window.location.assign('/invoice/new')}>Buat Invoice</Button>
            </div>
          )}
        </Card>
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
                    <td key={cell.id} className="px-4 py-3">
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
