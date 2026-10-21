import { getRow, patchRow, tableAuth } from '../../_lib/rows';
import { apiError, json } from '../../_lib/http';
import { writeAudit } from '../../_lib/audit';
import { parseNotification, verifyNotificationSignature } from '../../../src/core/billing/doku';
import { computePlanExpiry } from '../../../src/core/billing/plans';
import { decideTransition } from '../../../src/core/billing/payment-state';
import type { Env, PagesFunction } from '../../_lib/types';

type PaymentRow = {
  $id: string;
  ownerId?: string | null;
  plan?: string | null;
  amount?: number | null;
  status?: string | null;
  paidAt?: string | null;
};

type ProfileRow = {
  $id: string;
  plan?: string | null;
  planExpiresAt?: string | null;
};

/** Payment states this endpoint knows how to act on. */
function normalizeStatus(value: unknown): 'pending' | 'paid' | 'expired' {
  return value === 'paid' || value === 'expired' ? value : 'pending';
}

/**
 * `POST /api/payments/doku-notify` — DOKU's HTTP notification for a checkout.
 *
 * Subscription activation happens HERE and nowhere else: the redirect back
 * from the checkout page is only a display concern (`/payment/result` reads
 * the row this endpoint writes). No query parameter, no client request and no
 * unverified payload can move money or change `profiles.plan`.
 *
 * Verification, per DOKU's non-SNAP signature docs: the `Client-Id`,
 * `Request-Id`, `Request-Timestamp` and `Signature` headers must prove an
 * HMAC-SHA256 over the exact body bytes (Digest) addressed to *our* client id
 * and *our* notification path. Anything else is a 401 before it can touch a
 * row.
 *
 * Idempotency: DOKU may deliver the same event more than once (documented
 * retry behaviour). The transition is decided from the row's *current* state,
 * so a repeat of an already-final row is acknowledged without re-activating —
 * expiry math can never run twice for one payment. If profile activation ever
 * fails after the row flipped to `paid`, the row stays `paid` (money is
 * real), the failure is audited, and an admin retry path exists via the
 * admin panel; we never roll a paid row back to pending.
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
  if (!payment) {
    // Signed by DOKU but for an order we never made (probe/stale replay):
    // acknowledge and ignore — we will not activate anything unknown.
    return json(200, { received: true, applied: false, reason: 'unknown_order' });
  }

  const amountMatches =
    notification.amount !== null && Number(payment.amount) === notification.amount;
  const transition = decideTransition({
    currentStatus: normalizeStatus(payment.status),
    notification: { status: notification.status },
    amountMatches,
  });

  if (transition.action === 'duplicate' || transition.action === 'ignore') {
    if (!amountMatches && notification.status === 'SUCCESS') {
      console.error(
        'doku-notify: amount mismatch for',
        notification.invoiceNumber,
        'notification=',
        notification.amount,
        'stored=',
        payment.amount,
      );
      await writeAudit(env, {
        actorId: payment.ownerId ?? 'system',
        actorEmail: '',
        action: 'payment.amount-mismatch',
        targetType: 'payment',
        targetId: notification.invoiceNumber,
        detail: JSON.stringify({
          notificationAmount: notification.amount,
          storedAmount: payment.amount,
        }),
      });
    }
    return json(200, { received: true, applied: false, reason: transition.action });
  }

  if (transition.action === 'expire') {
    const expired = await patchRow(auth, 'payments', payment.$id, { status: 'expired' });
    if (!expired) return apiError(500, 'validation', 'Gagal memperbarui pembayaran.');
    await writeAudit(env, {
      actorId: payment.ownerId ?? 'system',
      actorEmail: '',
      action: 'payment.expired',
      targetType: 'payment',
      targetId: payment.$id,
      detail: JSON.stringify({ plan: payment.plan }),
    });
    return json(200, { received: true, applied: true, status: 'expired' });
  }

  // --- activate ----------------------------------------------------------
  // 1. Flip the row first: it is the idempotency anchor. If the profile
  //    write below then fails, a retry sees `paid` and never double-extends
  //    the expiry; the audit row records the partial failure instead.
  const paidAt = transition.paidAt ?? new Date().toISOString();
  const flipped = await patchRow(auth, 'payments', payment.$id, {
    status: 'paid',
    paidAt,
  });
  if (!flipped) return apiError(500, 'validation', 'Gagal memperbarui pembayaran.');

  const plan = payment.plan === 'business' ? 'business' : 'pro';
  const profile = (await getRow(auth, 'profiles', payment.ownerId ?? '')) as ProfileRow | null;
  if (!profile || !payment.ownerId) {
    // Paid but no profile row to upgrade: keep the money visible as paid,
    // surface loudly for manual resolution — never fabricate a profile.
    await writeAudit(env, {
      actorId: payment.ownerId ?? 'system',
      actorEmail: '',
      action: 'payment.paid.profile-missing',
      targetType: 'payment',
      targetId: payment.$id,
      detail: JSON.stringify({ plan, paidAt }),
    });
    console.error('doku-notify: profile missing for owner', payment.ownerId);
    return json(200, { received: true, applied: false, reason: 'profile_missing' });
  }

  const expiry = computePlanExpiry({
    currentPlan: profile.plan ?? 'free',
    currentExpiresAt: profile.planExpiresAt ?? null,
    newPlan: plan,
    paidAt: new Date(paidAt),
  });
  const activated = await patchRow(auth, 'profiles', profile.$id, {
    plan,
    planExpiresAt: expiry.toISOString(),
  });
  if (!activated) {
    // Row is already `paid` (anchor above), so a DOKU retry lands on the
    // duplicate path — that would NOT heal this. Audit for the admin path.
    await writeAudit(env, {
      actorId: payment.ownerId ?? 'system',
      actorEmail: '',
      action: 'payment.paid.activation-failed',
      targetType: 'payment',
      targetId: payment.$id,
      detail: JSON.stringify({ plan, paidAt, expiry: expiry.toISOString() }),
    });
    console.error('doku-notify: profile activation failed for', payment.ownerId);
    return apiError(500, 'validation', 'Aktivasi plan gagal.');
  }

  await writeAudit(env, {
    actorId: payment.ownerId ?? 'system',
    actorEmail: '',
    action: 'payment.paid',
    targetType: 'payment',
    targetId: payment.$id,
    detail: JSON.stringify({ plan, amount: payment.amount, paidAt, expiry: expiry.toISOString() }),
  });

  return json(200, { received: true, applied: true, status: 'paid' });
};
