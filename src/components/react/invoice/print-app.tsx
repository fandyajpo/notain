import { useMemo, type ReactNode } from 'react';
import { FileText } from 'lucide-react';
import { AuthGate } from '../auth/auth-gate';
import { AppProviders } from '../providers';
import { IslandBoundary } from '../ui/island-boundary';
import { Button } from '../ui/button';
import { EmptyState, LoadingState } from '../ui/state';
import { Notice } from '../ui/notice';
import { InvoicePreview } from './invoice-preview';
import { PaymentProofCard } from './payment-proof-card';
import { useProfile } from '../../../lib/query/hooks/use-profile';
import { useTemplates } from '../../../lib/query/hooks/use-templates';
import {
  usePublicInvoice,
  useUploadPaymentProof,
} from '../../../lib/query/hooks/use-public-invoice';
import { readPrintPayload } from '../../../lib/print';
import { printInvoiceIdFromLocation } from '../../../lib/edit-route';
import { resolveTemplate } from '../../../core/template/resolve';
import { EMPTY_PROFILE } from '../../../core/profile/model';
import { isAppError, ERROR_CODES } from '../../../core/shared/errors';
import type { BusinessProfile } from '../../../core/profile/model';
import type { InvoiceTemplate } from '../../../core/template/model';
import type { InvoiceDraft } from '../../../core/invoice/model';

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
        {invoiceId ? <PublicPrintView invoiceId={invoiceId} /> : <SignedInPrintView />}
      </AppProviders>
    </IslandBoundary>
  );
}

function SignedInPrintView() {
  return (
    <AuthGate>
      <SignedInPrintContent />
    </AuthGate>
  );
}

function SignedInPrintContent() {
  const invoice = useMemo(() => readPrintPayload(), []);
  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileError,
    refetch: refetchProfile,
  } = useProfile();
  const { data: templates, isLoading: templatesLoading } = useTemplates();

  // A custom template has to be in hand before this page is ready. Printing
  // while the list is still in flight would silently render the built-in
  // fallback — the printed invoice would not match what the builder showed.
  const pendingTemplate = Boolean(invoice?.templateId) && templatesLoading;

  if (!invoice) return <MissingPayload />;
  if (profileLoading || pendingTemplate) return <LoadingState label="Menyiapkan halaman cetak…" />;

  if (profileError && !profile) {
    // Refuse to print a blank letterhead — surface the failure and offer a retry.
    return (
      <Status>
        <div className="flex w-full max-w-md flex-col items-center gap-4">
          <Notice variant="danger" className="w-full">
            <p className="font-medium">Gagal memuat data usaha</p>
            <p className="mt-1">Periksa koneksi internet kamu, lalu muat ulang sebelum mencetak.</p>
          </Notice>
          <div className="flex justify-center gap-2">
            <Button variant="secondary" onClick={() => window.history.back()}>
              Kembali
            </Button>
            <Button onClick={() => void refetchProfile()}>Coba lagi</Button>
          </div>
        </div>
      </Status>
    );
  }

  const business = profile ?? EMPTY_PROFILE;
  const printTemplate = resolveTemplate(invoice.templateId, templates);

  return (
    <>
      <PrintToolbar backLabel="Kembali">
        <p className="text-sm font-semibold">Pratinjau cetak</p>
        <p className="text-xs text-muted">
          Pilih <span className="font-medium">Save as PDF</span> di dialog cetak untuk menyimpannya
          sebagai file.
        </p>
        <p className="mt-0.5 text-xs text-muted">
          Struktur invoice (garis, kartu, tabel) selalu ikut tercetak. Centang{' '}
          <span className="font-medium">Background graphics</span> kalau mau warna dan wallpaper ikut
          juga (opsional).
        </p>
      </PrintToolbar>
      <PrintSheet
        business={business}
        invoice={invoice}
        template={printTemplate}
        logoUrl={business.logoUrl}
      />
    </>
  );
}

/**
 * The customer-facing twin. The whole payload — invoice, letterhead, resolved
 * template — arrives from one public GET, so this view never touches the
 * signed-in query cache and works with no session at all.
 */
function PublicPrintView({ invoiceId }: { invoiceId: string }) {
  const {
    data: payload,
    isLoading,
    isError,
    error,
    refetch,
  } = usePublicInvoice(invoiceId);
  const upload = useUploadPaymentProof(invoiceId);

  if (isLoading) return <LoadingState label="Memuat invoice…" />;

  if (isError || !payload) {
    const notFound = isAppError(error) && error.code === ERROR_CODES.NOT_FOUND;
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
              notFound ? undefined : (
                <Button onClick={() => void refetch()}>Coba lagi</Button>
              )
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

function PrintToolbar({ children, backLabel }: { children: ReactNode; backLabel?: string }) {
  return (
    <div data-print-toolbar className="border-b border-border bg-card">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>{children}</div>
        <div className="flex shrink-0 items-center gap-2">
          {backLabel && (
            <Button variant="secondary" onClick={() => window.history.back()}>
              {backLabel}
            </Button>
          )}
          <Button onClick={() => window.print()}>Cetak / Simpan PDF</Button>
        </div>
      </div>
    </div>
  );
}

function PrintSheet({
  business,
  invoice,
  template,
  logoUrl,
}: {
  business: BusinessProfile;
  invoice: InvoiceDraft;
  template: InvoiceTemplate;
  logoUrl?: string;
}) {
  return (
    <div data-print-sheet className="mx-auto w-full max-w-[182mm] px-4 py-8 sm:px-0">
      <InvoicePreview
        business={business}
        invoice={invoice}
        template={template}
        businessType={template.businessType ?? business.businessType}
        logoUrl={logoUrl}
      />
    </div>
  );
}

function Status({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-5 text-center text-sm text-muted">
      {children}
    </div>
  );
}

function MissingPayload() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-5">
      <EmptyState
        icon={FileText}
        className="w-full max-w-md"
        title="Tidak ada invoice untuk dicetak"
        description="Halaman ini hanya terisi saat kamu menekan tombol PDF dari builder."
        action={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => window.history.back()}>
              Kembali
            </Button>
            <Button onClick={() => window.location.assign('/dashboard')}>Ke dashboard</Button>
          </div>
        }
      />
    </div>
  );
}
