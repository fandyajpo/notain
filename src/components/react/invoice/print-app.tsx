import { useEffect, useMemo, type ReactNode } from 'react';
import { AuthGate } from '../auth/auth-gate';
import { AppProviders } from '../providers';
import { IslandBoundary } from '../ui/island-boundary';
import { Button } from '../ui/button';
import { InvoicePreview } from './invoice-preview';
import { useProfile } from '../../../lib/query/hooks/use-profile';
import { useTemplates } from '../../../lib/query/hooks/use-templates';
import { readPrintPayload } from '../../../lib/print';
import { resolveTemplate } from '../../../core/template/resolve';
import { EMPTY_PROFILE } from '../../../core/profile/model';

/**
 * `/invoice/print` — the browser-print half of exporting an invoice.
 *
 * The builder hands the current draft over through `sessionStorage` and opens
 * this page, which renders it with the same `InvoicePreview` the builder
 * shows. What you see is exactly what prints, so there is no second renderer
 * to drift out of sync.
 */
export function PrintApp() {
  return (
    <IslandBoundary>
      <AppProviders>
        <AuthGate>
          <PrintContent />
        </AuthGate>
      </AppProviders>
    </IslandBoundary>
  );
}

function PrintContent() {
  const invoice = useMemo(() => readPrintPayload(), []);
  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileError,
    refetch: refetchProfile,
  } = useProfile();
  const { data: templates, isLoading: templatesLoading } = useTemplates();

  const autoPrint = useMemo(
    () => new URLSearchParams(window.location.search).get('auto') === '1',
    [],
  );

  // A custom template has to be in hand before this page is ready. Printing
  // while the list is still in flight would silently render the built-in
  // fallback — the printed invoice would not match what the builder showed.
  // A failed profile fetch blocks readiness too: auto-printing a blank
  // letterhead would ship a broken kop with no warning.
  const pendingTemplate = Boolean(invoice?.templateId) && templatesLoading;
  const ready =
    invoice !== null && !profileLoading && !profileError && !pendingTemplate;

  // Opening the dialog straight away keeps "PDF" a single click. The short
  // delay is for layout, not data: it lets fonts and the logo settle before
  // the browser captures the page, which is what decides whether the first
  // line is crisp.
  useEffect(() => {
    if (!autoPrint || !ready) return;
    const timer = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(timer);
  }, [autoPrint, ready]);

  if (!invoice) return <MissingPayload />;
  if (profileLoading) return <Status>Menyiapkan halaman cetak…</Status>;

  if (profileError && !profile) {
    // Refuse to print a blank letterhead — surface the failure and offer a retry.
    return (
      <Status>
        <div className="flex flex-col items-center text-center">
          <p className="font-semibold text-danger">Gagal memuat data usaha</p>
          <p className="mt-1 max-w-sm text-sm text-muted">
            Periksa koneksi internet kamu, lalu muat ulang sebelum mencetak.
          </p>
          <div className="mt-4 flex justify-center gap-2">
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

  return (
    <>
      <div data-print-toolbar className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="text-sm font-semibold">Pratinjau cetak</p>
            <p className="text-xs text-muted">
              Pilih <span className="font-medium">Save as PDF</span> di dialog cetak untuk
              menyimpannya sebagai file.
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Struktur invoice (garis, kartu, tabel) selalu ikut tercetak. Centang{' '}
              <span className="font-medium">Background graphics</span> kalau mau warna dan wallpaper
              ikut juga (opsional).
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="secondary" onClick={() => window.history.back()}>
              Kembali
            </Button>
            <Button onClick={() => window.print()}>Cetak / Simpan PDF</Button>
          </div>
        </div>
      </div>

      <div data-print-sheet className="mx-auto w-full max-w-[182mm] px-4 py-8 sm:px-0">
        <InvoicePreview
          business={business}
          invoice={invoice}
          template={resolveTemplate(invoice.templateId, templates)}
          logoUrl={business.logoUrl}
        />
      </div>
    </>
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
    <div className="mx-auto flex min-h-[50vh] w-full max-w-md flex-col items-center justify-center gap-4 px-5 text-center">
      <div>
        <h1 className="text-title">Tidak ada invoice untuk dicetak</h1>
        <p className="mt-2 text-sm text-muted">
          Halaman ini hanya terisi saat kamu menekan tombol PDF dari builder.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={() => window.history.back()}>
          Kembali
        </Button>
        <Button onClick={() => window.location.assign('/dashboard')}>Ke dashboard</Button>
      </div>
    </div>
  );
}
