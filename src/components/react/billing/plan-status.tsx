import { CalendarClock, CreditCard, Receipt } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { getActiveOrgId, subscribeActiveOrg } from '../../../app/active-org';
import { useOrgs } from '../../../lib/query/hooks/use-orgs';
import { usePortalSession } from '../../../lib/query/hooks/use-payment';
import { PAID_PLANS, type PaidPlan } from '../../../core/billing/plans';
import { formatTanggal } from '../../../core/shared/dates';
import { formatRupiah } from '../../../core/shared/money';
import { GENERIC_ERROR_MESSAGE, isAppError } from '../../../core/shared/errors';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Notice } from '../ui/notice';
import { ErrorState, LoadingState } from '../ui/state';
import type { PaymentStatusValue, PortalSession } from '../../../app/payments';

const STATUS_BADGES: Record<
  PaymentStatusValue,
  { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' }
> = {
  paid: { label: 'Lunas', variant: 'success' },
  pending: { label: 'Menunggu pembayaran', variant: 'warning' },
  expired: { label: 'Kedaluwarsa', variant: 'neutral' },
  failed: { label: 'Gagal', variant: 'danger' },
};

/**
 * The account's subscription: which plan it is on, whether that plan is
 * running, when the term ends, and the one action the model actually offers
 * mid-term — renewal.
 *
 * Everything is read from the read-only `GET /api/payments/portal`, the same
 * endpoint the server gates the public invoice link with. Nothing here can
 * change the plan itself: only a verified DOKU notification (or an admin)
 * writes `plan` / `planExpiresAt`.
 *
 * Dates are shown only where the model has one. There is no renewal date to
 * print before a renewal is bought — the term simply ends — so the copy says
 * exactly that rather than inventing a next-billing date.
 */
export function PlanStatusCard() {
  const portal = usePortalSession();
  // Renewal is a checkout, and checkout is owner-only (server + page). Hiding
  // the button for members keeps the UI honest with the API they'd hit.
  const activeOrgId = useSyncExternalStore(subscribeActiveOrg, getActiveOrgId, () => null);
  const { data: orgs } = useOrgs();
  const canManage = orgs?.orgs.find((org) => org.id === activeOrgId)?.isOwner ?? false;

  return (
    <Card data-tour="billing-status">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">Langganan aktif</p>
          <p className="text-sm text-muted">
            Plan saat ini, masa berlaku, dan aksi perpanjangan kamu.
          </p>
        </div>
        <Button href="/pricing" variant="secondary" size="sm">
          Lihat semua plan
        </Button>
      </div>

      {portal.isLoading ? (
        <div className="mt-4">
          <LoadingState label="Memuat langganan…" />
        </div>
      ) : portal.isError || !portal.data ? (
        // Billing copy is never guessed: a failed read shows the failure, not
        // a "you are on Free" that might be wrong.
        <div className="mt-4">
          <ErrorState
            title="Langganan tidak bisa dimuat"
            message={isAppError(portal.error) ? portal.error.message : GENERIC_ERROR_MESSAGE}
            action={
              <Button variant="secondary" size="sm" onClick={() => void portal.refetch()}>
                Coba lagi
              </Button>
            }
          />
        </div>
      ) : (
        <PlanSummary session={portal.data} canManage={canManage} />
      )}
    </Card>
  );
}

function PlanSummary({ session, canManage }: { session: PortalSession; canManage: boolean }) {
  const paid = session.plan !== 'free';
  const info = paid ? PAID_PLANS[session.plan as PaidPlan] : null;

  // The model has exactly one date: `planExpiresAt`. `null` on a paid plan
  // means the term was granted without an end (the admin panel can clear it),
  // and Free has no end date at all.
  const expiryLine = !paid
    ? 'Tidak kedaluwarsa — plan Free berlaku selamanya.'
    : session.planExpiresAt == null
      ? 'Tidak kedaluwarsa — masa berlaku ini tidak dibatasi tanggal.'
      : session.active
        ? `Berlaku sampai ${formatTanggal(session.planExpiresAt)}.`
        : `Berakhir pada ${formatTanggal(session.planExpiresAt)}.`;

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <p className="text-lg font-semibold tracking-tight">
          {info ? `Notain ${info.name}` : 'Notain Free'}
        </p>
        {!paid ? (
          <Badge variant="neutral">Gratis selamanya</Badge>
        ) : session.active ? (
          <Badge variant="success">Aktif</Badge>
        ) : (
          <Badge variant="warning">Kedaluwarsa</Badge>
        )}
      </div>

      <p className="mt-2 flex items-start gap-2 text-sm text-muted">
        <CalendarClock size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
        <span>{expiryLine}</span>
      </p>

      {paid && !session.active && (
        <Notice variant="accent" className="mt-3">
          Plan {info?.name} kamu sudah berakhir, jadi saat ini kamu berjalan di plan Free. Riwayat
          invoice dan datanya tetap tersimpan — pilih lagi plan di bawah untuk kembali berlangganan.
        </Notice>
      )}

      {paid && session.active && canManage && (
        <Button
          href={`/checkout?plan=${session.plan}`}
          variant="secondary"
          size="sm"
          className="mt-4"
        >
          <CreditCard size={14} aria-hidden="true" />
          Perpanjang 30 hari
        </Button>
      )}
      {paid && session.active && (
        <Notice variant="accent" className="mt-3">
          Plan ini dibayar untuk 30 hari dan{' '}
          <span className="font-medium">tidak diperpanjang otomatis</span> — karena itu tidak ada
          tombol batal langganan: langganan berhenti dengan sendirinya di tanggal berakhir di atas.
          Turun ke plan lebih rendah baru bisa dipilih setelah masa aktif itu selesai.
        </Notice>
      )}
    </>
  );
}

/**
 * Recent payment orders behind the plan, straight from the portal read — the
 * `payments` rows are not readable from the browser SDK, so there is no
 * client-side shortcut. An account with no orders gets an empty state rather
 * than an empty table.
 */
export function PaymentHistoryCard() {
  const portal = usePortalSession();

  return (
    <Card>
      <div className="flex items-center gap-2">
        <Receipt size={15} aria-hidden="true" className="text-muted" />
        <p className="font-medium">Riwayat pembayaran</p>
      </div>

      {portal.isLoading ? (
        <div className="mt-4">
          <LoadingState label="Memuat riwayat pembayaran…" />
        </div>
      ) : portal.isError || !portal.data ? (
        <div className="mt-4">
          <ErrorState
            title="Riwayat tidak bisa dimuat"
            message={isAppError(portal.error) ? portal.error.message : GENERIC_ERROR_MESSAGE}
            action={
              <Button variant="secondary" size="sm" onClick={() => void portal.refetch()}>
                Coba lagi
              </Button>
            }
          />
        </div>
      ) : portal.data.payments.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Belum ada pembayaran di akun ini.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {portal.data.payments.map((payment) => {
            const badge = STATUS_BADGES[payment.status];
            return (
              <li
                key={payment.invoiceNumber}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    Notain {payment.plan === 'business' ? 'Business' : 'Pro'}
                  </p>
                  <p className="truncate font-mono text-xs text-muted">
                    {payment.invoiceNumber}
                    {payment.createdAt && ` · ${formatTanggal(payment.createdAt)}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm tabular-nums">
                    {payment.amount != null ? formatRupiah(payment.amount) : '—'}
                  </span>
                  <Badge variant={badge.variant} size="sm">
                    {badge.label}
                  </Badge>
                  {payment.resumeUrl && (
                    <Button
                      href={payment.resumeUrl}
                      variant="secondary"
                      size="sm"
                      aria-label={`Lanjutkan pembayaran ${payment.invoiceNumber}`}
                    >
                      <CreditCard size={14} aria-hidden="true" />
                      Bayar
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
