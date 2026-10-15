import { ArrowRight, Banknote, Ban, FileText, LayoutTemplate, Plus, Send, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AuthGate } from '../auth/auth-gate';
import { AppProviders } from '../providers';
import { IslandBoundary } from '../ui/island-boundary';
import { Button } from '../ui/button';
import { Card, cardClass } from '../ui/card';
import { PageHeader } from '../ui/page-header';
import { StatusBadge } from '../ui/status-badge';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';
import { SetupChecklist } from './setup-checklist';
import { calculateTotals } from '../../../core/invoice/calculator';
import { formatRupiah } from '../../../core/shared/money';
import { formatTanggalRelatif, formatWaktuLalu } from '../../../core/shared/dates';
import type { DashboardStats } from '../../../core/stats/model';
import type { InvoiceStatus } from '../../../core/invoice/model';
import { useProfile } from '../../../lib/query/hooks/use-profile';
import { useSession } from '../../../lib/query/hooks/use-session';
import { useDashboardStats } from '../../../lib/query/hooks/use-dashboard-stats';
import { useInvoices } from '../../../lib/query/hooks/use-invoices';
import { usePageTour } from '../../../lib/tour/use-tour';
import { cx } from '../../../lib/ui/classes';
import {
  TABLE,
  TABLE_SHELL,
  TBODY_ROW,
  THEAD_ROW,
  tdClass,
  thClass,
} from '../ui/table';
import type { Invoice } from '../../../core/invoice/model';

/**
 * How many recent invoices the dashboard previews before linking onward.
 *
 * Doubles as the page size for the one invoice query the dashboard makes, so
 * it ships six rows instead of the table's full hundred.
 */
const RECENT_PREVIEW = 6;

type KpiTone = 'accent' | 'neutral' | 'success' | 'danger';

/** Icon tints — the same semantics as the status badges below. */
const KPI_TONE_CLASS: Record<KpiTone, string> = {
  accent: 'bg-accent-soft text-accent',
  neutral: 'border border-border bg-background text-muted',
  success: 'bg-success-soft text-success',
  danger: 'bg-danger-soft text-danger',
};

/** The six headline numbers, in the order they are shown. */
const KPIS: Array<{
  key: string;
  label: string;
  Icon: LucideIcon;
  tone: KpiTone;
  pick: (stats: DashboardStats) => number;
}> = [
  { key: 'total', label: 'Total faktur', Icon: FileText, tone: 'accent', pick: (s) => s.totalInvoices },
  { key: 'sent', label: 'Terkirim', Icon: Send, tone: 'neutral', pick: (s) => s.sentCount },
  { key: 'paid', label: 'Lunas', Icon: Banknote, tone: 'success', pick: (s) => s.paidCount },
  { key: 'void', label: 'Batal', Icon: Ban, tone: 'danger', pick: (s) => s.voidCount },
  { key: 'customers', label: 'Customer', Icon: Users, tone: 'accent', pick: (s) => s.totalCustomers },
  { key: 'templates', label: 'Template', Icon: LayoutTemplate, tone: 'accent', pick: (s) => s.totalTemplates },
];

/** Status rows of the breakdown table, with their progress-bar tint. */
const STATUS_ROWS: Array<{
  status: InvoiceStatus;
  pick: (stats: DashboardStats) => number;
  bar: string;
}> = [
  { status: 'sent', pick: (s) => s.sentCount, bar: 'bg-accent' },
  { status: 'paid', pick: (s) => s.paidCount, bar: 'bg-success' },
  { status: 'void', pick: (s) => s.voidCount, bar: 'bg-danger' },
];

/** Landing content for `/dashboard`: greeting, setup checklist, live summary. */
export function DashboardApp() {
  return (
    <IslandBoundary>
      <AppProviders>
        <AuthGate>
          <DashboardContent />
        </AuthGate>
      </AppProviders>
    </IslandBoundary>
  );
}

function DashboardContent() {
  usePageTour('welcome');
  const { data: session } = useSession();
  const { data: profile, isError: profileFailed } = useProfile();
  // One small page feeds the recent list and the "any invoice yet?" checklist;
  // every headline number comes from the cached `stats` row instead of its own
  // live count, so the screen costs one six-row request plus one tiny read.
  const invoices = useInvoices('', { limit: RECENT_PREVIEW });
  const stats = useDashboardStats();

  const greeting = getGreeting();
  const businessName = profile?.name?.trim() || 'Usaha kamu';
  const usahaName = profile?.businessName?.trim() || 'Usaha kamu';

  const firstPage = invoices.data?.pages[0];
  const recent = firstPage?.items.slice(0, RECENT_PREVIEW) ?? [];
  const hasInvoices = (firstPage?.items.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-6">
      <div data-tour="dash-hero">
        <PageHeader
          kicker={greeting}
          title={businessName}
          description={session?.email}
          actions={
            <Button href="/invoice/new" data-tour="dash-create">
              <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
              Buat Invoice
            </Button>
          }
        />
      </div>

      {/* The checklist covers "profile incomplete" and points at what to do
          next; it hides itself once every step is done or when the profile
          fetch fails (unknown is not the same as incomplete). */}
      <SetupChecklist
        profile={profile ?? undefined}
        hasInvoices={hasInvoices}
        hidden={profileFailed || invoices.isLoading}
      />

      <SummarySection
        stats={stats.data}
        statsLoading={stats.isLoading}
        statsRevalidating={stats.revalidating}
        onRetryStats={() => void stats.refresh()}
        usahaName={usahaName}
        recent={recent}
        invoicesLoading={invoices.isLoading}
        invoicesError={invoices.isError}
        onRetryInvoices={() => void invoices.refetch()}
      />
    </div>
  );
}

function SummarySection({
  stats,
  statsLoading,
  statsRevalidating,
  onRetryStats,
  usahaName,
  recent,
  invoicesLoading,
  invoicesError,
  onRetryInvoices,
}: {
  stats: DashboardStats | null | undefined;
  statsLoading: boolean;
  statsRevalidating: boolean;
  onRetryStats: () => void;
  usahaName: string;
  recent: Invoice[];
  invoicesLoading: boolean;
  invoicesError: boolean;
  onRetryInvoices: () => void;
}) {
  // `null` means the cache read finished with no row yet; `undefined` means the
  // read itself has not finished. Either way there are no numbers to show
  // until a recompute lands — but only while one is actually running do we
  // skeleton; once both settle empty, the read failed and deserves a retry.
  const hasStats = stats != null;
  const waiting = !hasStats && (statsLoading || statsRevalidating);
  const failed = !hasStats && !waiting;

  if (failed) {
    return (
      <section data-tour="dash-summary">
        <ErrorState
          title="Gagal memuat ringkasan"
          message="Periksa koneksi internet kamu, lalu coba lagi."
          action={
            <Button size="sm" onClick={onRetryStats}>
              Coba lagi
            </Button>
          }
        />
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section data-tour="dash-summary" aria-label="Ringkasan singkat" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {waiting
          ? KPIS.map((kpi) => <KpiSkeleton key={kpi.key} />)
          : KPIS.map(({ key, label, Icon, tone, pick }) => (
              <StatCard key={key} label={label} value={pick(stats as DashboardStats)} Icon={Icon} tone={tone} />
            ))}
      </section>

      <section data-tour="dash-stats" className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-section">Ringkasan usaha</h2>
            <p className="text-sm text-muted">{usahaName}</p>
          </div>
          {/* The caption is the cache's honesty label: while a recompute is
              running it says so; afterwards it shows how old the row is. */}
          {hasStats || statsRevalidating ? (
            <p className="shrink-0 text-xs text-muted">
              {statsRevalidating
                ? 'Memperbarui…'
                : `Diperbarui ${formatWaktuLalu((stats as DashboardStats).updatedAt)}`}
            </p>
          ) : null}
        </div>

        <div className={TABLE_SHELL}>
          <table className={TABLE}>
            <thead>
              <tr className={THEAD_ROW}>
                <th scope="col" className={thClass()}>
                  Status
                </th>
                <th scope="col" className={thClass('text-right')}>
                  Jumlah
                </th>
                <th scope="col" className={thClass('text-right')}>
                  Porsi
                </th>
              </tr>
            </thead>
            <tbody>
              {waiting ? (
                <TableSkeletonRows />
              ) : (
                STATUS_ROWS.map(({ status, pick, bar }) => (
                  <tr key={status} className={TBODY_ROW}>
                    <td className={tdClass()}>
                      <StatusBadge status={status} />
                    </td>
                    <td className={tdClass('text-right font-medium tabular-nums')}>
                      {pick(stats as DashboardStats).toLocaleString('id-ID')}
                    </td>
                    <td className={tdClass('text-right')}>
                      <Porsi
                        value={pick(stats as DashboardStats)}
                        total={(stats as DashboardStats).totalInvoices}
                        bar={bar}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {!waiting && hasStats ? (
              <tfoot>
                <tr className="border-t border-border-strong">
                  <td className={tdClass()}>Total</td>
                  <td className={tdClass('text-right font-medium tabular-nums')}>
                    {(stats as DashboardStats).totalInvoices.toLocaleString('id-ID')}
                  </td>
                  <td className={tdClass('text-right tabular-nums text-muted')}>
                    {(stats as DashboardStats).totalInvoices > 0 ? '100%' : '—'}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </section>

      <section data-tour="dash-recent" className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-section">Faktur terbaru</h2>
          <a
            href="/invoices"
            className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
          >
            Lihat semua
            <ArrowRight size={14} aria-hidden="true" />
          </a>
        </div>

        {invoicesLoading ? (
          <LoadingState label="Memuat faktur…" />
        ) : invoicesError && recent.length === 0 ? (
          // A failed fetch must not read as "Belum ada faktur" — offer a retry.
          <ErrorState
            title="Gagal memuat faktur"
            message="Periksa koneksi internet kamu, lalu coba lagi."
            action={
              <Button size="sm" onClick={onRetryInvoices}>
                Coba lagi
              </Button>
            }
          />
        ) : recent.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Belum ada faktur"
            description="Buat invoice pertama kamu untuk mulai melacak."
          />
        ) : (
          <ul className={cardClass('none', 'flex flex-col divide-y divide-border')}>
            {recent.map((invoice) => {
              const { grandTotal } = calculateTotals({
                items: invoice.items,
                discount: invoice.discount,
                tax: invoice.tax,
              });
              return (
                <li key={invoice.id}>
                  <a
                    href={`/invoice/${invoice.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-background focus-ring"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{invoice.customerName || 'Tanpa nama'}</p>
                      <p className="text-sm text-muted">
                        {invoice.invoiceNumber} · {formatTanggalRelatif(invoice.date)}
                      </p>
                    </div>
                    <span className="shrink-0 tabular-nums font-medium">
                      {formatRupiah(grandTotal)}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  Icon,
  tone,
}: {
  label: string;
  value: number;
  Icon: LucideIcon;
  tone: KpiTone;
}) {
  return (
    <Card padding="sm" className="flex items-center gap-3">
      <span
        className={cx(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-control',
          KPI_TONE_CLASS[tone],
        )}
      >
        <Icon size={18} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm text-muted">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value.toLocaleString('id-ID')}</p>
      </div>
    </Card>
  );
}

function KpiSkeleton() {
  return (
    <div className={cardClass('sm', 'flex items-center gap-3')} aria-hidden="true">
      <span className="h-9 w-9 shrink-0 animate-pulse rounded-control bg-border/60" />
      <div className="flex flex-col gap-2">
        <span className="block h-3.5 w-24 animate-pulse rounded bg-border/60" />
        <span className="block h-6 w-12 animate-pulse rounded bg-border/60" />
      </div>
    </div>
  );
}

function TableSkeletonRows() {
  return (
    <>
      {[0, 1, 2].map((index) => (
        <tr key={index} className={TBODY_ROW}>
          <td className={tdClass()}>
            <span className="block h-5 w-20 animate-pulse rounded-pill bg-border/60" />
          </td>
          <td className={tdClass('text-right')}>
            <span className="ml-auto block h-4 w-10 animate-pulse rounded bg-border/60" />
          </td>
          <td className={tdClass('text-right')}>
            <span className="ml-auto block h-4 w-28 animate-pulse rounded bg-border/60" />
          </td>
        </tr>
      ))}
    </>
  );
}

/** A share of the total, as a labelled progress bar (tints mirror the badge). */
function Porsi({ value, total, bar }: { value: number; total: number; bar: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  if (total <= 0) {
    return <span className="tabular-nums text-muted">—</span>;
  }
  return (
    <span className="flex items-center justify-end gap-2">
      <span className="hidden h-1.5 w-24 overflow-hidden rounded-pill bg-border/70 sm:inline-block">
        <span className={cx('block h-full rounded-pill', bar)} style={{ width: `${pct}%` }} />
      </span>
      <span className="w-9 text-right tabular-nums text-muted">{pct}%</span>
    </span>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 11) return 'Selamat pagi 👋';
  if (hour < 15) return 'Selamat siang 👋';
  if (hour < 18) return 'Selamat sore 👋';
  return 'Selamat malam 👋';
}
