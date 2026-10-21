import { useMemo } from 'react';
import { FileText } from 'lucide-react';
import { AuthGate } from '../auth/auth-gate';
import { Button } from '../ui/button';
import { EmptyState, LoadingState } from '../ui/state';
import { Notice } from '../ui/notice';
import { PrintSheet, PrintToolbar, Status } from './print-shared';
import { readPrintPayload } from '../../../lib/print';
import { useProfile } from '../../../lib/query/hooks/use-profile';
import { useTemplates } from '../../../lib/query/hooks/use-templates';
import { resolveTemplate } from '../../../core/template/resolve';
import { EMPTY_PROFILE } from '../../../core/profile/model';

/**
 * The `/invoice/print` half that needs a session: the builder hands the draft
 * over through `sessionStorage`, `AuthGate` proves who you are, and
 * `useProfile` / `useTemplates` restore the letterhead and template the
 * builder showed.
 *
 * Deliberately its own module, loaded from `print-app.tsx` with `React.lazy`:
 * this is the only part of the page that needs the Appwrite client, so the
 * customer-facing `/invoice/print/<id>` view never has to wait for it.
 */
export function SignedInPrintView() {
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
          <span className="font-medium">Background graphics</span> kalau mau warna dan wallpaper
          ikut juga (opsional).
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
