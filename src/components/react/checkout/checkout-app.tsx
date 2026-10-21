import { useEffect, useState } from 'react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { useSession } from '../../../lib/query/hooks/use-session';
import { useStartCheckout } from '../../../lib/query/hooks/use-payment';
import { isPaidPlan, PAID_PLANS, planAmount, type PaidPlan } from '../../../core/billing/plans';
import { formatRupiah } from '../../../core/shared/money';
import { GENERIC_ERROR_MESSAGE } from '../../../core/shared/errors';
import { toast } from '../../../lib/ui/toast';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Notice } from '../ui/notice';
import { ErrorState, LoadingState } from '../ui/state';

/**
 * The confirmation step between the pricing CTA and DOKU's hosted page.
 *
 * Why a page and not a direct redirect from `/pricing`:
 * - It is the landing spot after login: the plan survives the auth detour in
 *   `?plan=`, so "sign in, then pay" needs no server-side session state.
 * - It shows the price the server will actually charge (display copy only —
 *   the amount is resolved from the trusted catalog in the Function) before
 *   any order exists.
 * - It is where a duplicate click, a downgrade attempt or a gateway hiccup
 *   surfaces as a readable message instead of a dead end on DOKU's side.
 *
 * Free is not purchasable: `?plan=free` (or anything unrecognised) never
 * reaches the payment API — same rule the server enforces.
 */
export function CheckoutApp() {
  // The page is statically prerendered, so the query string only exists in
  // the browser — read it after mount, exactly like the auth pages read
  // `?next=`.
  const [planParam, setPlanParam] = useState<string | null>(null);
  useEffect(() => {
    setPlanParam(new URLSearchParams(window.location.search).get('plan'));
  }, []);

  const { data: session, isLoading } = useSession();
  const checkout = useStartCheckout();

  // Signed-out visitors keep their plan through the auth detour: the login
  // page redirects back to this exact URL (same-origin path, `?next=`).
  useEffect(() => {
    if (isLoading || session || planParam === null) return;
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    toast('Silakan masuk terlebih dahulu untuk berlangganan.', { variant: 'info' });
    window.location.replace(`/login?next=${next}`);
  }, [isLoading, session, planParam]);

  if (planParam === null || isLoading || !session) {
    return <LoadingState label="Memeriksa sesi…" />;
  }

  if (planParam === 'free') {
    return (
      <ErrorState
        title="Plan Free tidak perlu dibeli"
        message="Plan Free gratis selamanya. Langsung buat akun dan mulai bikin invoice."
        action={
          <Button href="/register" size="sm">
            Buat Invoice Gratis
          </Button>
        }
      />
    );
  }

  if (!isPaidPlan(planParam)) {
    return (
      <ErrorState
        title="Plan tidak dikenali"
        message="Pilih plan Pro atau Business dari halaman harga."
        action={
          <Button href="/pricing" size="sm">
            Lihat harga
          </Button>
        }
      />
    );
  }

  const plan: PaidPlan = planParam;
  const info = PAID_PLANS[plan];

  return (
    <Card padding="lg" className="w-full">
      <p className="text-eyebrow uppercase text-muted">Langganan</p>
      <h1 className="mt-2 text-title">Notain {info.name}</h1>

      <p className="mt-5 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight">
          {formatRupiah(planAmount(plan))}
        </span>
        <span className="text-sm text-muted">/ 30 hari</span>
      </p>

      {checkout.isError && (
        <Notice variant="danger" className="mt-5">
          {checkout.error instanceof Error ? checkout.error.message : GENERIC_ERROR_MESSAGE}
        </Notice>
      )}

      <Button
        full
        size="lg"
        className="mt-6"
        loading={checkout.isPending}
        // `isPending` also disables the button, so a double click cannot open
        // two DOKU sessions — the server's in-flight guard is the backstop.
        onClick={() => {
          checkout.mutate(plan, {
            // Full navigation: the hosted checkout page replaces our origin.
            onSuccess: ({ url }) => window.location.assign(url),
          });
        }}
      >
        Bayar sekarang
      </Button>

      <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted">
        <ShieldCheck size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
        <span>
          Kamu akan diarahkan ke halaman pembayaran resmi DOKU. Plan aktif otomatis setelah
          pembayaran dikonfirmasi — tidak perlu kirim bukti.
        </span>
      </p>

      <a
        href="/pricing"
        className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-muted underline-offset-4 hover:text-foreground hover:underline focus-ring rounded-control"
      >
        <ArrowLeft size={15} aria-hidden="true" />
        Ganti plan
      </a>
    </Card>
  );
}
