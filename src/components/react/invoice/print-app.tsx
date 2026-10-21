import { lazy, Suspense, useMemo } from 'react';
import { FileText } from 'lucide-react';
import { AppProviders } from '../providers';
import { IslandBoundary } from '../ui/island-boundary';
import { Button } from '../ui/button';
import { EmptyState, LoadingState } from '../ui/state';
import { PaymentProofCard } from './payment-proof-card';
import { PrintSheet, PrintToolbar, Status } from './print-shared';
import {
  usePublicInvoice,
  useUploadPaymentProof,
} from '../../../lib/query/hooks/use-public-invoice';
import { printInvoiceIdFromLocation } from '../../../lib/edit-route';
import { resolveTemplate } from '../../../core/template/resolve';
import { EMPTY_PROFILE } from '../../../core/profile/model';
import { isAppError, ERROR_CODES } from '../../../core/shared/errors';
import type { BusinessProfile } from '../../../core/profile/model';

/**
 * The half that needs a session — `AuthGate` plus the profile/template queries
 * behind it — and nothing else. Loaded on demand so the customer-facing view
 * below never pulls the Appwrite client with it.
 */
const SignedInPrintView = lazy(() =>
  import('./print-signed-in').then((m) => ({
    default: m.SignedInPrintView,
  })),
);

/**
 * `/invoice/print` — the browser-print half of exporting an invoice.
 *
 * Two lives, one page:
 *
 * - **Signed-in** (`/invoice/print`): the builder hands the current draft
 *   over through `sessionStorage` and opens this page, which renders it with
 *   the same `InvoicePreview` the builder shows. What you see is exactly what
 *   prints, so there is no second renderer to drift out of sync.
 * - **Public** (`/invoice/print/<id>`): a capability URL the owner sends to a
 *   customer. No session, no `AuthGate` — the invoice is fetched from
 *   `GET /api/invoice/<id>`, and the page doubles as the payment-proof upload
 *   form. The id in the path is what picks this mode.
 *
 * The public view is the one this module always ships; the signed-in view is
 * split into `print-signed-in.tsx` and pulled in only when there is no id in
 * the path.
 */
export function PrintApp() {
  const invoiceId = useMemo(
    () =>
      typeof window === 'undefined'
        ? undefined
        : printInvoiceIdFromLocation({
            pathname: window.location.pathname,
            search: window.location.search,
          }),
    [],
  );

  return (
    <IslandBoundary>
      <AppProviders>
        {invoiceId ? (
          <PublicPrintView invoiceId={invoiceId} />
        ) : (
          <Suspense fallback={<LoadingState label="Menyiapkan halaman cetak…" />}>
            <SignedInPrintView />
          </Suspense>
        )}
      </AppProviders>
    </IslandBoundary>
  );
}

/**
 * The customer-facing twin. The whole payload — invoice, letterhead, resolved
 * template — arrives from one public GET, so this view never touches the
 * signed-in query cache and works with no session at all.
 */
function PublicPrintView({ invoiceId }: { invoiceId: string }) {
  const { data: payload, isLoading, isError, error, refetch } = usePublicInvoice(invoiceId);
  const upload = useUploadPaymentProof(invoiceId);

  if (isLoading) return <LoadingState label="Memuat invoice…" />;

  if (isError || !payload) {
    const notFound = isAppError(error) && error.code === ERROR_CODES.NOT_FOUND;
    // The sender's plan does not cover invoice links (402 → FORBIDDEN). The
    // server's copy explains it to the customer; the action is aimed at the
    // owner who may be testing their own link.
    const planGated = isAppError(error) && error.code === ERROR_CODES.FORBIDDEN;
    if (planGated) {
      return (
        <Status>
          <div className="w-full max-w-md">
            <EmptyState
              icon={FileText}
              className="w-full"
              title="Invoice link butuh plan Pro"
              description={error.message}
              action={<Button href="/checkout?plan=pro">Berlangganan Pro</Button>}
            />
          </div>
        </Status>
      );
    }
    return (
      <Status>
        <div className="w-full max-w-md">
          <EmptyState
            icon={FileText}
            className="w-full"
            title={notFound ? 'Invoice tidak ditemukan' : 'Gagal memuat invoice'}
            description={
              notFound
                ? 'Tautan ini tidak menunjuk ke invoice yang ada. Minta tautan baru ke pengirimnya.'
                : 'Periksa koneksi internet kamu, lalu muat ulang halaman.'
            }
            action={
              notFound ? undefined : <Button onClick={() => void refetch()}>Coba lagi</Button>
            }
          />
        </div>
      </Status>
    );
  }

  const { invoice, business, template } = payload;
  const printTemplate = resolveTemplate(invoice.templateId, template ? [template] : []);
  const profile: BusinessProfile = { ...EMPTY_PROFILE, ...business };

  return (
    <>
      <PrintToolbar>
        <p className="text-sm font-semibold">Invoice {invoice.invoiceNumber}</p>
        <p className="text-xs text-muted">
          Dari {profile.businessName || profile.name || 'penjual'} · untuk {invoice.customerName}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          Pilih <span className="font-medium">Save as PDF</span> di dialog cetak untuk menyimpannya
          sebagai file.
        </p>
      </PrintToolbar>

      <div className="mx-auto flex w-full max-w-[182mm] flex-col gap-4 px-4 pb-8 pt-4 sm:px-0">
        <PaymentProofCard
          proof={invoice.paymentProof ?? null}
          status={invoice.status ?? null}
          onUpload={async (file, turnstileToken) => {
            await upload.mutateAsync({ file, turnstileToken });
          }}
        />
      </div>

      <PrintSheet
        business={profile}
        invoice={invoice}
        template={printTemplate}
        logoUrl={profile.logoUrl}
      />
    </>
  );
}
