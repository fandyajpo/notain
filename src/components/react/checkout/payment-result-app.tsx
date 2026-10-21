import { useEffect, useState } from 'react';
import { CircleCheck, Clock, RefreshCw } from 'lucide-react';
import { usePaymentStatus } from '../../../lib/query/hooks/use-payment';
import { useProfile } from '../../../lib/query/hooks/use-profile';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query/keys';
import { formatTanggal } from '../../../core/shared/dates';
import { formatRupiah } from '../../../core/shared/money';
import { isPaidPlan } from '../../../core/billing/plans';
import { isUnauthenticated } from '../../../appwrite/errors';
import { isAppError } from '../../../core/shared/errors';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { ErrorState, LoadingState } from '../ui/state';

/**
 * Where DOKU sends the browser back after a checkout (`auto_redirect` + the
 * `callback_url` built server-side), carrying only the invoice number.
 *
 * This page is a pure readout of the row the verified notification endpoint
 * wrote. It polls `GET /api/payments/status` while the order is pending and
 * stops the moment it turns final. No query parameter here, no fetch this page
 * makes, and no click on it can activate a plan — that authority lives
 * exclusively in `functions/api/payments/doku-notify.ts`.
 */
export function PaymentResultApp() {
  const [invoice, setInvoice] = useState('');
  useEffect(() => {
    setInvoice(new URLSearchParams(window.location.search).get('invoice')?.trim() ?? '');
  }, []);

  const status = usePaymentStatus(invoice);
  const paid = status.data?.status === 'paid';

  // Activation happened in the webhook while this tab was away on DOKU. The
  // cached profile still says `free`; refresh it so the dashboard the user
  // heads to next shows the plan they just bought.
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!paid) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.profile });
    // …and the billing portal's history, so the settings card shows this
    // order as paid on the very next visit.
    void queryClient.invalidateQueries({ queryKey: queryKeys.portalSession });
  }, [paid, queryClient]);

  // Only fetched for a paid order: the expiry date is the profile's, not the
  // payment row's (that one tracks the DOKU session, which is over by now).
  const { data: profile } = useProfile(paid);

  // An expired JWT on the way back from DOKU lands here as a 401. Send them
  // through login and back — the payment itself is already recorded.
  useEffect(() => {
    if (!isUnauthenticated(status.error)) return;
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.replace(`/login?next=${next}`);
  }, [status.error]);

  if (invoice === '') {
    return (
      <ErrorState
        title="Tautan tidak lengkap"
        message="Halaman ini dibuka dari tautan pembayaran yang membawa nomor invoice. Buka tautan aslinya, atau mulai lagi dari halaman harga."
        action={
          <Button href="/pricing" size="sm">
            Lihat harga
          </Button>
        }
      />
    );
  }

  if (status.isLoading || (status.isError && isUnauthenticated(status.error))) {
    return <LoadingState label="Memeriksa status pembayaran…" />;
  }

  if (status.isError || !status.data) {
    const notFound = isAppError(status.error) && status.error.code === 'not_found';
    return (
      <ErrorState
        title={notFound ? 'Pembayaran tidak ditemukan' : 'Gagal memeriksa pembayaran'}
        message={
          notFound
            ? 'Nomor invoice ini tidak cocok dengan pembayaran di akun kamu. Pastikan kamu membuka tautan dari akun yang sama.'
            : 'Periksa koneksi internet kamu, lalu coba lagi. Pembayaran yang sudah masuk tetap tersimpan — coba lagi tidak membuat tagihan baru.'
        }
        action={
          <Button size="sm" loading={status.isFetching} onClick={() => void status.refetch()}>
            Coba lagi
          </Button>
        }
      />
    );
  }

  const { status: value, plan, amount } = status.data;

  if (value === 'pending') {
    return (
      <Card padding="lg" className="w-full text-center">
        <Clock size={28} className="mx-auto text-muted" aria-hidden="true" />
        <h1 className="mt-4 text-title">Menunggu pembayaran</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Selesaikan pembayaran di halaman DOKU. Statusnya diperbarui otomatis begitu DOKU
          mengirim konfirmasi — biasanya beberapa detik setelah pembayaran.
        </p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-6"
          loading={status.isFetching}
          onClick={() => void status.refetch()}
        >
          <RefreshCw size={15} aria-hidden="true" />
          Periksa lagi
        </Button>
      </Card>
    );
  }

  if (value === 'paid') {
    return (
      <Card padding="lg" className="w-full text-center">
        <CircleCheck size={28} className="mx-auto text-accent" aria-hidden="true" />
        <h1 className="mt-4 text-title">Pembayaran berhasil</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Plan {plan === 'business' ? 'Business' : 'Pro'} kamu sudah aktif.
          {amount != null && ` Sebesar ${formatRupiah(amount)}.`}
        </p>
        {profile?.planExpiresAt && (
          <p className="mt-2 text-sm text-muted">
            Aktif sampai {formatTanggal(profile.planExpiresAt)}.
          </p>
        )}
        <Button href="/dashboard" className="mt-6">
          Buka dashboard
        </Button>
      </Card>
    );
  }

  // expired / failed — the order never reached a confirmed SUCCESS.
  const planLabel = plan === 'business' ? 'Business' : 'Pro';
  return (
    <ErrorState
      title={value === 'expired' ? 'Pembayaran kedaluwarsa' : 'Pembayaran tidak selesai'}
      message={
        value === 'expired'
          ? `Pesanan untuk plan ${planLabel} tidak diselesaikan dalam waktu yang tersedia. Tidak ada uang yang tertahan — mulai lagi kapan saja.`
          : `Pesanan untuk plan ${planLabel} tidak berhasil diselesaikan. Tidak ada uang yang tertahan — coba lagi kapan saja.`
      }
      action={
        <div className="flex flex-wrap items-center justify-center gap-3">
          {isPaidPlan(plan) && (
            <Button href={`/checkout?plan=${plan}`} size="sm">
              Coba lagi
            </Button>
          )}
          <Button href="/pricing" variant="secondary" size="sm">
            Kembali ke harga
          </Button>
        </div>
      }
    />
  );
}
