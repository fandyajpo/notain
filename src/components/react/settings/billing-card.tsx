import { CreditCard, Receipt } from 'lucide-react';
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
 * The billing portal's one surface: what plan the account is on, when it
 * ends, and the recent payment orders behind it — all from the read-only
 * `GET /api/payments/portal` (the `payments` rows are unreadable from the
 * browser SDK, so there is no client-side shortcut).
 *
 * Every action here is navigation: upgrade and renewal lead to the same
 * `/checkout?plan=` confirmation page the pricing CTAs use, and a still-open
 * DOKU order is resumed through its hosted URL. Nothing on this card can
 * change the plan itself — that stays with the verified notification.
 */
export function BillingCard() {
  const portal = usePortalSession();

  return (
    <Card data-tour="settings-billing">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">Langganan</p>
          <p className="text-sm text-muted">
            Plan aktif, masa berlaku, dan riwayat pembayaran kamu.
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
            message={
              isAppError(portal.error) ? portal.error.message : GENERIC_ERROR_MESSAGE
            }
            action={
              <Button variant="secondary" size="sm" onClick={() => void portal.refetch()}>
                Coba lagi
              </Button>
            }
          />
        </div>
      ) : (
        <PlanSummary session={portal.data} />
      )}
    </Card>
  );
}

function PlanSummary({ session }: { session: PortalSession }) {
  const paid = session.plan !== 'free';
  const info = paid ? PAID_PLANS[session.plan as PaidPlan] : null;

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <p className="text-lg font-semibold tracking-tight">
          {info ? `Notain ${info.name}` : 'Notain Free'}
        </p>
        {!paid ? (
          <Badge variant="neutral">Gratis selamanya</Badge>
        ) : session.active ? (
          <Badge variant="success">
            {session.planExpiresAt
              ? `Aktif s.d. ${formatTanggal(session.planExpiresAt)}`
              : 'Aktif'}
          </Badge>
        ) : (
          <Badge variant="warning">Kedaluwarsa</Badge>
        )}
      </div>

      {paid && !session.active && (
        <Notice variant="accent" className="mt-3">
          Plan {info?.name} kamu sudah berakhir. Perpanjang kapan saja — riwayat invoice dan
          datanya tetap tersimpan.
        </Notice>
      )}

      {info && session.active && (
        <Button
          href={`/checkout?plan=${session.plan}`}
          variant="secondary"
          size="sm"
          className="mt-4"
        >
          Perpanjang 30 hari
        </Button>
      )}
      {!paid && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button href="/checkout?plan=pro" size="sm">
            Berlangganan Pro
          </Button>
          <Button href="/pricing" variant="secondary" size="sm">
            Bandingkan plan
          </Button>
        </div>
      )}

      <div className="mt-6">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Receipt size={15} aria-hidden="true" className="text-muted" />
          Riwayat pembayaran
        </p>
        {session.payments.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Belum ada pembayaran di akun ini.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {session.payments.map((payment) => {
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
      </div>
    </>
  );
}
