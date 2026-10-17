import { FileText } from 'lucide-react';
import { AuthGate } from '../auth/auth-gate';
import { AppProviders } from '../providers';
import { IslandBoundary } from '../ui/island-boundary';
import { Button } from '../ui/button';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';
import { InvoiceBuilder } from './invoice-builder';
import { useInvoice } from '../../../lib/query/hooks/use-invoices';
import { useProfile } from '../../../lib/query/hooks/use-profile';
import { invoiceIdFromLocation } from '../../../lib/edit-route';
import { EMPTY_PROFILE } from '../../../core/profile/model';
import { ERROR_CODES, isAppError } from '../../../core/shared/errors';

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
  const { data: invoice, isLoading, isError, isFetching, refetch, error } = useInvoice(invoiceId);
  const { data: profile } = useProfile();

  if (!invoiceId) {
    return <NotFound message="Tautan invoice tidak lengkap." />;
  }

  if (isLoading) {
    return <LoadingState label="Memuat invoice…" />;
  }

  // A definitive 404 IS the answer — the invoice is gone, and retrying will
  // never change that. Only genuine failures (offline, 5xx) get the retry state.
  const notFound = isAppError(error) && error.code === ERROR_CODES.NOT_FOUND;

  // A failed fetch is not a missing invoice — offer a retry rather than
  // claiming the invoice was deleted or belongs to another account.
  if (isError && !invoice && !notFound) {
    return (
      <ErrorState
        title="Gagal memuat invoice"
        message="Periksa koneksi internet kamu, lalu coba lagi. Data kamu tidak hilang."
        action={
          <Button loading={isFetching} onClick={() => void refetch()}>
            Coba lagi
          </Button>
        }
      />
    );
  }

  if (!invoice) {
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
    <EmptyState
      icon={FileText}
      title="Invoice tidak ditemukan"
      description={message}
      action={<Button href="/dashboard">Kembali ke dashboard</Button>}
    />
  );
}
