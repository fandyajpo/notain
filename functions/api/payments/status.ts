import { getRow, tableAuth, type TableAuth } from '../../_lib/rows';
import { verifySession } from '../../_lib/appwrite';
import { apiError, fetchUpstream as fetch, json } from '../../_lib/http';
import {
  breakerAllows,
  breakerFailure,
  breakerSuccess,
  count,
  quotaPolicy,
  singleFlight,
} from '../../_lib/quota';
import {
  parseNotification,
  signRequest,
  statusRequestTarget,
  statusRequestUrl,
  utcTimestamp,
} from '../../../src/core/billing/doku';
import { settlePayment, type PaymentRow } from '../../_lib/payment-settle';
import type { Env, PagesFunction } from '../../_lib/types';

type StatusRow = PaymentRow & {
  currency?: string | null;
  dokuExpiredAt?: string | null;
  createdAt?: string | null;
};

/**
 * DOKU's own caution: *"Hit Check status after 60 seconds after payment
 * completion!"* We cannot observe completion from our side, so we wait 60 s
 * from order creation instead — the earliest moment a payment could possibly
 * have completed, which makes the wait a strict superset of theirs.
 */
const RECONCILE_MIN_AGE_MS = 60_000;

/**
 * Bound how often we may ask DOKU. The client polls every 3 s for as long as
 * the row is `pending` — potentially for the full hour a checkout lives, and
 * from a tab nobody is watching — so the probe is only allowed to leave inside
 * a 5 s window that opens once per 15 s of order age. A 3 s poll always lands
 * in a 5 s window, so activation still happens promptly, while DOKU sees at
 * most two Check Status calls per 15 s instead of one per poll.
 */
const RECONCILE_INTERVAL_MS = 15_000;
const RECONCILE_WINDOW_MS = 5_000;

/**
 * Whether a row of the given age may be probed. Split out as a pure function
 * so the throttle's contract is testable without waiting on a real clock:
 * nothing before the 60 s DOKU gate, then only inside a 5 s window per 15 s.
 */
export function inReconcileWindow(ageMs: number): boolean {
  if (!Number.isFinite(ageMs)) return false;
  if (ageMs < RECONCILE_MIN_AGE_MS) return false;
  return (ageMs - RECONCILE_MIN_AGE_MS) % RECONCILE_INTERVAL_MS < RECONCILE_WINDOW_MS;
}

/**
 * `GET /api/payments/status?invoice=…` — what `/payment/result` polls after
 * returning from DOKU.
 *
 * What this returns is our own `payments` row — never a redirect parameter,
 * which a user could freely edit. The row is looked up by its id (the invoice
 * number) and ownership is checked against the session, so one account can't
 * probe another's orders (404 for both "nonexistent" and "not yours", same as
 * the invoice endpoint).
 *
 * While the row is still `pending` the endpoint also **reconciles** it: it
 * asks DOKU's Check Status API what became of the order and, when DOKU reports
 * SUCCESS (or EXPIRED) for the amount we stored, runs the very same
 * `settlePayment` transition the notification webhook runs — see
 * [`payment-settle.ts`](../_lib/payment-settle.ts). This exists because the
 * webhook only fires if a merchant configured a Notification URL in DOKU's
 * Back Office (a setting outside this repository) and because notifications
 * can be late or lost. The client still learns nothing it could not learn by
 * reading, and still cannot influence any of it: the reply is only honoured if
 * it names the invoice we asked about and carries our stored amount.
 *
 * A DOKU failure is never an HTTP error here — the caller just gets the row as
 * it stands, and the next poll tries again.
 */
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== 'GET') {
    return apiError(405, 'method_not_allowed', 'Metode ini tidak didukung.', { allow: 'GET' });
  }

  const session = await verifySession(request, env);
  if (!session) {
    return apiError(401, 'unauthenticated', 'Silakan masuk terlebih dahulu.');
  }

  const invoice = new URL(request.url).searchParams.get('invoice')?.trim() ?? '';
  if (!invoice || invoice.length > 64) {
    return apiError(400, 'validation', 'Nomor invoice pembayaran tidak valid.');
  }

  const auth = tableAuth(env);
  if (!auth) return apiError(500, 'validation', 'Server belum terkonfigurasi.');

  let payment = (await getRow(auth, 'payments', invoice)) as StatusRow | null;
  if (!payment || payment.ownerId !== session.userId) {
    return apiError(404, 'not_found', 'Pembayaran tidak ditemukan.');
  }

  if (payment.status === 'pending') {
    const settled = await reconcile(env, auth, payment);
    // Re-read only when this request itself may have moved the row. Every
    // other pending poll (throttle shut, DOKU failed, nothing to apply) leaves
    // the row exactly as read above, so the second document read — one per
    // 3 s poll, per watching tab — would only fetch the same bytes back.
    if (settled) {
      payment = ((await getRow(auth, 'payments', invoice)) as StatusRow | null) ?? payment;
    }
  }

  return json(
    200,
    {
      invoiceNumber: payment.$id,
      plan: payment.plan ?? 'pro',
      amount: payment.amount ?? null,
      currency: payment.currency ?? 'IDR',
      status: payment.status ?? 'pending',
      paidAt: payment.paidAt ?? null,
      expiresAt: payment.dokuExpiredAt ?? null,
    },
    // Personalised billing state that this very request may have just changed:
    // never let an intermediary hold on to it.
    { 'cache-control': 'no-store' },
  );
};

/**
 * Best-effort Check Status probe. Never throws — every failure mode (no
 * credentials, a too-fresh order, a DOKU timeout or error, an unparseable
 * body) leaves the row untouched for the next poll to retry.
 *
 * Answers whether the row may now hold different bytes than the caller read.
 * Only `settlePayment` writing can do that, so a throttle miss, a DOKU failure
 * or a `noop`/`unknown_order` transition all answer `false` and the caller
 * skips its re-read.
 */
async function reconcile(env: Env, auth: TableAuth, payment: StatusRow): Promise<boolean> {
  const clientId = env.DOKU_CLIENT_ID?.trim() ?? '';
  const secretKey = env.DOKU_SECRET_KEY?.trim() ?? '';
  if (!clientId || !secretKey) return false;
  if (!inReconcileWindow(Date.now() - Date.parse(payment.createdAt ?? ''))) return false;

  // Circuit breaker: while DOKU is failing, stop spending Worker quota and
  // DOKU quota on probes that are known to fail — the poller keeps painting
  // the row as it stands and the breaker lets one probe through per cooldown.
  const policy = quotaPolicy(env);
  if (!breakerAllows('doku', policy)) {
    count('doku.probe.breaker-skip');
    return false;
  }

  // Concurrent polls for the same order (several tabs, a 3 s interval that
  // overlaps a slow probe) share one DOKU call instead of stacking probes.
  return singleFlight(`doku-probe:${payment.$id}`, () =>
    probeAndSettle(env, auth, payment, clientId, secretKey),
  );
}

async function probeAndSettle(
  env: Env,
  auth: TableAuth,
  payment: StatusRow,
  clientId: string,
  secretKey: string,
): Promise<boolean> {
  count('doku.probe');
  const timestamp = utcTimestamp();
  const requestId = crypto.randomUUID();
  const target = statusRequestTarget(payment.$id);
  const signature = await signRequest({ secretKey, clientId, requestId, timestamp, target });

  let response: Response;
  try {
    response = await fetch(statusRequestUrl(payment.$id), {
      method: 'GET',
      headers: {
        'Client-Id': clientId,
        'Request-Id': requestId,
        'Request-Timestamp': timestamp,
        Signature: signature,
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    breakerFailure('doku', quotaPolicy(env));
    return false;
  }
  // 5xx is DOKU struggling: count it toward the breaker. 404 is a definitive
  // "never saw this invoice" (a row whose order failed to create) — leave the
  // row alone rather than probing it on every window, but it is not a fault.
  if (response.status >= 500) {
    breakerFailure('doku', quotaPolicy(env));
    return false;
  }
  if (!response.ok) return false;
  breakerSuccess('doku');

  const notification = parseNotification(await response.json().catch(() => null));
  // Only a reply about *this* order may move it.
  if (notification.invoiceNumber !== payment.$id) return false;

  const outcome = await settlePayment(env, auth, payment, notification);
  if (outcome.kind === 'error') {
    console.error('payments/status: settle failed for', payment.$id, outcome.message);
  }
  // `noop` never writes the payment row (an amount-mismatch audit row is not
  // this response's business), and `unknown_order` cannot happen for a row we
  // just read — every other outcome flipped `status`, so the caller re-reads.
  return outcome.kind !== 'noop' && outcome.kind !== 'unknown_order';
}
