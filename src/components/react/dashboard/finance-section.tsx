import {
  Banknote,
  Clock,
  FilePlus,
  FileText,
  ImageUp,
  MessageCircle,
  TriangleAlert,
  UserPlus,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { formatTanggal, formatWaktuLalu, todayIsoDate } from '../../../core/shared/dates';
import { formatRupiah } from '../../../core/shared/money';
import {
  buildPaymentReminderMessage,
  buildWhatsAppUrl,
} from '../../../core/whatsapp';
import type {
  ActivityEvent,
  AttentionItem,
  ChartPoint,
  FinanceSummary,
  PeriodChoice,
} from '../../../core/stats/finance';
import { useDashboardFinance } from '../../../lib/query/hooks/use-dashboard-finance';
import { cx, softToneClass, type SoftTone } from '../../../lib/ui/classes';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, cardClass } from '../ui/card';
import { Input } from '../ui/input';
import { Notice } from '../ui/notice';
import { SegmentedControl } from '../ui/segmented';
import { ErrorState } from '../ui/state';

const PERIOD_OPTIONS: ReadonlyArray<{ value: PeriodChoice; label: string }> = [
  { value: 'week', label: 'Minggu ini' },
  { value: 'month', label: 'Bulan ini' },
  { value: 'custom', label: 'Kustom' },
];

type Props = {
  /** Used in the WhatsApp reminder copy — same fallback as the page header. */
  businessName: string;
  /**
   * Plan entitlement: "laporan bisnis" is the Pro headline on the pricing
   * page, so a free account sees the upgrade card instead — and never fires
   * the finance query (the flag reaches the hook).
   */
  enabled?: boolean;
};

/**
 * The dashboard's money screen: period filter, the four financial cards, the
 * six-month revenue chart, the unpaid invoices worth chasing, and recent
 * activity. All of it folds from *one* windowed, column-projected query (see
 * `getDashboardFinance`) — no per-card requests.
 *
 * Money and counts stay visually distinct on purpose: monetary values render
 * as Rupiah strings on their own cards, while the invoice *count* cards and
 * the status table below (kept from the original dashboard) render plain
 * integers. Cancelled invoices are excluded from revenue and receivables by
 * the core metrics; only the activity count still includes them.
 */
export function FinanceSection({ businessName, enabled = true }: Props) {
  const [choice, setChoice] = useState<PeriodChoice>('month');
  // Seeded to the current month so switching to "Kustom" starts from a sane,
  // already-meaningful window instead of an empty pair of inputs.
  const [customFrom, setCustomFrom] = useState(() => monthStart());
  const [customTo, setCustomTo] = useState(() => todayIsoDate());

  const finance = useDashboardFinance({ choice, customFrom, customTo, enabled });

  if (!enabled) return <FinanceUpsell />;

  return (
    <>
      <section
        data-tour="dash-finance"
        aria-label="Keuangan periode ini"
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-section">Keuangan</h2>
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              size="sm"
              ariaLabel="Pilih periode"
              value={choice}
              onChange={setChoice}
              options={PERIOD_OPTIONS}
              // Stretch the track to the control scale so it sits flush with
              // the date inputs that appear beside it.
              className="h-10"
            />
            {choice === 'custom' && (
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="date"
                  size="sm"
                  aria-label="Dari tanggal"
                  value={customFrom}
                  max={customTo}
                  onChange={(event) => setCustomFrom(event.target.value)}
                  className="w-40"
                />
                <Input
                  type="date"
                  size="sm"
                  aria-label="Sampai tanggal"
                  value={customTo}
                  min={customFrom}
                  onChange={(event) => setCustomTo(event.target.value)}
                  className="w-40"
                />
              </div>
            )}
          </div>
        </div>

        {finance.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
            {[0, 1, 2, 3].map((index) => (
              <div
                key={index}
                className={cardClass('sm', 'flex items-center gap-3')}
              >
                <span className="h-9 w-9 shrink-0 animate-pulse rounded-control bg-border/60" />
                <div className="flex flex-col gap-2">
                  <span className="block h-3.5 w-24 animate-pulse rounded bg-border/60" />
                  <span className="block h-6 w-24 animate-pulse rounded bg-border/60" />
                </div>
              </div>
            ))}
          </div>
        ) : finance.isError || !finance.data ? (
          <ErrorState
            title="Gagal memuat keuangan"
            message="Periksa koneksi internet kamu, lalu coba lagi."
            action={
              <Button size="sm" onClick={() => void finance.refetch()}>
                Coba lagi
              </Button>
            }
          />
        ) : (
          <>
            {finance.data.truncated && (
              <Notice variant="warning">
                Jumlah invoice pada periode ini melebihi batas muat — angka di bawah mungkin belum
                lengkap. Persempit periode untuk angka pasti.
              </Notice>
            )}
            <SummaryCards summary={finance.data.summary} />
            <RevenueChart points={finance.data.chart} />
          </>
        )}
      </section>

      {finance.data && finance.data.attention.length > 0 && (
        <AttentionList items={finance.data.attention} businessName={businessName} />
      )}

      {finance.data && finance.data.activity.length > 0 && (
        <ActivityFeed events={finance.data.activity} />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ cards */

type MoneyCardSpec = {
  label: string;
  Icon: LucideIcon;
  tone: SoftTone;
  pick: (summary: FinanceSummary) => string;
  sub: (summary: FinanceSummary) => string;
};

/**
 * The four financial cards, all period-scoped. Two carry Rupiah amounts, two
 * carry invoice *counts* — the label plus the value shape (Rp vs integer) is
 * what keeps "money" and "how many" from reading as the same kind of number.
 */
const MONEY_CARDS: ReadonlyArray<MoneyCardSpec> = [
  {
    label: 'Pendapatan diterima',
    Icon: Banknote,
    tone: 'success',
    pick: (summary) => formatRupiah(summary.receivedRevenue),
    sub: () => 'Invoice lunas pada periode ini',
  },
  {
    label: 'Belum dibayar',
    Icon: Clock,
    tone: 'accent',
    pick: (summary) => formatRupiah(summary.unpaidAmount),
    sub: () => 'Piutang yang masih menunggu',
  },
  {
    label: 'Jatuh tempo lewat',
    Icon: TriangleAlert,
    tone: 'danger',
    pick: (summary) => `${summary.overdueCount} invoice`,
    sub: (summary) =>
      summary.overdueCount > 0 ? formatRupiah(summary.overdueAmount) + ' terlambat' : 'Tidak ada',
  },
  {
    label: 'Invoice dibuat',
    Icon: FileText,
    tone: 'neutral',
    pick: (summary) => `${summary.invoiceCount}`,
    sub: () => 'Termasuk yang batal',
  },
];

function SummaryCards({ summary }: { summary: FinanceSummary }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {MONEY_CARDS.map(({ label, Icon, tone, pick, sub }) => (
        <Card key={label} padding="sm" className="flex items-center gap-3">
          <span
            className={cx(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-control',
              softToneClass(tone),
            )}
          >
            <Icon size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm text-muted">{label}</p>
            <p className="text-2xl font-semibold tabular-nums">{pick(summary)}</p>
            <p className="truncate text-xs text-muted">{sub(summary)}</p>
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ chart */

/**
 * Received revenue per month for the last six months, as plain CSS bars — no
 * charting dependency for six columns. Values live in each bar's tooltip and
 * in one screen-reader summary; the bars themselves carry no per-column text
 * so six Rupiah strings never fight for width on a phone.
 */
function RevenueChart({ points }: { points: ChartPoint[] }) {
  const max = Math.max(...points.map((point) => point.revenue), 1);
  const hasRevenue = points.some((point) => point.revenue > 0);
  const summaryLabel =
    'Pendapatan enam bulan terakhir: ' +
    points.map((point) => `${point.label} ${formatRupiah(point.revenue)}`).join(', ');

  return (
    <div className={cardClass('md')}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">Pendapatan 6 bulan terakhir</h3>
        {/* The honesty label: bucketed by invoice date, paid invoices only. */}
        <p className="text-xs text-muted">Dihitung dari tanggal invoice yang lunas</p>
      </div>
      <div
        className="mt-4 flex h-40 items-end gap-2 sm:gap-3"
        role="img"
        aria-label={summaryLabel}
      >
        {points.map((point) => (
          <div
            key={point.month}
            className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"
          >
            <div
              title={`${point.label}: ${formatRupiah(point.revenue)}`}
              className={cx(
                'w-full rounded-t-item transition-colors',
                point.revenue > 0 ? 'bg-accent/80' : 'bg-border/60',
              )}
              style={{
                height: `${Math.max((point.revenue / max) * 100, point.revenue > 0 ? 4 : 2)}%`,
              }}
            />
            <span className="text-[11px] text-muted">{point.label}</span>
          </div>
        ))}
      </div>
      {!hasRevenue && (
        <p className="mt-3 text-sm text-muted">Belum ada pemasukan lunas dalam 6 bulan terakhir.</p>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- attention */

/**
 * Unpaid invoices worth chasing, overdue first. The WhatsApp action only
 * appears when the invoice carries a phone number — a reminder cannot be
 * sent anywhere else, and inventing a destination would be worse than
 * hiding the button.
 */
function AttentionList({ items, businessName }: { items: AttentionItem[]; businessName: string }) {
  return (
    <section
      data-tour="dash-attention"
      aria-label="Invoice yang perlu ditagih"
      className="flex flex-col gap-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-section">Perlu perhatian</h2>
        <a
          href="/invoices?status=sent"
          className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
        >
          Lihat semua
        </a>
      </div>
      <ul className={cardClass('none', 'flex flex-col divide-y divide-border')}>
        {items.map(({ entry, total, overdueDays }) => (
          <li
            key={entry.id}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{entry.customerName || 'Tanpa nama'}</p>
              <p className="text-sm text-muted">
                {entry.invoiceNumber}
                {entry.dueDate ? ` · jatuh tempo ${formatTanggal(entry.dueDate)}` : ' · tanpa jatuh tempo'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {overdueDays !== null && (
                <Badge variant="danger" size="sm">
                  Terlambat {overdueDays} hari
                </Badge>
              )}
              {entry.customerPhone && (
                <Button
                  size="sm"
                  variant="secondary"
                  href={buildWhatsAppUrl({
                    phone: entry.customerPhone,
                    message: buildPaymentReminderMessage({
                      customerName: entry.customerName || 'Customer',
                      invoiceNumber: entry.invoiceNumber,
                      businessName,
                      total,
                      dueDate: entry.dueDate,
                    }),
                  })}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle size={15} aria-hidden="true" />
                  Ingatkan
                </Button>
              )}
              <Button size="sm" variant="ghost" href={`/invoice/${entry.id}`}>
                Buka
              </Button>
              <span className="shrink-0 tabular-nums font-medium">{formatRupiah(total)}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------------------------------------------------------------- activity */

const ACTIVITY_TONE: Record<ActivityEvent['kind'], SoftTone> = {
  'invoice-created': 'accent',
  'payment-proof': 'success',
  'customer-created': 'neutral',
};

const ACTIVITY_ICON: Record<ActivityEvent['kind'], LucideIcon> = {
  'invoice-created': FilePlus,
  'payment-proof': ImageUp,
  'customer-created': UserPlus,
};

function activityText(event: ActivityEvent): string {
  switch (event.kind) {
    case 'invoice-created':
      return `Invoice ${event.invoiceNumber ?? ''} dibuat${
        event.customerName ? ` untuk ${event.customerName}` : ''
      }`;
    case 'payment-proof':
      return `Bukti pembayaran ${event.invoiceNumber ?? ''} diunggah`;
    case 'customer-created':
      return `Customer ${event.customerName ?? ''} ditambahkan`;
  }
}

/**
 * Invoice creations, payment-proof uploads and customer creations — each one
 * an event the backend actually timestamps. Payment/cancellation status flips
 * are absent because the schema records no time for them; see the core
 * module for the full rationale.
 */
function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  return (
    <section
      data-tour="dash-activity"
      aria-label="Aktivitas terbaru"
      className="flex flex-col gap-4"
    >
      <h2 className="text-section">Aktivitas terbaru</h2>
      <ul className={cardClass('none', 'flex flex-col divide-y divide-border')}>
        {events.map((event, index) => {
          const Icon = ACTIVITY_ICON[event.kind];
          return (
            <li key={`${event.at}-${index}`} className="flex items-center gap-3 px-4 py-3">
              <span
                className={cx(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-control',
                  softToneClass(ACTIVITY_TONE[event.kind]),
                )}
              >
                <Icon size={15} aria-hidden="true" />
              </span>
              <p className="min-w-0 flex-1 truncate text-sm">{activityText(event)}</p>
              <span className="shrink-0 text-xs text-muted">{formatWaktuLalu(event.at)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ dates */

function monthStart(): string {
  return `${todayIsoDate().slice(0, 7)}-01`;
}

/**
 * What a free account sees where the reports would be: the same heading
 * position as the real section, selling the Pro upgrade instead of showing a
 * chart the plan does not cover ("Laporan bisnis" is a Pro bullet on the
 * pricing page).
 */
function FinanceUpsell() {
  return (
    <section
      data-tour="dash-finance"
      aria-label="Keuangan periode ini"
      className="flex flex-col gap-4"
    >
      <h2 className="text-section">Keuangan</h2>
      <Card padding="lg">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-md">
            <p className="font-medium">Laporan bisnis ada di plan Pro</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Ringkasan penjualan & pendapatan periode ini, grafik enam bulan, dan daftar invoice
              yang perlu ditagih — semuanya dalam satu layar.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button href="/checkout?plan=pro" size="sm">
              Berlangganan Pro
            </Button>
            <Button href="/pricing" variant="secondary" size="sm">
              Lihat harga
            </Button>
          </div>
        </div>
      </Card>
    </section>
  );
}
