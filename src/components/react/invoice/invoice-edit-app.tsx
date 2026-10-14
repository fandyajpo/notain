import { AuthGate } from '../auth/auth-gate';
import { AppProviders } from '../providers';
import { IslandBoundary } from '../ui/island-boundary';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
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
      <Card padding="none" className="px-6 py-10 text-center text-sm text-muted">
        Memuat invoice…
      </Card>
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
    <Card padding="none" className="px-6 py-14 text-center">
      <p className="text-base font-semibold">Invoice tidak ditemukan</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted">{message}</p>
      <div className="mt-6 flex justify-center">
        <Button href="/dashboard">Kembali ke dashboard</Button>
      </div>
    </Card>
  );
}
