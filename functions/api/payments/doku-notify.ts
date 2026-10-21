import { getRow, tableAuth } from '../../_lib/rows';
import { apiError, json } from '../../_lib/http';
import { parseNotification, verifyNotificationSignature } from '../../../src/core/billing/doku';
import { settlePayment, type PaymentRow } from '../../_lib/payment-settle';
import type { Env, PagesFunction } from '../../_lib/types';

/**
 * `POST /api/payments/doku-notify` — DOKU's HTTP notification for a checkout.
 *
 * Subscription activation happens HERE and in the Check Status reconciliation
 * of `GET /api/payments/status` — nowhere else. The redirect back from the
 * checkout page is only a display concern: no query parameter, no client
 * request and no unverified payload can move money or change `profiles.plan`.
 *
 * Verification, per DOKU's non-SNAP signature docs: the `Client-Id`,
 * `Request-Id`, `Request-Timestamp` and `Signature` headers must prove an
 * HMAC-SHA256 over the exact body bytes (Digest) addressed to *our* client id
 * and *our* notification path. Anything else is a 401 before it can touch a
 * row. What happens after that lives in
 * [`payment-settle.ts`](../_lib/payment-settle.ts), shared with the status
 * endpoint so the two paths can never disagree.
 *
 * Idempotency: DOKU may deliver the same event more than once (documented
 * retry behaviour). The transition is decided from the row's *current* state,
 * so a repeat of an already-final row is acknowledged without re-activating —
 * expiry math can never run twice for one payment. If profile activation ever
 * fails after the row flipped to `paid`, the row stays `paid` (money is real),
 * the failure is audited as `payment.paid.activation-failed` for manual
 * resolution — there is no automated retry and no admin-panel retry for this
 * case, so that audit row is the only signal; we never roll a paid row back to
 * pending.
 *
 * Always answers 2xx once the signature is valid and the payload parsed —
 * DOKU's best practice is to acknowledge fast and not to treat business
 * outcomes as delivery failures (a retried SUCCESS would only hit the
 * duplicate path anyway).
 */
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== 'POST') {
    return apiError(405, 'method_not_allowed', 'Metode ini tidak didukung.', { allow: 'POST' });
  }

  const clientId = env.DOKU_CLIENT_ID?.trim() ?? '';
  const secretKey = env.DOKU_SECRET_KEY?.trim() ?? '';
  if (!clientId || !secretKey) {
    return apiError(500, 'validation', 'Notifikasi pembayaran belum terkonfigurasi di server.');
  }

  // The exact bytes: the Digest in the signature covers them, so reading the
  // text once and verifying (before any JSON parse) is what makes the check
  // meaningful — a re-serialized body would fail.
  const rawBody = await request.text();

  const verified = await verifyNotificationSignature({
    secretKey,
    expectedClientId: clientId,
    requestTarget: new URL(request.url).pathname,
    rawBody,
    clientIdHeader: request.headers.get('Client-Id'),
    requestIdHeader: request.headers.get('Request-Id'),
    timestampHeader: request.headers.get('Request-Timestamp'),
    signatureHeader: request.headers.get('Signature'),
  });
  if (!verified) {
    return apiError(401, 'unauthenticated', 'Signature notifikasi tidak valid.');
  }

  let jsonBody: unknown;
  try {
    jsonBody = JSON.parse(rawBody);
  } catch {
    return apiError(400, 'validation', 'Payload notifikasi bukan JSON yang valid.');
  }
  const notification = parseNotification(jsonBody);

  if (!notification.invoiceNumber) {
    // Verified but unusable (no order id): acknowledge so DOKU stops
    // retrying, change nothing.
    return json(200, { received: true, applied: false, reason: 'no_invoice_number' });
  }

  const auth = tableAuth(env);
  if (!auth) {
    return apiError(500, 'validation', 'Server belum terkonfigurasi.');
  }

  // $id IS the invoice_number (written before the checkout was created),
  // so this is one document read, not a query.
  const payment = (await getRow(auth, 'payments', notification.invoiceNumber)) as
    | PaymentRow
    | null;

  const outcome = await settlePayment(env, auth, payment, notification);

  switch (outcome.kind) {
    case 'unknown_order':
      return json(200, { received: true, applied: false, reason: 'unknown_order' });
    case 'noop':
      return json(200, { received: true, applied: false, reason: outcome.reason });
    case 'expired':
      return json(200, { received: true, applied: true, status: 'expired' });
    case 'paid':
      return json(200, { received: true, applied: true, status: 'paid' });
    case 'profile_missing':
      return json(200, { received: true, applied: false, reason: 'profile_missing' });
    case 'error':
      return apiError(500, 'validation', outcome.message);
  }
};
