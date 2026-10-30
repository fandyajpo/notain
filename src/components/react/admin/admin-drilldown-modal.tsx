import { useMemo, useState } from 'react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { LoadMore } from '../ui/load-more';
import { Modal } from '../ui/modal';
import { SegmentedControl } from '../ui/segmented';
import { ErrorState, LoadingState } from '../ui/state';
import { TableShell, Th, Td, TBODY_ROW, THEAD_ROW } from '../ui/table';
import { useAdminUserDrilldown } from '../../../lib/query/hooks/use-admin';
import { businessSubtypeLabel } from '../../../core/business/taxonomy';
import { text } from '../../../core/shared/text';
import {
  isDrillOverview,
  type AdminDrillOverview,
  type AdminDrillPage,
  type AdminDrillResource,
  type AdminUser,
} from '../../../app/admin';
import { toAppError } from '../../../app/errors';

const RESOURCE_OPTIONS: ReadonlyArray<{ value: AdminDrillResource; label: string }> = [
  { value: 'overview', label: 'Ringkasan' },
  { value: 'invoices', label: 'Invoice' },
  { value: 'customers', label: 'Customer' },
  { value: 'templates', label: 'Template' },
];

/**
 * Read-only drill-down into one user's data. Fetches per tab; the query is
 * disabled while the modal is closed so nothing leaks without an open dialog.
 */
export function AdminDrilldownModal({
  user,
  onClose,
}: {
  user: AdminUser | null;
  onClose: () => void;
}) {
  const [resource, setResource] = useState<AdminDrillResource>('overview');
  const userId = user?.userId ?? null;

  const query = useAdminUserDrilldown(userId, resource, user !== null);
  const pages = query.data?.pages ?? [];
  const overview = useMemo(
    () => pages.find((page): page is AdminDrillOverview => isDrillOverview(page)),
    [pages],
  );
  const listPage = useMemo(
    () => (resource === 'overview' ? null : (pages[0] as AdminDrillPage | undefined)),
    [pages, resource],
  );
  const rows = useMemo(() => pages.flatMap((page) => ('rows' in page ? page.rows : [])), [pages]);

  return (
    <Modal
      open={user !== null}
      onClose={onClose}
      size="xl"
      title={
        <>
          Detail user
          <span className="block text-sm font-normal text-muted">{user?.name || user?.email}</span>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <SegmentedControl<AdminDrillResource>
          value={resource}
          onChange={setResource}
          variant="accent"
          size="sm"
          ariaLabel="Jenis data user"
          options={RESOURCE_OPTIONS}
        />

        {query.isError && rows.length === 0 ? (
          <ErrorState
            title="Gagal memuat data"
            message={toAppError(query.error).message}
            action={
              <Button
                variant="secondary"
                size="sm"
                loading={query.isFetching}
                onClick={() => void query.refetch()}
              >
                Coba lagi
              </Button>
            }
          />
        ) : resource === 'overview' ? (
          overview ? (
            <OverviewPanel overview={overview} />
          ) : (
            <LoadingState label="Memuat ringkasan…" />
          )
        ) : rows.length === 0 && query.isFetching ? (
          <LoadingState label="Memuat data…" />
        ) : (
          <div className="flex flex-col gap-3">
            {listPage && (
              <p className="text-xs text-muted">
                {rows.length} dari {listPage.total} data
              </p>
            )}
            <ResourceTable resource={resource} rows={rows} />
            <LoadMore
              hasNextPage={query.hasNextPage}
              isFetchingNextPage={query.isFetchingNextPage}
              fetchNextPage={() => void query.fetchNextPage()}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

function OverviewPanel({ overview }: { overview: AdminDrillOverview }) {
  const { user, counts } = overview;
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
        <Field label="Email login" value={user.email} />
        <Field label="Status" value={user.status ? 'Aktif' : 'Dinonaktifkan'} />
        <Field label="Plan" value={user.plan} />
        <Field
          label="Berlaku sampai"
          value={
            user.planExpiresAt ? new Date(user.planExpiresAt).toLocaleDateString('id-ID') : '—'
          }
        />
        <Field label="Daftar" value={new Date(user.createdAt).toLocaleDateString('id-ID')} />
        <Field label="Nama usaha" value={user.businessName || '—'} />
        <Field label="Jenis bisnis" value={businessSubtypeLabel(user.businessType) || '—'} />
        <Field label="WhatsApp" value={user.phone || '—'} />
        <Field label="Email bisnis" value={user.profileEmail || '—'} />
        <Field label="Alamat" value={user.address || '—'} />
      </dl>
      <div className="flex flex-wrap gap-2">
        <Badge variant="neutral">Invoice: {counts.invoices}</Badge>
        <Badge variant="neutral">Customer: {counts.customers}</Badge>
        <Badge variant="neutral">Template: {counts.templates}</Badge>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}

function ResourceTable({
  resource,
  rows,
}: {
  resource: 'invoices' | 'customers' | 'templates';
  rows: Array<Record<string, unknown> & { id: string }>;
}) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">Belum ada data.</p>;
  }

  if (resource === 'invoices') {
    return (
      <TableShell minWidth="520px">
        <thead>
          <tr className={THEAD_ROW}>
            <Th>No. Invoice</Th>
            <Th>Customer</Th>
            <Th>Status</Th>
            <Th>Tanggal</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={TBODY_ROW}>
              <Td className="font-mono text-xs">{text(row.invoiceNumber ?? '—')}</Td>
              <Td>{text(row.customerName ?? '—')}</Td>
              <Td>
                <Badge
                  variant={
                    row.status === 'paid' ? 'success' : row.status === 'void' ? 'danger' : 'neutral'
                  }
                >
                  {text(row.status ?? '—')}
                </Badge>
              </Td>
              <Td className="text-muted">
                {row.date ? new Date(text(row.date)).toLocaleDateString('id-ID') : '—'}
              </Td>
            </tr>
          ))}
        </tbody>
      </TableShell>
    );
  }

  if (resource === 'customers') {
    return (
      <TableShell minWidth="480px">
        <thead>
          <tr className={THEAD_ROW}>
            <Th>Nama</Th>
            <Th>WhatsApp</Th>
            <Th>Email</Th>
            <Th>Dipakai</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={TBODY_ROW}>
              <Td>{text(row.name ?? '—')}</Td>
              <Td className="text-muted">{text(row.phone ?? '—')}</Td>
              <Td className="text-muted">{text(row.email ?? '—')}</Td>
              <Td className="text-muted">
                {row.lastUsedAt ? new Date(text(row.lastUsedAt)).toLocaleDateString('id-ID') : '—'}
              </Td>
            </tr>
          ))}
        </tbody>
      </TableShell>
    );
  }

  return (
    <TableShell minWidth="280px">
      <thead>
        <tr className={THEAD_ROW}>
          <Th>Nama template</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className={TBODY_ROW}>
            <Td>{text(row.name ?? '—')}</Td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}
