import { useMemo } from 'react';
import { Inbox } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { LoadMore } from '../ui/load-more';
import { Notice } from '../ui/notice';
import { ErrorState, LoadingState } from '../ui/state';
import { TableShell, Th, Td, TBODY_ROW, THEAD_ROW } from '../ui/table';
import { useAdminSupport, useSetAdminSupportSolved } from '../../../lib/query/hooks/use-admin';
import { toAppError } from '../../../app/errors';

/** Support tab: every public contact message, solvable by a super admin. */
export function AdminSupportPanel() {
  const { data, isFetching, hasNextPage, isFetchingNextPage, fetchNextPage, error, refetch } =
    useAdminSupport();
  const setSolved = useSetAdminSupportSolved();

  const rows = useMemo(() => data?.pages.flatMap((page) => page.rows) ?? [], [data]);

  if (isFetching && rows.length === 0) {
    return <LoadingState label="Memuat pesan support…" />;
  }

  if (error && rows.length === 0) {
    return (
      <ErrorState
        title="Gagal memuat pesan support"
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
        <Inbox size={22} className="text-muted" aria-hidden="true" />
        <p className="text-sm text-foreground">Belum ada pesan masuk.</p>
        <p className="text-xs text-muted">Pesan dari formulir kontak akan muncul di sini.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {setSolved.isError && <Notice variant="danger">{toAppError(setSolved.error).message}</Notice>}

      <TableShell minWidth="860px">
        <thead>
          <tr className={THEAD_ROW}>
            <Th>Waktu</Th>
            <Th>Pengirim</Th>
            <Th>Subjek</Th>
            <Th>Pesan</Th>
            <Th>Status</Th>
            <Th>Aksi</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const busy = setSolved.isPending && setSolved.variables?.id === row.id;
            const solved = row.solvedAt !== null;
            return (
              <tr key={row.id} className={TBODY_ROW}>
                <Td className="whitespace-nowrap text-muted">
                  {row.createdAt ? new Date(row.createdAt).toLocaleString('id-ID') : '—'}
                </Td>
                <Td>
                  <p className="text-sm text-foreground">{row.name || '—'}</p>
                  <p className="text-xs text-muted">{row.email}</p>
                </Td>
                <Td className="max-w-[180px] truncate text-sm" title={row.subject}>
                  {row.subject || '—'}
                </Td>
                <Td className="max-w-[280px] text-xs text-muted">
                  <span className="line-clamp-2" title={row.message}>
                    {row.message}
                  </span>
                </Td>
                <Td>
                  {solved ? (
                    <Badge
                      variant="success"
                      title={row.solvedBy ? `Diselesaikan ${row.solvedBy}` : undefined}
                    >
                      Selesai
                    </Badge>
                  ) : (
                    <Badge variant="warning">Menunggu</Badge>
                  )}
                </Td>
                <Td>
                  <Button
                    variant={solved ? 'secondary' : 'primary'}
                    size="sm"
                    loading={busy}
                    disabled={setSolved.isPending && !busy}
                    onClick={() => setSolved.mutate({ id: row.id, solved: !solved })}
                  >
                    {solved ? 'Buka kembali' : 'Tandai selesai'}
                  </Button>
                </Td>
              </tr>
            );
          })}
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
