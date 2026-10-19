import { PackageSearch, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CATALOG_KIND_LABELS, type CatalogItem } from '../../../core/catalog/model';
import { formatRupiah } from '../../../core/shared/money';
import { useCatalog } from '../../../lib/query/hooks/use-catalog';
import { Button } from '../ui/button';
import { Modal } from '../ui/modal';
import { SearchField } from '../ui/search-field';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Appends one picked entry to the invoice's item list. */
  onPick: (item: CatalogItem) => void;
};

/**
 * The invoice builder's "Ambil dari katalog" dialog: the owner's saved
 * barang/jasa, searchable, one tap to add each to the invoice. Stays open
 * after a pick so several lines can be added in one visit.
 */
export function CatalogPickerDialog({ open, onClose, onPick }: Props) {
  const { data, isLoading, isError, isFetching, refetch } = useCatalog();
  const [query, setQuery] = useState('');

  const items = useMemo(() => data ?? [], [data]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.name.toLowerCase().includes(q));
  }, [items, query]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ambil dari katalog"
      size="lg"
      bodyClassName="max-h-[65dvh] overflow-y-auto px-5 py-4 sm:px-6"
      actions={[{ label: 'Selesai', variant: 'secondary', onClick: onClose }]}
    >
      {isLoading ? (
        <LoadingState label="Memuat katalog…" />
      ) : isError && items.length === 0 ? (
        <ErrorState
          title="Gagal memuat katalog"
          message="Periksa koneksi internet kamu, lalu coba lagi."
          inline
          action={
            <Button size="sm" loading={isFetching} onClick={() => void refetch()}>
              Coba lagi
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title="Katalog kamu masih kosong"
          description="Simpan barang atau jasa yang sering kamu jual supaya bisa dipakai ulang di invoice berikutnya."
          action={
            <Button href="/catalog" size="sm">
              Buka katalog
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          <SearchField value={query} placeholder="Cari barang atau jasa…" onChange={setQuery} />

          {filtered.length === 0 ? (
            <EmptyState title="Tidak ada yang cocok." />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {filtered.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onPick(item)}
                    className="flex w-full items-center justify-between gap-3 rounded-control border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-accent hover:bg-accent-soft focus-ring"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {item.name}
                      </span>
                      <span className="block text-xs text-muted">
                        {CATALOG_KIND_LABELS[item.kind]}
                        {item.unit ? ` · per ${item.unit}` : ''}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2.5">
                      <span className="text-sm font-medium tabular-nums text-foreground">
                        {formatRupiah(item.unitPrice)}
                      </span>
                      <Plus size={16} className="text-accent" aria-hidden="true" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}
