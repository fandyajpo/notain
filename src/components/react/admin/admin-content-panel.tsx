import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  FileText,
  Layers,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  UserRound,
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { LoadMore } from '../ui/load-more';
import { Modal } from '../ui/modal';
import { Notice } from '../ui/notice';
import { SearchField } from '../ui/search-field';
import { SegmentedControl } from '../ui/segmented';
import { Select, type SelectOption } from '../ui/select';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';
import { StatusBadge } from '../ui/status-badge';
import { TableShell, Th, Td, TBODY_ROW, THEAD_ROW } from '../ui/table';
import { Textarea } from '../ui/textarea';
import { FieldShell } from '../ui/field';
import { StatusSelect } from '../ui/status-select';
import { toast } from '../../../lib/ui/toast';
import {
  useAdminInvoiceDetail,
  useAdminInvoices,
  useAdminNextInvoiceNumber,
  useAdminTemplateDetail,
  useAdminTemplates,
  useAdminUsers,
  useCreateAdminInvoice,
  useCreateAdminTemplate,
  useDeleteAdminContent,
  useUpdateAdminInvoice,
  useUpdateAdminTemplate,
} from '../../../lib/query/hooks/use-admin';
import { toAppError } from '../../../app/errors';
import type {
  AdminContentResource,
  AdminInvoiceDetail,
  AdminInvoiceRow,
  AdminTemplateDetail,
  AdminTemplateRow,
  AdminUser,
} from '../../../app/admin';
import {
  INVOICE_STATUS_LABELS,
  UNSET_STATUS_LABEL,
  type InvoiceAdjustment,
  type InvoiceDraft,
  type InvoiceItem,
  type InvoiceStatus,
} from '../../../core/invoice/model';
import { invoiceDraftSchema } from '../../../core/invoice/schema';
import { invoiceContentFingerprint } from '../../../core/invoice/fingerprint';
import { repairInvoiceContent } from '../../../core/invoice/repair';
import { canChangeStatus, statusFlowMessage } from '../../../core/invoice/status';
import { invoiceTemplateSchema } from '../../../core/template/schema';
import { repairTemplateContent } from '../../../core/template/repair';
import {
  BUILTIN_TEMPLATES,
  getBuiltinTemplate,
  type BuiltinTemplateId,
} from '../../../core/template/builtins';
import { defaultsForBusiness } from '../../../core/template/seed';
import type { AuthoredTemplate } from '../../../core/template/model';
import { businessSubtypeLabel } from '../../../core/business/taxonomy';
import { getDetailFields } from '../../../core/business/detail-fields';
import { formatTanggal, todayIsoDate } from '../../../core/shared/dates';
import { ItemsGrid } from '../invoice/items-grid';
import { TotalsPanel } from '../invoice/totals-panel';
import { LazyRichEditor } from '../invoice/lazy-rich-editor';
import { DetailFieldsCard } from '../invoice/detail-fields-card';
import { BusinessTypeField } from '../business/business-type-field';
import { BlockList } from '../template/block-list';
import { ThemeForm } from '../template/theme-form';
import { DefaultsForm } from '../template/defaults-form';

const PLAN_VARIANTS: Record<string, 'neutral' | 'accent' | 'warning'> = {
  free: 'neutral',
  pro: 'accent',
  business: 'warning',
};

const PLAN_LABELS: Record<string, string> = { free: 'Free', pro: 'Pro', business: 'Business' };

/** A brand-new invoice may start at any state — no lifecycle to respect yet. */
const STATUS_OPTIONS: SelectOption[] = [
  { value: '', label: UNSET_STATUS_LABEL },
  ...(['sent', 'paid', 'void'] as const).map((value) => ({
    value,
    label: INVOICE_STATUS_LABELS[value],
  })),
];

type SchemaIssues = ReadonlyArray<{
  readonly path: readonly PropertyKey[];
  readonly message: string;
}>;

/**
 * Zod issues keyed by the path the form binds, joined with dots so the key is
 * what the shared components already read: `discount.value` reaches the
 * totals panel, `date` reaches its `FieldShell`.
 *
 * The item grid is one island with a single message slot, so every
 * `items.<n>.<field>` issue collapses into `items`. Distinct messages are
 * joined rather than first-wins: fixing one row must not hide the next.
 */
function fieldErrors(issues: SchemaIssues): Record<string, string> {
  const errors: Record<string, string> = {};
  const itemMessages = new Set<string>();
  for (const issue of issues) {
    const path = issue.path.map(String);
    if (path[0] === 'items') {
      itemMessages.add(issue.message);
      continue;
    }
    const key = path.join('.');
    if (key && !(key in errors)) errors[key] = issue.message;
  }
  if (itemMessages.size > 0) errors.items = [...itemMessages].join('; ');
  return errors;
}

/** Prefixes with no input of their own: rich text, business details, status. */
const UNBOUND_PREFIXES = ['sections', 'details', 'status'];

/**
 * A failed save must say *why* even when the offending field has nowhere to
 * render — a too-long kop, a stale detail value, an illegal status step. The
 * first one wins; the fields that do have a slot speak for themselves.
 */
function unboundError(errors: Record<string, string>): string | null {
  for (const [key, message] of Object.entries(errors)) {
    if (UNBOUND_PREFIXES.some((prefix) => key === prefix || key.startsWith(`${prefix}.`))) {
      return message;
    }
  }
  return null;
}

/**
 * The close guard behind Escape, backdrop and "Batal" on the three content
 * dialogs: these forms hold most of an invoice or a whole design, so closing
 * them is askable in a way that a page navigation is not. Rendered inside the
 * dialog it guards, so the nested surface rules in `Modal` keep applying —
 * Escape closes *this* confirm, never both.
 */
function DiscardChangesDialog({
  open,
  onKeep,
  onDiscard,
}: {
  open: boolean;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onKeep}
      role="alertdialog"
      size="sm"
      ariaLabelledBy="discard-title"
      title={<span id="discard-title">Tutup tanpa menyimpan?</span>}
      actions={[
        { label: 'Lanjut mengedit', variant: 'secondary', onClick: onKeep },
        { label: 'Tutup', variant: 'danger', onClick: onDiscard },
      ]}
    >
      <p className="text-sm text-muted">Perubahan yang belum disimpan akan hilang.</p>
    </Modal>
  );
}

/**
 * The "Konten pengguna" tab: pick one user, then read, create, edit and delete
 * that user's templates and invoices.
 *
 * Everything here is scoped to a *selected* user — the id travels on every
 * request and the server re-checks it against the row's owner, so this tab can
 * never write outside the account shown in the header.
 */
export function AdminContentPanel() {
  const { data, isFetching, hasNextPage, isFetchingNextPage, fetchNextPage, error, refetch } =
    useAdminUsers();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<AdminUser | null>(null);

  const users = useMemo(() => data?.pages.flatMap((page) => page.users) ?? [], [data]);
  const total = data?.pages[0]?.total ?? 0;

  // Client-side filter over the pages loaded so far, mirroring the Users tab.
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((user) =>
      [user.name, user.email, user.businessName].some((value) =>
        value.toLowerCase().includes(needle),
      ),
    );
  }, [users, query]);

  if (selected) {
    return <ContentWorkspace user={selected} onChangeUser={() => setSelected(null)} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {total > 0
            ? `${users.length} dari ${total} user dimuat`
            : 'Kelola template dan invoice milik satu user.'}
        </p>
        <Button
          variant="secondary"
          size="sm"
          loading={isFetching && !isFetchingNextPage}
          onClick={() => void refetch()}
        >
          <RefreshCw size={15} aria-hidden="true" />
          Muat ulang
        </Button>
      </div>

      {error && <Notice variant="danger">{toAppError(error).message}</Notice>}

      <SearchField
        value={query}
        placeholder="Cari nama, email, atau usaha…"
        aria-label="Cari user"
        onChange={setQuery}
      />

      {isFetching && users.length === 0 ? (
        <LoadingState label="Memuat user…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title={query ? 'User tidak ditemukan' : 'Belum ada user terdaftar'}
          description={query ? 'Coba kata kunci lain.' : undefined}
        />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {filtered.map((user) => (
            <li key={user.userId}>
              <button
                type="button"
                onClick={() => setSelected(user)}
                className="flex w-full items-center justify-between gap-3 rounded-control border border-border bg-card px-4 py-3 text-left shadow-card transition hover:border-accent/40 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {user.name || user.email}
                  </span>
                  <span className="block truncate text-xs text-muted">{user.email}</span>
                </span>
                <Badge variant={PLAN_VARIANTS[user.plan] ?? 'neutral'} size="sm">
                  {PLAN_LABELS[user.plan] ?? user.plan}
                </Badge>
              </button>
            </li>
          ))}
        </ul>
      )}

      <LoadMore
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        fetchNextPage={() => void fetchNextPage()}
      />
    </div>
  );
}

// --- Selected-user workspace ------------------------------------------------

function ContentWorkspace({ user, onChangeUser }: { user: AdminUser; onChangeUser: () => void }) {
  const [resource, setResource] = useState<AdminContentResource>('templates');
  const templates = useAdminTemplates(user.userId);
  const invoices = useAdminInvoices(user.userId);

  const createTemplate = useCreateAdminTemplate();
  const updateTemplate = useUpdateAdminTemplate();
  const createInvoice = useCreateAdminInvoice();
  const updateInvoice = useUpdateAdminInvoice();
  const removeRow = useDeleteAdminContent();

  const templateRows = useMemo(
    () => templates.data?.pages.flatMap((page) => page.rows) ?? [],
    [templates.data],
  );
  const invoiceRows = useMemo(
    () => invoices.data?.pages.flatMap((page) => page.rows) ?? [],
    [invoices.data],
  );

  // Create a template / edit one's whole design.
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<AdminTemplateRow | null>(null);
  // Create an invoice / edit one's whole content.
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<AdminInvoiceRow | null>(null);
  // One shared confirmation for both resources.
  const [deleting, setDeleting] = useState<{
    resource: AdminContentResource;
    rowId: string;
    label: string;
  } | null>(null);

  const activeCount = resource === 'templates' ? templateRows.length : invoiceRows.length;
  const activeIsFetching = resource === 'templates' ? templates.isFetching : invoices.isFetching;
  const refreshActive = () => {
    if (resource === 'templates') void templates.refetch();
    else void invoices.refetch();
  };

  async function handleDelete() {
    if (!deleting) return;
    try {
      await removeRow.mutateAsync({ userId: user.userId, ...deleting });
      toast('Data dihapus.', { variant: 'success' });
      setDeleting(null);
    } catch {
      // Surfaced via removeRow.error in the dialog.
    }
  }

  const deleteError = removeRow.error ? toAppError(removeRow.error).message : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onChangeUser}>
            <ArrowLeft size={15} aria-hidden="true" />
            Ganti user
          </Button>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {user.name || user.email}
            </p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <SegmentedControl<AdminContentResource>
            value={resource}
            onChange={setResource}
            variant="accent"
            size="sm"
            ariaLabel="Jenis konten"
            options={[
              { value: 'templates', label: 'Template' },
              { value: 'invoices', label: 'Invoice' },
            ]}
          />
          <Button
            variant="secondary"
            size="sm"
            loading={activeIsFetching && activeCount > 0}
            onClick={refreshActive}
          >
            <RefreshCw size={15} aria-hidden="true" />
            Muat ulang
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() =>
              resource === 'templates' ? setCreatingTemplate(true) : setCreatingInvoice(true)
            }
          >
            <Plus size={15} aria-hidden="true" />
            {resource === 'templates' ? 'Tambah template' : 'Tambah invoice'}
          </Button>
        </div>
      </div>

      <Notice variant="accent">
        Konten di tab ini dibuat, diubah, dan dihapus atas nama {user.email}. Setiap aksi tercatat
        di log aktivitas.
      </Notice>

      {resource === 'templates' ? (
        <TemplateList
          rows={templateRows}
          isLoading={templates.isFetching && templateRows.length === 0}
          error={templates.error ? toAppError(templates.error).message : null}
          onReload={() => void templates.refetch()}
          onEdit={setEditingTemplate}
          onDelete={(row) =>
            setDeleting({ resource: 'templates', rowId: row.id, label: `Template “${row.name}”` })
          }
          loadMore={
            <LoadMore
              hasNextPage={templates.hasNextPage}
              isFetchingNextPage={templates.isFetchingNextPage}
              fetchNextPage={() => void templates.fetchNextPage()}
            />
          }
        />
      ) : (
        <InvoiceList
          rows={invoiceRows}
          isLoading={invoices.isFetching && invoiceRows.length === 0}
          error={invoices.error ? toAppError(invoices.error).message : null}
          onReload={() => void invoices.refetch()}
          onEdit={setEditingInvoice}
          onDelete={(row) =>
            setDeleting({
              resource: 'invoices',
              rowId: row.id,
              label: `Invoice ${row.invoiceNumber || '(tanpa nomor)'}`,
            })
          }
          loadMore={
            <LoadMore
              hasNextPage={invoices.hasNextPage}
              isFetchingNextPage={invoices.isFetchingNextPage}
              fetchNextPage={() => void invoices.fetchNextPage()}
            />
          }
        />
      )}

      {creatingTemplate && (
        <TemplateCreateModal
          isPending={createTemplate.isPending}
          errorMessage={createTemplate.error ? toAppError(createTemplate.error).message : null}
          onClose={() => setCreatingTemplate(false)}
          onSubmit={(values) =>
            createTemplate
              .mutateAsync({ userId: user.userId, ...values })
              .then(() => {
                toast(`Template “${values.name}” ditambahkan.`, { variant: 'success' });
                setCreatingTemplate(false);
              })
              .catch(() => {
                // Surfaced in the modal.
              })
          }
        />
      )}

      {editingTemplate && (
        <TemplateEditModal
          userId={user.userId}
          row={editingTemplate}
          isPending={updateTemplate.isPending}
          errorMessage={updateTemplate.error ? toAppError(updateTemplate.error).message : null}
          onClose={() => setEditingTemplate(null)}
          onSubmit={(template) =>
            updateTemplate
              .mutateAsync({
                userId: user.userId,
                rowId: editingTemplate.id,
                template,
                // The list's `updatedAt` is the version this dialog opened
                // with; a mismatch server-side means the owner (or another
                // tab) saved in between and this save must not clobber it.
                expectedUpdatedAt: editingTemplate.updatedAt,
              })
              .then(() => {
                toast('Template diperbarui.', { variant: 'success' });
                setEditingTemplate(null);
              })
              .catch(() => {
                // Surfaced in the modal.
              })
          }
        />
      )}

      {creatingInvoice && (
        <InvoiceFormModal
          mode="create"
          userId={user.userId}
          targetEmail={user.email}
          userBusinessType={user.businessType || null}
          templateRows={templateRows}
          isPending={createInvoice.isPending}
          errorMessage={createInvoice.error ? toAppError(createInvoice.error).message : null}
          onClose={() => setCreatingInvoice(false)}
          onSubmit={({ draft }) =>
            createInvoice
              .mutateAsync({ userId: user.userId, draft })
              .then(() => {
                toast(`Invoice ${draft.invoiceNumber} dibuat.`, { variant: 'success' });
                setCreatingInvoice(false);
              })
              .catch(() => {
                // Surfaced in the modal.
              })
          }
        />
      )}

      {editingInvoice && (
        <InvoiceFormModal
          mode="edit"
          userId={user.userId}
          row={editingInvoice}
          targetEmail={user.email}
          userBusinessType={user.businessType || null}
          templateRows={templateRows}
          isPending={updateInvoice.isPending}
          errorMessage={updateInvoice.error ? toAppError(updateInvoice.error).message : null}
          onClose={() => setEditingInvoice(null)}
          onSubmit={({ draft, status, expectedContentHash }) =>
            updateInvoice
              .mutateAsync({
                userId: user.userId,
                rowId: editingInvoice.id,
                draft,
                status,
                expectedContentHash,
              })
              .then(() => {
                toast('Invoice diperbarui.', { variant: 'success' });
                setEditingInvoice(null);
              })
              .catch(() => {
                // Surfaced in the modal.
              })
          }
        />
      )}

      {deleting && (
        <Modal
          open
          onClose={() => setDeleting(null)}
          role="alertdialog"
          size="sm"
          ariaLabelledBy="delete-title"
          title={<span id="delete-title">Hapus data?</span>}
          actions={[
            { label: 'Batal', variant: 'secondary', onClick: () => setDeleting(null) },
            {
              label: 'Hapus',
              variant: 'danger',
              loading: removeRow.isPending,
              onClick: () => void handleDelete(),
            },
          ]}
        >
          {deleteError && <Notice variant="danger">{deleteError}</Notice>}
          <p className="text-sm text-muted">
            {deleting.label} akan dihapus dari akun{' '}
            <span className="font-medium text-foreground">{user.email}</span>. Tindakan ini tidak
            bisa dibatalkan.
          </p>
        </Modal>
      )}
    </div>
  );
}

// --- Tables -----------------------------------------------------------------

function ListStates({
  isLoading,
  error,
  onReload,
  title,
}: {
  isLoading: boolean;
  error: string | null;
  onReload: () => void;
  title: string;
}) {
  if (isLoading) return <LoadingState label="Memuat…" />;
  if (error) {
    return (
      <ErrorState
        title={title}
        message={error}
        action={
          <Button variant="secondary" size="sm" onClick={onReload}>
            Coba lagi
          </Button>
        }
      />
    );
  }
  // Callers only render this while loading or errored; a bare "try again"
  // keeps an unexpected empty render from pretending the list is fine.
  return (
    <ErrorState
      title={title}
      message="Belum ada data yang bisa dimuat."
      action={
        <Button variant="secondary" size="sm" onClick={onReload}>
          Muat ulang
        </Button>
      }
    />
  );
}

function TemplateList({
  rows,
  isLoading,
  error,
  onReload,
  onEdit,
  onDelete,
  loadMore,
}: {
  rows: AdminTemplateRow[];
  isLoading: boolean;
  error: string | null;
  onReload: () => void;
  onEdit: (row: AdminTemplateRow) => void;
  onDelete: (row: AdminTemplateRow) => void;
  loadMore: React.ReactNode;
}) {
  if (rows.length > 0) {
    return (
      <div className="flex flex-col gap-4">
        <TableShell minWidth="640px">
          <thead>
            <tr className={THEAD_ROW}>
              <Th>Nama template</Th>
              <Th>Jenis bisnis</Th>
              <Th>Diubah</Th>
              <Th align="right">Aksi</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={TBODY_ROW}>
                <Td className="font-medium">{row.name || '—'}</Td>
                <Td className="text-muted">{businessSubtypeLabel(row.businessType) ?? '—'}</Td>
                <Td className="whitespace-nowrap text-muted">
                  {row.updatedAt ? formatTanggal(row.updatedAt) : '—'}
                </Td>
                <Td align="right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(row)}
                      title="Edit template"
                    >
                      <Pencil size={14} aria-hidden="true" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger"
                      onClick={() => onDelete(row)}
                      title="Hapus template"
                    >
                      <Trash2 size={14} aria-hidden="true" />
                      Hapus
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
        {loadMore}
      </div>
    );
  }

  if (isLoading || error) {
    return (
      <ListStates
        isLoading={isLoading}
        error={error}
        onReload={onReload}
        title="Gagal memuat template"
      />
    );
  }

  return (
    <EmptyState
      icon={Layers}
      title="Belum ada template milik user ini"
      description="Template bawaan tetap tersedia. Tambah template untuk menyimpan desain milik mereka."
    />
  );
}

function InvoiceList({
  rows,
  isLoading,
  error,
  onReload,
  onEdit,
  onDelete,
  loadMore,
}: {
  rows: AdminInvoiceRow[];
  isLoading: boolean;
  error: string | null;
  onReload: () => void;
  onEdit: (row: AdminInvoiceRow) => void;
  onDelete: (row: AdminInvoiceRow) => void;
  loadMore: React.ReactNode;
}) {
  if (rows.length > 0) {
    return (
      <div className="flex flex-col gap-4">
        <TableShell minWidth="720px">
          <thead>
            <tr className={THEAD_ROW}>
              <Th>Nomor</Th>
              <Th>Customer</Th>
              <Th>Tanggal</Th>
              <Th>Status</Th>
              <Th align="right">Aksi</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={TBODY_ROW}>
                <Td className="font-mono text-xs">{row.invoiceNumber || '—'}</Td>
                <Td>{row.customerName || '—'}</Td>
                <Td className="whitespace-nowrap text-muted">
                  {row.date ? formatTanggal(row.date) : '—'}
                </Td>
                <Td>
                  <StatusBadge status={row.status} />
                </Td>
                <Td align="right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(row)}
                      title="Ubah invoice"
                    >
                      <Pencil size={14} aria-hidden="true" />
                      Ubah
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger"
                      onClick={() => onDelete(row)}
                      title="Hapus invoice"
                    >
                      <Trash2 size={14} aria-hidden="true" />
                      Hapus
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
        {loadMore}
      </div>
    );
  }

  if (isLoading || error) {
    return (
      <ListStates
        isLoading={isLoading}
        error={error}
        onReload={onReload}
        title="Gagal memuat invoice"
      />
    );
  }

  return (
    <EmptyState
      icon={FileText}
      title="Belum ada invoice milik user ini"
      description="Tambah invoice untuk membuat dokumen langsung di akun mereka."
    />
  );
}

// --- Template forms ----------------------------------------------------------

/**
 * A labelled block of fields. A `Card` here would be a card inside the
 * modal's own surface, so the heading stays a heading.
 */
function Group({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="text-xs text-muted">{description}</p>}
      </div>
      {children}
    </div>
  );
}

/**
 * Copies a built-in design into the selected user's library. The rest of the
 * design is edited afterwards through {@link TemplateEditModal}.
 */
function TemplateCreateModal({
  isPending,
  errorMessage,
  onClose,
  onSubmit,
}: {
  isPending: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmit: (values: { name: string; base: BuiltinTemplateId }) => void;
}) {
  const [name, setName] = useState('');
  const [base, setBase] = useState<BuiltinTemplateId>('classic');
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  // Copying a built-in is one click; anything typed or re-picked is a choice
  // worth confirming before the dialog disappears.
  const dirty = name.trim() !== '' || base !== 'classic';

  const close = () => {
    if (isPending) return;
    if (dirty) {
      setConfirmingDiscard(true);
      return;
    }
    onClose();
  };

  const baseOptions: SelectOption[] = BUILTIN_TEMPLATES.map((template) => ({
    value: template.id,
    label: template.name,
  }));

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError('Masukkan nama template.');
      return;
    }
    if (trimmed.length > 100) {
      setNameError('Nama terlalu panjang (maksimal 100 karakter).');
      return;
    }
    setNameError(undefined);
    onSubmit({ name: trimmed, base });
  };

  return (
    <Modal
      open
      onClose={close}
      size="sm"
      title="Tambah template"
      actions={[
        { label: 'Batal', variant: 'secondary', disabled: isPending, onClick: close },
        { label: 'Tambah', loading: isPending, onClick: submit },
      ]}
    >
      <div className="flex flex-col gap-4">
        {errorMessage && <Notice variant="danger">{errorMessage}</Notice>}

        <FieldShell label="Nama template" htmlFor="ac-template-name" required error={nameError}>
          <Input
            id="ac-template-name"
            type="text"
            value={name}
            invalid={Boolean(nameError)}
            placeholder="Contoh: Kop Resmi"
            onChange={(event) => {
              setName(event.target.value);
              if (nameError) setNameError(undefined);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submit();
              }
            }}
          />
        </FieldShell>

        <FieldShell
          label="Desain dasar"
          htmlFor="ac-template-base"
          hint="Template baru disalin dari desain ini, lalu bisa diedit lewat tombol Edit."
        >
          <Select
            id="ac-template-base"
            value={base}
            options={baseOptions}
            onChange={(value) => setBase(value as BuiltinTemplateId)}
          />
        </FieldShell>

        <DiscardChangesDialog
          open={confirmingDiscard}
          onKeep={() => setConfirmingDiscard(false)}
          onDiscard={onClose}
        />
      </div>
    </Modal>
  );
}

/** The five columns `invoiceTemplateSchema` validates, nothing more. */
function seedTemplateForm(detail: AdminTemplateDetail): AuthoredTemplate {
  return {
    name: detail.name,
    businessType: detail.businessType,
    layout: detail.layout,
    theme: detail.theme,
    defaults: detail.defaults,
  };
}

/**
 * The owner's template editor, pointed at someone else's row: name, trade,
 * blocks, colours and default prose — the same `invoiceTemplateSchema` the
 * save path in `/templates` runs, so an admin edit cannot store a design the
 * owner's own form would reject.
 *
 * The row's full content is fetched here rather than in the list (one request
 * per dialog, cached by row id), because layout and theme are most of a row
 * and the table never renders them.
 */
function TemplateEditModal({
  userId,
  row,
  isPending,
  errorMessage,
  onClose,
  onSubmit,
}: {
  userId: string;
  row: AdminTemplateRow;
  isPending: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmit: (template: AuthoredTemplate) => void;
}) {
  const detail = useAdminTemplateDetail(userId, row.id);
  const [values, setValues] = useState<AuthoredTemplate | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [repaired, setRepaired] = useState<string[]>([]);
  // Seeding is not an edit; every `patch` below is. Cheap to track this way
  // compared with comparing two full designs for equality.
  const editedRef = useRef(false);

  // Seed once, when the row arrives; a background refetch must not throw away
  // a half-edited design. A design that would fail `invoiceTemplateSchema`
  // (a duplicated block id, a hidden kop) is repaired on the way in — the
  // same treatment the invoice dialog gives a stale row.
  useEffect(() => {
    if (!detail.data || values) return;
    const { template, repaired: notes } = repairTemplateContent(seedTemplateForm(detail.data));
    setRepaired(notes);
    setValues(template);
  }, [detail.data, values]);

  const clearErrors = (keys: readonly string[]) => {
    setErrors((prev) => {
      const kept = Object.entries(prev).filter(
        ([key]) => !keys.some((dirty) => key === dirty || key.startsWith(`${dirty}.`)),
      );
      return kept.length === Object.keys(prev).length ? prev : Object.fromEntries(kept);
    });
  };

  const patch = (part: Partial<AuthoredTemplate>, dirtyKeys: readonly string[]) => {
    editedRef.current = true;
    setValues((prev) => (prev ? { ...prev, ...part } : prev));
    clearErrors(dirtyKeys);
  };

  /**
   * A saved design is most of a user's work, so Escape and "Batal" confirm
   * before discarding edits. Nested surfaces (the business-type picker, an
   * open menu) are already defused by `Modal` — Escape reaches this dialog
   * only once they are gone.
   */
  const close = () => {
    if (isPending) return;
    if (editedRef.current) {
      setConfirmingDiscard(true);
      return;
    }
    onClose();
  };

  const submit = () => {
    if (!values) return;
    const parsed = invoiceTemplateSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    onSubmit(parsed.data);
  };

  const banner = unboundError(errors);

  return (
    <Modal
      open
      onClose={close}
      size="xl"
      title={
        <>
          Edit template
          <span className="block text-sm font-normal text-muted">{row.name}</span>
        </>
      }
      actions={[
        { label: 'Batal', variant: 'secondary', disabled: isPending, onClick: close },
        { label: 'Simpan', loading: isPending, disabled: !values, onClick: submit },
      ]}
    >
      <div className="flex flex-col gap-5">
        {errorMessage && <Notice variant="danger">{errorMessage}</Notice>}
        {banner && <Notice variant="danger">{banner}</Notice>}
        {repaired.length > 0 && (
          <Notice variant="accent">
            Beberapa bagian desain tidak sesuai aturan saat ini dan sudah dirapikan. Periksa blok
            dan warnanya sebelum menyimpan.
          </Notice>
        )}

        {!values ? (
          detail.error ? (
            <ErrorState
              title="Template gagal dimuat"
              message={toAppError(detail.error).message}
              action={
                <Button variant="secondary" size="sm" onClick={() => void detail.refetch()}>
                  Coba lagi
                </Button>
              }
            />
          ) : (
            <LoadingState label="Memuat template…" />
          )
        ) : (
          <>
            <FieldShell
              label="Nama template"
              htmlFor="ac-template-name"
              required
              error={errors.name}
            >
              <Input
                id="ac-template-name"
                type="text"
                value={values.name}
                invalid={Boolean(errors.name)}
                onChange={(event) => patch({ name: event.target.value }, ['name'])}
              />
            </FieldShell>

            <BusinessTypeField
              value={values.businessType}
              onChange={(slug) => {
                if (slug === values.businessType) return;
                // Switching trades re-seeds the prose with the new trade's
                // example, exactly as the owner's editor does; name, colours
                // and block order stay put.
                patch({ businessType: slug, defaults: defaultsForBusiness(slug) }, [
                  'businessType',
                  'defaults',
                ]);
              }}
            />

            <Group
              title="Blok invoice"
              description="Seret barisnya, atau pakai tombol panah, untuk mengubah urutan."
            >
              <BlockList
                layout={values.layout}
                onChange={(layout) => patch({ layout }, ['layout'])}
              />
            </Group>

            <Group title="Warna & gaya" description="Warna ini yang bikin template terasa beda.">
              <ThemeForm theme={values.theme} onChange={(theme) => patch({ theme }, ['theme'])} />
            </Group>

            <Group
              title="Teks default"
              description="Ditulis ke invoice begitu template ini dipakai. Masih bisa diubah sesudahnya."
            >
              <DefaultsForm
                defaults={values.defaults}
                onChange={(defaults) => patch({ defaults }, ['defaults'])}
              />
            </Group>
          </>
        )}

        <DiscardChangesDialog
          open={confirmingDiscard}
          onKeep={() => setConfirmingDiscard(false)}
          onDiscard={onClose}
        />
      </div>
    </Modal>
  );
}

// --- Invoice form -----------------------------------------------------------

type InvoiceFormState = {
  invoiceNumber: string;
  date: string;
  dueDate: string;
  templateId: string;
  status: InvoiceStatus | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  items: InvoiceItem[];
  discount: InvoiceAdjustment;
  tax: InvoiceAdjustment;
  sections: { header: string; content: string; footer: string };
  details: Record<string, string>;
  notes: string;
};

function invoiceFormDefaults(): InvoiceFormState {
  return {
    invoiceNumber: '',
    date: todayIsoDate(),
    dueDate: '',
    templateId: '',
    status: null,
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    items: [],
    discount: { type: 'amount', value: 0 },
    tax: { type: 'percent', value: 0 },
    sections: { header: '', content: '', footer: '' },
    details: {},
    notes: '',
  };
}

/**
 * Full content back out of a stored row. Every nested collection is copied so
 * editing never mutates the cached response the dialog read from.
 */
function seedInvoiceForm(detail: AdminInvoiceDetail): InvoiceFormState {
  return {
    invoiceNumber: detail.invoiceNumber,
    date: detail.date,
    dueDate: detail.dueDate ?? '',
    templateId: detail.templateId ?? '',
    status: detail.status,
    customerName: detail.customerName,
    customerPhone: detail.customerPhone ?? '',
    customerEmail: detail.customerEmail ?? '',
    items: detail.items.map((item) => ({ ...item })),
    discount: { ...detail.discount },
    tax: { ...detail.tax },
    sections: {
      header: detail.sections.header ?? '',
      content: detail.sections.content ?? '',
      footer: detail.sections.footer ?? '',
    },
    details: { ...detail.details },
    notes: detail.notes ?? '',
  };
}

/** Blank strings collapse to absent optionals, the same way the builder does it. */
function formToDraft(form: InvoiceFormState): InvoiceDraft {
  return {
    invoiceNumber: form.invoiceNumber.trim(),
    date: form.date,
    dueDate: form.dueDate || undefined,
    templateId: form.templateId || undefined,
    status: form.status,
    customerName: form.customerName.trim(),
    customerPhone: form.customerPhone.trim() || undefined,
    customerEmail: form.customerEmail.trim() || undefined,
    items: form.items,
    discount: form.discount,
    tax: form.tax,
    sections: form.sections,
    details: form.details,
    notes: form.notes.trim() || undefined,
  };
}

/**
 * The trade whose extra fields the detail card should show — the same
 * `template business type, else the account's own` rule the invoice builder
 * applies. Built-ins carry no type, and a saved template the list has not
 * paged in yet is simply unknown, so both fall back rather than dropping the
 * section.
 */
function detailBusinessTypeFor(
  templateId: string,
  owned: readonly AdminTemplateRow[],
  fallback: string | null,
): string | null {
  if (!templateId) return fallback;
  const match = owned.find((template) => template.id === templateId);
  return match?.businessType ?? getBuiltinTemplate(templateId)?.businessType ?? fallback;
}

/**
 * Create and edit share one form, because the two must not drift: line items,
 * totals, the three rich-text zones, business details and notes are edited
 * exactly the same way whether the row exists yet or not.
 *
 * `edit` reads the row's full content first (the list carries only the
 * columns a table shows) and writes it back as a complete draft — the content
 * half of which is deliberately the same `draftToRowUpdateData` write the app
 * uses, so it cannot touch the status lifecycle. The status pill itself only
 * ever offers forward steps, and the endpoint re-checks both halves.
 */
function InvoiceFormModal({
  mode,
  userId,
  row,
  targetEmail,
  userBusinessType,
  templateRows,
  isPending,
  errorMessage,
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'edit';
  userId: string;
  row?: AdminInvoiceRow;
  targetEmail: string;
  /** The selected account's own trade, used when the invoice names no template. */
  userBusinessType: string | null;
  templateRows: AdminTemplateRow[];
  isPending: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmit: (result: {
    draft: InvoiceDraft;
    status: InvoiceStatus | null;
    /** Present on edit: the server refuses the save when the row moved on. */
    expectedContentHash?: string;
  }) => void;
}) {
  const isEdit = mode === 'edit';
  const detail = useAdminInvoiceDetail(row ? userId : null, row?.id ?? null);
  const nextNumber = useAdminNextInvoiceNumber(isEdit ? null : userId);
  const [form, setForm] = useState<InvoiceFormState | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [repaired, setRepaired] = useState<string[]>([]);
  // Seeding is not an edit; every `set` below is.
  const editedRef = useRef(false);
  // The detail as the server returned it — the *baseline* the concurrency
  // fingerprint is computed from. Never the live form: hashing what the user
  // is typing would only ever agree with itself.
  const seedRef = useRef<AdminInvoiceDetail | null>(null);

  // Seed once the row lands; a later refetch keeps whatever is being typed.
  // Create waits for the server's next free number so an admin never has to
  // invent one — a failed read there still opens the form, just with the
  // field to fill in by hand.
  useEffect(() => {
    if (form) return;
    if (isEdit) {
      if (detail.data) {
        // The fingerprint baseline stays the *raw* server content — the server
        // hashes the stored row, not the repaired copy on screen.
        seedRef.current = detail.data;
        const { draft, repaired: notes } = repairInvoiceContent(seedInvoiceForm(detail.data));
        setRepaired(notes);
        setForm(draft);
      }
      return;
    }
    if (nextNumber.data || nextNumber.isError) {
      setForm({ ...invoiceFormDefaults(), invoiceNumber: nextNumber.data?.invoiceNumber ?? '' });
    }
  }, [detail.data, form, isEdit, nextNumber.data, nextNumber.isError]);

  const clearErrors = (key: string) => {
    setErrors((prev) => {
      const kept = Object.entries(prev).filter(
        ([errorKey]) => errorKey !== key && !errorKey.startsWith(`${key}.`),
      );
      return kept.length === Object.keys(prev).length ? prev : Object.fromEntries(kept);
    });
  };

  const set = <K extends keyof InvoiceFormState>(key: K, value: InvoiceFormState[K]) => {
    editedRef.current = true;
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    clearErrors(key);
  };

  /**
   * Most of an invoice lives in this form, so Escape and "Batal" confirm
   * before discarding it. Nested surfaces (an open menu, the business-type
   * picker) are already defused by `Modal`, which only hands Escape to this
   * dialog once they are gone.
   */
  const close = () => {
    if (isPending) return;
    if (editedRef.current) {
      setConfirmingDiscard(true);
      return;
    }
    onClose();
  };

  const submit = async () => {
    if (!form) return;
    const parsed = invoiceDraftSchema.safeParse(formToDraft(form));
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    // The lifecycle guard the status pill already enforces, stated once more
    // against the status the row was read with. The endpoint is the authority:
    // a stale row still ends in a 409 rather than a rewound status.
    if (row) {
      const stored = detail.data?.status ?? row.status;
      const next = parsed.data.status ?? null;
      if (!canChangeStatus(stored, next)) {
        setErrors({ status: statusFlowMessage(stored, next) });
        return;
      }
    }
    setErrors({});
    // Hashed at submit rather than when the row landed: `crypto.subtle` is
    // async, and hashing the baseline here leaves no window for the resolve
    // to race the first keystroke. Create has no baseline to compare.
    const expectedContentHash =
      isEdit && seedRef.current ? await invoiceContentFingerprint(seedRef.current) : undefined;
    onSubmit({ draft: parsed.data, status: parsed.data.status ?? null, expectedContentHash });
  };

  const banner = unboundError(errors);

  const templateOptions: SelectOption[] = [
    { value: '', label: 'Tanpa template (desain bawaan)' },
    ...BUILTIN_TEMPLATES.map((template) => ({ value: template.id, label: template.name })),
    ...templateRows.map((template) => ({
      value: template.id,
      label: template.name || template.id,
    })),
  ];

  /**
   * An invoice can name a saved template the list has not paged in yet — or
   * one that has since been deleted. Reading that single row keeps the select
   * honest (a value with no option renders as a blank field) and keeps the
   * detail card on the right trade, instead of quietly implying the invoice
   * carries no template at all.
   */
  const activeTemplateId = form?.templateId ?? '';
  const activeTemplateListed =
    activeTemplateId !== '' && templateOptions.some((option) => option.value === activeTemplateId);
  const unlistedTemplateId =
    activeTemplateId !== '' && !activeTemplateListed ? activeTemplateId : null;
  const unlistedTemplate = useAdminTemplateDetail(
    unlistedTemplateId && row ? userId : null,
    unlistedTemplateId,
  );

  const selectOptions: SelectOption[] = unlistedTemplateId
    ? [
        ...templateOptions,
        {
          value: unlistedTemplateId,
          label: unlistedTemplate.data?.name
            ? unlistedTemplate.data.name
            : unlistedTemplate.isError
              ? 'Template sudah dihapus'
              : 'Memuat template…',
        },
      ]
    : templateOptions;

  const detailFields = form
    ? getDetailFields(
        unlistedTemplateId
          ? (unlistedTemplate.data?.businessType ?? userBusinessType)
          : detailBusinessTypeFor(activeTemplateId, templateRows, userBusinessType),
      )
    : [];

  return (
    <Modal
      open
      onClose={close}
      size="xl"
      title={
        isEdit ? (
          <>
            Ubah invoice
            <span className="block text-sm font-normal text-muted">
              {row?.invoiceNumber || targetEmail}
            </span>
          </>
        ) : (
          'Tambah invoice'
        )
      }
      actions={[
        { label: 'Batal', variant: 'secondary', disabled: isPending, onClick: close },
        {
          label: isEdit ? 'Simpan perubahan' : 'Buat invoice',
          loading: isPending,
          disabled: !form,
          onClick: submit,
        },
      ]}
    >
      <div className="flex flex-col gap-5">
        {errorMessage && <Notice variant="danger">{errorMessage}</Notice>}
        {banner && <Notice variant="danger">{banner}</Notice>}
        {repaired.length > 0 && (
          <Notice variant="accent">
            Beberapa data lama tidak sesuai aturan saat ini dan sudah dirapikan. Periksa isinya
            sebelum menyimpan.
          </Notice>
        )}

        {!form ? (
          isEdit ? (
            detail.error ? (
              <ErrorState
                title="Invoice gagal dimuat"
                message={toAppError(detail.error).message}
                action={
                  <Button variant="secondary" size="sm" onClick={() => void detail.refetch()}>
                    Coba lagi
                  </Button>
                }
              />
            ) : (
              <LoadingState label="Memuat invoice…" />
            )
          ) : (
            <LoadingState label="Menyiapkan nomor invoice…" />
          )
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FieldShell
                label="Nomor invoice"
                htmlFor="ac-inv-number"
                required
                error={errors.invoiceNumber}
              >
                <Input
                  id="ac-inv-number"
                  type="text"
                  value={form.invoiceNumber}
                  invalid={Boolean(errors.invoiceNumber)}
                  placeholder="INV-2026-001"
                  onChange={(event) => set('invoiceNumber', event.target.value)}
                />
              </FieldShell>

              <FieldShell
                label="Template"
                htmlFor="ac-inv-template"
                hint="Desain yang dipakai dokumen ini."
                error={errors.templateId}
              >
                <Select
                  id="ac-inv-template"
                  value={form.templateId}
                  options={selectOptions}
                  invalid={Boolean(errors.templateId)}
                  onChange={(value) => set('templateId', value)}
                />
              </FieldShell>

              <FieldShell
                label="Tanggal invoice"
                htmlFor="ac-inv-date"
                required
                error={errors.date}
              >
                <Input
                  id="ac-inv-date"
                  type="date"
                  value={form.date}
                  invalid={Boolean(errors.date)}
                  onChange={(event) => set('date', event.target.value)}
                />
              </FieldShell>

              <FieldShell label="Jatuh tempo" htmlFor="ac-inv-due" error={errors.dueDate}>
                <Input
                  id="ac-inv-due"
                  type="date"
                  value={form.dueDate}
                  invalid={Boolean(errors.dueDate)}
                  onChange={(event) => set('dueDate', event.target.value)}
                />
              </FieldShell>

              <FieldShell
                label="Nama pelanggan"
                htmlFor="ac-inv-customer"
                required
                error={errors.customerName}
              >
                <Input
                  id="ac-inv-customer"
                  type="text"
                  value={form.customerName}
                  invalid={Boolean(errors.customerName)}
                  onChange={(event) => set('customerName', event.target.value)}
                />
              </FieldShell>

              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">Status</span>
                {isEdit ? (
                  <StatusSelect
                    value={form.status}
                    label={`Status invoice ${form.invoiceNumber}`}
                    onChange={(status) => set('status', status)}
                  />
                ) : (
                  <Select
                    id="ac-inv-status"
                    value={form.status ?? ''}
                    options={STATUS_OPTIONS}
                    onChange={(value) => set('status', (value || null) as InvoiceStatus | null)}
                  />
                )}
                <p className="text-xs text-muted">
                  {isEdit
                    ? 'Status hanya bergerak maju — langkah mundur tidak ditawarkan.'
                    : 'Status awal; aturan berlaku begitu invoice diubah lagi.'}
                </p>
              </div>

              <FieldShell
                label="Nomor WhatsApp"
                htmlFor="ac-inv-phone"
                error={errors.customerPhone}
              >
                <Input
                  id="ac-inv-phone"
                  type="tel"
                  value={form.customerPhone}
                  invalid={Boolean(errors.customerPhone)}
                  placeholder="081234567890"
                  onChange={(event) => set('customerPhone', event.target.value)}
                />
              </FieldShell>

              <FieldShell
                label="Email pelanggan"
                htmlFor="ac-inv-email"
                error={errors.customerEmail}
              >
                <Input
                  id="ac-inv-email"
                  type="email"
                  value={form.customerEmail}
                  invalid={Boolean(errors.customerEmail)}
                  onChange={(event) => set('customerEmail', event.target.value)}
                />
              </FieldShell>
            </div>

            <Group title="Barang" description="Satu baris per barang yang ditagihkan.">
              <ItemsGrid
                items={form.items}
                onChange={(items) => set('items', items)}
                errors={errors}
              />
            </Group>

            <Group title="Ringkasan">
              <TotalsPanel
                items={form.items}
                discount={form.discount}
                tax={form.tax}
                onDiscountChange={(adjustment) => set('discount', adjustment)}
                onTaxChange={(adjustment) => set('tax', adjustment)}
                errors={errors}
              />
            </Group>

            <Group title="Isi invoice" description="Teks ini tercetak pada dokumen.">
              <div className="flex flex-col gap-4">
                <LazyRichEditor
                  label="Kop & informasi invoice"
                  value={form.sections.header}
                  onChange={(html) => set('sections', { ...form.sections, header: html })}
                />
                <LazyRichEditor
                  label="Bagian isi (di tengah)"
                  value={form.sections.content}
                  onChange={(html) => set('sections', { ...form.sections, content: html })}
                />
                <LazyRichEditor
                  label="Bagian bawah (footer)"
                  value={form.sections.footer}
                  onChange={(html) => set('sections', { ...form.sections, footer: html })}
                />
              </div>
            </Group>

            <DetailFieldsCard
              fields={detailFields}
              values={form.details}
              onChange={(details) => set('details', details)}
            />

            <FieldShell label="Catatan" htmlFor="ac-inv-notes" error={errors.notes}>
              <Textarea
                id="ac-inv-notes"
                value={form.notes}
                invalid={Boolean(errors.notes)}
                rows={3}
                onChange={(event) => set('notes', event.target.value)}
              />
            </FieldShell>
          </>
        )}

        <DiscardChangesDialog
          open={confirmingDiscard}
          onKeep={() => setConfirmingDiscard(false)}
          onDiscard={onClose}
        />
      </div>
    </Modal>
  );
}
