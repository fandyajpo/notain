import { AuthGate } from '../auth/auth-gate';
import { AppProviders } from '../providers';
import { IslandBoundary } from '../ui/island-boundary';
import { InvoiceBuilder } from './invoice-builder';
import { useInvoice } from '../../../lib/query/hooks/use-invoices';
import { useProfile } from '../../../lib/query/hooks/use-profile';
import { invoiceIdFromLocation } from '../../../lib/edit-route';
import { EMPTY_PROFILE } from '../../../core/profile/model';

/**
 * `/invoice/<id>` — edits an existing invoice. The site is fully static, so the
 * id is not a server route: a Pages Function (and a dev-server middleware)
 * serves this page's shell under that path, and the id is read back out of the
 * address bar. `/invoice/edit?id=…`, the link that predates it, still works.
 */
export function InvoiceEditApp() {
  return (
    <IslandBoundary>
      <AppProviders>
        <AuthGate>
          <InvoiceEditContent invoiceId={readInvoiceId()} />
        </AuthGate>
      </AppProviders>
    </IslandBoundary>
  );
}

function readInvoiceId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return invoiceIdFromLocation(window.location);
}

function InvoiceEditContent({ invoiceId }: { invoiceId: string | undefined }) {
  const { data: invoice, isLoading, isError } = useInvoice(invoiceId);
  const { data: profile } = useProfile();

  if (!invoiceId) {
    return <NotFound message="Tautan invoice tidak lengkap." />;
  }

  if (isLoading) {
    return (
      <div className="rounded-card border border-border bg-card p-10 text-center text-sm text-muted">
        Memuat invoice…
      </div>
    );
  }

  if (isError || !invoice) {
    return (
      <NotFound message="Invoice ini mungkin sudah dihapus, atau kamu membuka tautan dari akun lain." />
    );
  }

  return (
    <InvoiceBuilder
      invoiceId={invoice.id}
      initialDraft={invoice}
      profile={profile ?? EMPTY_PROFILE}
      logoUrl={profile?.logoUrl ?? null}
    />
  );
}

function NotFound({ message }: { message: string }) {
  return (
    <div className="rounded-card border border-border bg-card px-6 py-14 text-center">
      <p className="text-base font-semibold">Invoice tidak ditemukan</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted">{message}</p>
      <div className="mt-6 flex justify-center">
        <a
          href="/dashboard"
          className="inline-flex h-11 items-center rounded-control bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent/90 focus-ring"
        >
          Kembali ke dashboard
        </a>
      </div>
    </div>
  );
}
