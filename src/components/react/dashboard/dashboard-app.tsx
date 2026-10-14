import { ArrowRight, FileText, Plus, Users } from 'lucide-react';
import { AuthGate } from '../auth/auth-gate';
import { AppProviders } from '../providers';
import { IslandBoundary } from '../ui/island-boundary';
import { SetupChecklist } from './setup-checklist';
import { calculateTotals } from '../../../core/invoice/calculator';
import { formatRupiah } from '../../../core/shared/money';
import { formatTanggalRelatif } from '../../../core/shared/dates';
import { useProfile } from '../../../lib/query/hooks/use-profile';
import { useSession } from '../../../lib/query/hooks/use-session';
import { useCustomerCount } from '../../../lib/query/hooks/use-customers';
import { useInvoices } from '../../../lib/query/hooks/use-invoices';
import type { Invoice } from '../../../core/invoice/model';

/**
 * How many recent invoices the dashboard previews before linking onward.
 *
 * Doubles as the page size for the one invoice query the dashboard makes, so
 * it ships six rows instead of the table's full hundred.
 */
const RECENT_PREVIEW = 6;

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
  const { data: session } = useSession();
  const { data: profile, isError: profileFailed } = useProfile();
  // One small page feeds the recent list, the "any invoice yet?" checklist and
  // the total-invoice stat (read off the response's `total`), so the whole
  // screen costs a single six-row request rather than a full-page fetch plus a
  // walk of every invoice number.
  const invoices = useInvoices('', { limit: RECENT_PREVIEW });
  const customerCount = useCustomerCount();

  const greeting = getGreeting();
  const businessName = profile?.name?.trim() || 'Usaha kamu';

  const firstPage = invoices.data?.pages[0];
  const totalInvoices = firstPage?.total;
  const recent = firstPage?.items.slice(0, RECENT_PREVIEW) ?? [];
  const hasInvoices = (firstPage?.items.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-muted">{greeting}</p>
          <h1 className="mt-1 text-title">{businessName}</h1>
          {session && <p className="mt-1 text-sm text-muted">{session.email}</p>}
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/invoice/new"
            className="inline-flex h-11 items-center gap-2 rounded-control bg-accent px-4 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90 focus-ring"
          >
            <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
            Buat Invoice
          </a>
        </div>
      </header>

      {/* The checklist covers "profile incomplete" and points at what to do
          next; it hides itself once every step is done or when the profile
          fetch fails (unknown is not the same as incomplete). */}
      <SetupChecklist
        profile={profile ?? undefined}
        hasInvoices={hasInvoices}
        hidden={profileFailed || invoices.isLoading}
      />

      <SummarySection
        totalInvoices={totalInvoices}
        totalCustomers={customerCount.data}
        recent={recent}
        invoicesLoading={invoices.isLoading}
      />
    </div>
  );
}

function SummarySection({
  totalInvoices,
  totalCustomers,
  recent,
  invoicesLoading,
}: {
  totalInvoices: number | undefined;
  totalCustomers: number | undefined;
  recent: Invoice[];
  invoicesLoading: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Total faktur"
          value={totalInvoices === undefined ? '-' : String(totalInvoices)}
          Icon={FileText}
        />
        <StatCard
          label="Total customer"
          value={totalCustomers === undefined ? '-' : String(totalCustomers)}
          Icon={Users}
        />
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Faktur terbaru</h2>
          <a
            href="/invoices"
            className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
          >
            Lihat semua
            <ArrowRight size={14} aria-hidden="true" />
          </a>
        </div>

        {invoicesLoading ? (
          <p className="text-sm text-muted">Memuat faktur…</p>
        ) : recent.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border py-12 text-center">
            <FileText size={24} className="text-muted" aria-hidden="true" />
            <p className="font-medium">Belum ada faktur</p>
            <p className="text-sm text-muted">Buat invoice pertama kamu untuk mulai melacak.</p>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-card shadow-card">
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

function StatCard({ label, value, Icon }: { label: string; value: string; Icon: typeof FileText }) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-border bg-card p-4 shadow-card">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
        <Icon size={18} aria-hidden="true" />
      </span>
      <div>
        <p className="text-sm text-muted">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 11) return 'Selamat pagi 👋';
  if (hour < 15) return 'Selamat siang 👋';
  if (hour < 18) return 'Selamat sore 👋';
  return 'Selamat malam 👋';
}
