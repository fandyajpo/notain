import { useMemo } from 'react';
import { ScrollText } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { LoadMore } from '../ui/load-more';
import { ErrorState, LoadingState } from '../ui/state';
import { TableShell, Th, Td, TBODY_ROW, THEAD_ROW } from '../ui/table';
import { useAdminAudit } from '../../../lib/query/hooks/use-admin';
import { toAppError } from '../../../app/errors';

const ACTION_LABELS: Record<string, string> = {
  'user.update': 'Edit profil',
  'user.suspend': 'Nonaktifkan',
  'user.unsuspend': 'Aktifkan',
  'content.templates.create': 'Tambah template',
  'content.templates.update': 'Edit template',
  'content.templates.delete': 'Hapus template',
  'content.invoices.create': 'Tambah invoice',
  'content.invoices.update': 'Edit invoice',
  'content.invoices.delete': 'Hapus invoice',
};

/** Log aktivitas tab: newest-first list of admin actions. */
export function AdminAuditPanel() {
  const { data, isFetching, hasNextPage, isFetchingNextPage, fetchNextPage, error, refetch } =
    useAdminAudit();

  const rows = useMemo(() => data?.pages.flatMap((page) => page.rows) ?? [], [data]);

  if (isFetching && rows.length === 0) {
    return <LoadingState label="Memuat log aktivitas…" />;
  }

  if (error && rows.length === 0) {
    return (
      <ErrorState
        title="Gagal memuat log aktivitas"
        message={toAppError(error).message}
        action={
          <Button variant="secondary" size="sm" loading={isFetching} onClick={() => void refetch()}>
            Coba lagi
          </Button>
        }
      />
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-control border border-dashed border-border py-12 text-center">
        <ScrollText size={22} className="text-muted" aria-hidden="true" />
        <p className="text-sm text-foreground">Belum ada aktivitas tercatat.</p>
        <p className="text-xs text-muted">
          Aksi admin (edit profil, jeda/aktifkan user) akan muncul di sini.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <TableShell minWidth="720px">
        <thead>
          <tr className={THEAD_ROW}>
            <Th>Waktu</Th>
            <Th>Admin</Th>
            <Th>Aksi</Th>
            <Th>Target</Th>
            <Th>Detail</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={TBODY_ROW}>
              <Td className="whitespace-nowrap text-muted">
                {row.createdAt ? new Date(row.createdAt).toLocaleString('id-ID') : '—'}
              </Td>
              <Td className="text-muted">{row.actorEmail || row.actorId || '—'}</Td>
              <Td>
                <Badge
                  variant={
                    row.action.endsWith('.suspend')
                      ? 'danger'
                      : row.action.endsWith('.unsuspend')
                        ? 'success'
                        : 'neutral'
                  }
                >
                  {ACTION_LABELS[row.action] ?? row.action}
                </Badge>
              </Td>
              <Td className="font-mono text-xs text-muted">{row.targetId || '—'}</Td>
              <Td className="max-w-[240px] truncate text-xs text-muted" title={row.detail}>
                {row.detail || '—'}
              </Td>
            </tr>
          ))}
        </tbody>
      </TableShell>

      <LoadMore
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        fetchNextPage={() => void fetchNextPage()}
      />
    </div>
  );
}
