import { getRow, patchRow, type TableAuth } from './rows';
import { writeAudit } from './audit';
import { computePlanExpiry } from '../../src/core/billing/plans';
import { decideTransition } from '../../src/core/billing/payment-state';
import type { DokuNotification } from '../../src/core/billing/doku';
import type { Env } from './types';

/**
 * The one place a payment row is allowed to move and a plan is allowed to be
 * activated. Two callers feed it, and both must behave identically because
 * they carry the same authority:
 *
 * - `POST /api/payments/doku-notify` — DOKU's HTTP notification, proven by the
 *   signature over the raw request body.
 * - `GET /api/payments/status` — our own Check Status probe, proven by having
 *   chosen the fixed HTTPS endpoint and asked about a row we already own.
 *
 * In both cases the payload is DOKU's, never the client's: a redirect
 * parameter, a query string or a browser request still cannot move money or
 * change `profiles.plan`. Everything downstream of `settlePayment` therefore
 * trusts `payment` (our own row) and `notification` (verified DOKU data) and
 * nothing else.
 *
 * Idempotency: the transition is decided from the row's *current* state, so a
 * repeat of an already-final row is acknowledged without re-activating — expiry
 * math can never run twice for one payment. The payment row is flipped to
 * `paid` *before* the profile write: that flip is the anchor, so if activation
 * then fails a retry sees `paid` and never double-extends the expiry. The
 * failure is audited (`payment.paid.activation-failed`) for manual resolution;
 * a paid row is never rolled back to pending, because the money is real.
 */

export type PaymentRow = {
  $id: string;
  ownerId?: string | null;
  plan?: string | null;
  amount?: number | null;
  status?: string | null;
  paidAt?: string | null;
};

export type ProfileRow = {
  $id: string;
  plan?: string | null;
  planExpiresAt?: string | null;
};

export type SettleOutcome =
  /** Signed by DOKU but for an order we never made — ignore it. */
  | { kind: 'unknown_order' }
  /** Nothing to do: duplicate, or a non-final channel state (FAILED, PENDING…). */
  | { kind: 'noop'; reason: string }
  /** Order outlived its due date without payment. */
  | { kind: 'expired' }
  /** Payment recorded and the profile upgraded. */
  | { kind: 'paid'; paidAt: string; plan: string; expiry: string }
  /** Row is `paid` but no profile exists to upgrade — manual resolution. */
  | { kind: 'profile_missing'; paidAt: string }
  /** The payment row itself could not be written; the caller decides. */
  | { kind: 'error'; message: string };

/** Payment states this module knows how to act on. */
function normalizeStatus(value: unknown): 'pending' | 'paid' | 'expired' {
  return value === 'paid' || value === 'expired' ? value : 'pending';
}

export async function settlePayment(
  env: Env,
  auth: TableAuth,
  payment: PaymentRow | null,
  notification: DokuNotification,
): Promise<SettleOutcome> {
  if (!payment) {
    // Verified by DOKU but for an order we never made (probe/stale replay):
    // acknowledge and ignore — we will not activate anything unknown.
    return { kind: 'unknown_order' };
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
        'payments: amount mismatch for',
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
        targetId: notification.invoiceNumber ?? payment.$id,
        detail: JSON.stringify({
          notificationAmount: notification.amount,
          storedAmount: payment.amount,
        }),
      });
    }
    return { kind: 'noop', reason: transition.action };
  }

  if (transition.action === 'expire') {
    const expired = await patchRow(auth, 'payments', payment.$id, { status: 'expired' });
    if (!expired) return { kind: 'error', message: 'Gagal memperbarui pembayaran.' };
    await writeAudit(env, {
      actorId: payment.ownerId ?? 'system',
      actorEmail: '',
      action: 'payment.expired',
      targetType: 'payment',
      targetId: payment.$id,
      detail: JSON.stringify({ plan: payment.plan }),
    });
    return { kind: 'expired' };
  }

  // --- activate ----------------------------------------------------------
  const paidAt = transition.paidAt ?? new Date().toISOString();
  const flipped = await patchRow(auth, 'payments', payment.$id, {
    status: 'paid',
    paidAt,
  });
  if (!flipped) return { kind: 'error', message: 'Gagal memperbarui pembayaran.' };

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
    console.error('payments: profile missing for owner', payment.ownerId);
    return { kind: 'profile_missing', paidAt };
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
    console.error('payments: profile activation failed for', payment.ownerId);
    return { kind: 'error', message: 'Aktivasi plan gagal.' };
  }

  await writeAudit(env, {
    actorId: payment.ownerId ?? 'system',
    actorEmail: '',
    action: 'payment.paid',
    targetType: 'payment',
    targetId: payment.$id,
    detail: JSON.stringify({ plan, amount: payment.amount, paidAt, expiry: expiry.toISOString() }),
  });

  return { kind: 'paid', paidAt, plan, expiry: expiry.toISOString() };
}
