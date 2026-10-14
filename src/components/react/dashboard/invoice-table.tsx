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
import { ArrowUpDown, ChevronRight, Copy, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { calculateTotals } from '../../../core/invoice/calculator';
import type { Invoice } from '../../../core/invoice/model';
import { formatRupiah } from '../../../core/shared/money';
import { formatTanggalRelatif } from '../../../core/shared/dates';
import { useDeleteInvoice, useInvoices } from '../../../lib/query/hooks/use-invoices';
import { toast } from '../../../lib/ui/toast';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { TABLE, TABLE_SHELL, TBODY_ROW, THEAD_ROW, thClass } from '../ui/table';
import { controlClass, useFieldIds } from '../ui/field';

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
  } = useInvoices(search);
  const deleteInvoice = useDeleteInvoice();

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
        columnHelper.display({
          id: 'actions',
          header: '',
          size: 128,
          cell: (info) => (
            <div className="flex items-center justify-end gap-1">
              <a
                href={`/invoice/${info.row.original.id}`}
                aria-label={`Buka ${info.row.original.invoiceNumber}`}
                className="rounded-control p-2 text-muted transition-colors hover:bg-background hover:text-foreground focus-ring"
              >
                <ChevronRight size={16} aria-hidden="true" />
              </a>
              <a
                href={`/invoice/new?from=${info.row.original.id}`}
                aria-label={`Duplikat ${info.row.original.invoiceNumber}`}
                title="Duplikat invoice ini"
                className="rounded-control p-2 text-muted transition-colors hover:bg-background hover:text-foreground focus-ring"
              >
                <Copy size={15} aria-hidden="true" />
              </a>
              <button
                type="button"
                aria-label={`Hapus ${info.row.original.invoiceNumber}`}
                onClick={() => setPendingDelete(info.row.original)}
                className="rounded-control p-2 text-muted transition-colors hover:bg-danger-soft hover:text-danger focus-ring"
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </div>
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

  const { id: searchId } = useFieldIds();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search
            size={15}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <label htmlFor={searchId} className="sr-only">
            Cari invoice
          </label>
          <input
            id={searchId}
            type="search"
            value={searchInput}
            placeholder="Cari nomor, customer, atau barang…"
            className={controlClass({ className: 'h-10 pr-3 pl-9' })}
            onChange={(event) => {
              setSearchInput(event.target.value);
              debouncedSearch(event.target.value);
            }}
          />
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
            {search ? 'Tidak ada invoice yang cocok' : 'Belum ada invoice'}
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
            {search
              ? 'Coba kata kunci lain, atau hapus kolom pencarian.'
              : 'Buat invoice pertama kamu dan kirim ke customer dalam hitungan menit.'}
          </p>
          {!search && (
            <div className="mt-6 flex justify-center">
              <Button onClick={() => window.location.assign('/invoice/new')}>Buat Invoice</Button>
            </div>
          )}
        </Card>
      ) : (
        <div className={TABLE_SHELL}>
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
                            header.id === 'actions' ? 'w-24 text-right' : '',
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

      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/45 p-4"
          role="presentation"
          onClick={() => setPendingDelete(null)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            className="w-full max-w-sm rounded-card border border-border bg-card p-6 shadow-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="delete-dialog-title" className="text-base font-semibold">
              Hapus invoice ini?
            </h2>
            <p className="mt-2 text-sm text-muted">
              {pendingDelete.invoiceNumber} untuk {pendingDelete.customerName} akan dihapus
              permanen.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPendingDelete(null)}>
                Batal
              </Button>
              <Button
                variant="danger"
                loading={deleteInvoice.isPending}
                onClick={async () => {
                  try {
                    await deleteInvoice.mutateAsync(pendingDelete.id);
                    toast('Invoice berhasil dihapus.', { variant: 'success' });
                  } catch {
                    toast('Invoice gagal dihapus. Coba lagi.', { variant: 'error' });
                  } finally {
                    setPendingDelete(null);
                  }
                }}
              >
                Hapus
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
