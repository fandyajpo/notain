import { useRef, useState, type ChangeEvent } from 'react';
import { ImageUp, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '../ui/button';
import { Notice } from '../ui/notice';
import { Turnstile } from '../auth/turnstile';
import { TURNSTILE_SITE_KEY, turnstileEnabled } from '../../../lib/turnstile';
import { PAYMENT_PROOF_ACCEPT, PAYMENT_PROOF_MAX_BYTES } from '../../../core/invoice/payment-proof';
import {
  INVOICE_STATUS_LABELS,
  type InvoicePaymentProof,
  type InvoiceStatus,
} from '../../../core/invoice/model';

type Props = {
  proof: InvoicePaymentProof | null;
  /** Lifecycle state — Lunas and Batal both close the upload window. */
  status: InvoiceStatus | null;
  onUpload: (file: File, turnstileToken: string | null) => Promise<void>;
};

/**
 * The customer's payment-proof panel on the public print page.
 *
 * One-shot by contract: once `proof` is set the form is replaced by a
 * confirmation (and the server would answer 409 anyway) — a corrected
 * screenshot is the owner's delete from the dashboard or builder. The file is
 * re-encoded in the browser before the request (see `lib/payment-proof.ts`),
 * so HEIC and huge screenshots arrive server-side as small WebP.
 *
 * The form also disappears once the invoice is Lunas or Batal: the money
 * question is settled either way, so there is nothing left to upload (and the
 * server's status gate would answer 409 regardless).
 */
export function PaymentProofCard({ proof, status, onUpload }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const captcha = turnstileEnabled();

  if (proof || done) {
    return (
      <Notice variant="success">
        <p className="font-medium">Bukti pembayaran sudah dikirim</p>
        <p className="mt-1">
          Bukti pembayaran untuk invoice ini sudah kami terima. Terima kasih! Halaman ini bisa
          ditutup.
        </p>
      </Notice>
    );
  }

  if (status === 'paid' || status === 'void') {
    return (
      <Notice variant="accent">
        <p className="font-medium">
          {status === 'paid' ? 'Invoice ini sudah ditandai Lunas' : 'Invoice ini sudah dibatalkan'}
        </p>
        <p className="mt-1">
          {status === 'paid'
            ? 'Pembayaran sudah tercatat, jadi unggah bukti pembayaran tidak diperlukan lagi.'
            : `Status invoice ini ${INVOICE_STATUS_LABELS[status]}, jadi unggah bukti pembayaran sudah ditutup.`}
        </p>
      </Notice>
    );
  }

  async function handlePick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Allow re-picking the same file after a failure.
    event.target.value = '';
    if (!file) return;

    setError(null);
    if (file.size > PAYMENT_PROOF_MAX_BYTES) {
      setError(
        'File terlalu besar. Maksimal 5 MB — foto akan dikompres otomatis, tapi file asli harus di bawah 5 MB.',
      );
      return;
    }
    if (captcha && !token) {
      setError('Selesaikan kotak verifikasi keamanan dulu, lalu pilih foto lagi.');
      return;
    }

    setBusy(true);
    try {
      await onUpload(file, captcha ? token : null);
      setDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal mengunggah. Coba lagi.');
      // The token is single-use; a failed attempt spends it.
      if (captcha) setNonce((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-control border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <ImageUp size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Unggah bukti pembayaran</p>
          <p className="mt-1 text-xs text-muted">
            Sudah transfer? Unggah bukti transfer (foto atau screenshot) di bawah ini, maksimal 5
            MB. Foto HP (termasuk iPhone) otomatis dikompres.
          </p>
        </div>
      </div>

      {error && (
        <Notice variant="danger" className="mt-3">
          {error}
        </Notice>
      )}

      {captcha && (
        <div className="mt-3">
          <Turnstile key={nonce} siteKey={TURNSTILE_SITE_KEY} onToken={setToken} />
        </div>
      )}

      <div className="mt-3">
        <input
          ref={inputRef}
          type="file"
          accept={PAYMENT_PROOF_ACCEPT}
          className="sr-only"
          aria-label="Pilih file bukti pembayaran"
          onChange={(event) => void handlePick(event)}
          disabled={busy}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={busy || (captcha && !token)}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? (
            <>
              <Loader2 size={15} className="animate-spin" aria-hidden /> Mengunggah…
            </>
          ) : (
            <>
              {captcha ? <ShieldCheck size={15} aria-hidden /> : <ImageUp size={15} aria-hidden />}{' '}
              Pilih foto bukti pembayaran
            </>
          )}
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-muted">Unggahan hanya bisa dikirim satu kali.</p>
    </div>
  );
}
