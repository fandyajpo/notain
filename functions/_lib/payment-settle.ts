import { getRow, patchRow, type TableAuth } from './rows';
import { writeAudit } from './audit';
import { computePlanExpiry, isSubscriptionActive, planRank } from '../../src/core/billing/plans';
import { decideTransition } from '../../src/core/billing/payment-state';
import type { DokuNotification } from '../../src/core/billing/doku';
import type { Env } from './types';

/**
 * The one place a payment row is allowed to move and a plan is allowed to be
 * activated. Both the signed webhook and our authenticated Check Status probe
 * feed it, so they share the same trust boundary and retry behavior.
 *
 * A verified payment is recorded as `paid` before activation. Activation is a
 * separate, persisted state (`pending` → `active`) with a frozen target plan
 * and expiry. If the organization write fails or the Worker stops between the
 * writes, either payment path can retry that exact target without extending a
 * subscription twice. The paid state is never rolled back: the money is real.
 */

export type PaymentRow = {
  $id: string;
  orgId?: string | null;
  ownerId?: string | null;
  plan?: string | null;
  amount?: number | null;
  status?: string | null;
  paidAt?: string | null;
  planAtCheckout?: string | null;
  planExpiresAtSnapshot?: string | null;
  activationStatus?: string | null;
  activationPlan?: string | null;
  activationExpiresAt?: string | null;
  activationRetryAfter?: string | null;
  activationError?: string | null;
};

export type OrgRow = {
  $id: string;
  plan?: string | null;
  planExpiresAt?: string | null;
};

export type SettleOutcome =
  | { kind: 'unknown_order' }
  | { kind: 'noop'; reason: string }
  | { kind: 'expired' }
  | { kind: 'paid'; paidAt: string; plan: string; expiry: string }
  | { kind: 'org_missing'; paidAt: string }
  | { kind: 'activation_pending'; paidAt: string }
  | { kind: 'error'; message: string };

/** Payment states this module knows how to act on. */
function normalizeStatus(value: unknown): 'pending' | 'paid' | 'expired' {
  return value === 'paid' || value === 'expired' ? value : 'pending';
}

function paidPlan(value: unknown): 'pro' | 'business' {
  return value === 'business' ? 'business' : 'pro';
}

const ACTIVATION_RETRY_DELAY_MS = 15_000;

export async function settlePayment(
  env: Env,
  auth: TableAuth,
  payment: PaymentRow | null,
  notification: DokuNotification,
): Promise<SettleOutcome> {
  if (!payment) return { kind: 'unknown_order' };

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

    if (
      transition.action === 'duplicate' &&
      payment.status === 'paid' &&
      notification.status === 'SUCCESS' &&
      amountMatches &&
      payment.activationStatus !== 'active'
    ) {
      return activatePaidPayment(env, auth, payment, payment.paidAt ?? new Date().toISOString());
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

  // Record the confirmed money first, then make plan activation recoverable.
  const paidAt = transition.paidAt ?? payment.paidAt ?? new Date().toISOString();
  const flipped = await patchRow(auth, 'payments', payment.$id, {
    status: 'paid',
    paidAt,
    activationStatus: 'pending',
    activationError: null,
    activationRetryAfter: null,
  });
  if (!flipped) return { kind: 'error', message: 'Gagal memperbarui pembayaran.' };

  return activatePaidPayment(
    env,
    auth,
    {
      ...payment,
      status: 'paid',
      paidAt,
      activationStatus: 'pending',
      activationRetryAfter: null,
    },
    paidAt,
  );
}

async function activatePaidPayment(
  env: Env,
  auth: TableAuth,
  payment: PaymentRow,
  paidAt: string,
): Promise<SettleOutcome> {
  const retryAfter = payment.activationRetryAfter ? Date.parse(payment.activationRetryAfter) : NaN;
  if (Number.isFinite(retryAfter) && retryAfter > Date.now()) {
    return { kind: 'activation_pending', paidAt };
  }

  const plan = paidPlan(payment.plan);
  const org = payment.orgId
    ? ((await getRow(auth, 'organizations', payment.orgId)) as OrgRow | null)
    : null;
  if (!org) {
    await deferActivation(auth, payment, 'organization_missing');
    await writeActivationFailure(env, payment, 'organization_missing');
    console.error('payments: organization missing for payment', payment.$id, payment.orgId);
    return { kind: 'org_missing', paidAt };
  }

  let activationPlan = payment.activationPlan;
  let activationExpiresAt = payment.activationExpiresAt;
  const hasTarget =
    activationPlan === 'pro' || activationPlan === 'business'
      ? typeof activationExpiresAt === 'string' && Number.isFinite(Date.parse(activationExpiresAt))
      : false;

  // Old paid rows predate the activation marker. If their organization already
  // has an active plan at least as strong as this order, preserve that state
  // instead of calculating a second renewal from a later live expiry.
  const hasCheckoutSnapshot = 'planExpiresAtSnapshot' in payment;
  if (
    !hasTarget &&
    payment.activationStatus == null &&
    !hasCheckoutSnapshot &&
    planRank(org.plan ?? 'free') >= planRank(plan) &&
    isSubscriptionActive(org.plan, org.planExpiresAt)
  ) {
    const expiry = org.planExpiresAt ?? '';
    const marked = await patchRow(auth, 'payments', payment.$id, {
      activationStatus: 'active',
      activationPlan: plan,
      activationExpiresAt: expiry,
      activationRetryAfter: null,
      activationError: null,
    });
    if (!marked) return { kind: 'activation_pending', paidAt };
    return { kind: 'paid', paidAt, plan, expiry };
  }

  if (!hasTarget) {
    const baselinePlan = hasCheckoutSnapshot
      ? (payment.planAtCheckout ?? 'free')
      : (org.plan ?? 'free');
    const baselineExpiry = hasCheckoutSnapshot
      ? (payment.planExpiresAtSnapshot ?? null)
      : (org.planExpiresAt ?? null);
    activationPlan = plan;
    activationExpiresAt = computePlanExpiry({
      currentPlan: baselinePlan,
      currentExpiresAt: baselineExpiry,
      newPlan: plan,
      paidAt: new Date(paidAt),
    }).toISOString();
  }

  const nextRetryAt = new Date(Date.now() + ACTIVATION_RETRY_DELAY_MS).toISOString();
  const prepared = await patchRow(auth, 'payments', payment.$id, {
    activationStatus: 'pending',
    activationPlan,
    activationExpiresAt,
    activationRetryAfter: nextRetryAt,
    activationError: null,
  });
  if (!prepared) return { kind: 'activation_pending', paidAt };

  const targetExpiryMs = Date.parse(activationExpiresAt!);
  const currentExpiryMs =
    org.planExpiresAt == null || org.planExpiresAt === ''
      ? Number.POSITIVE_INFINITY
      : Date.parse(org.planExpiresAt);
  const alreadyCovered =
    planRank(org.plan ?? 'free') >= planRank(activationPlan!) &&
    isSubscriptionActive(org.plan, org.planExpiresAt) &&
    currentExpiryMs >= targetExpiryMs;

  if (!alreadyCovered) {
    const activated = await patchRow(auth, 'organizations', org.$id, {
      plan: activationPlan,
      planExpiresAt: activationExpiresAt,
    });
    if (!activated) {
      await deferActivation(auth, payment, 'organization_update_failed');
      await writeActivationFailure(env, payment, 'organization_update_failed');
      console.error('payments: org activation failed for', payment.orgId);
      return { kind: 'activation_pending', paidAt };
    }
  }

  const marked = await patchRow(auth, 'payments', payment.$id, {
    activationStatus: 'active',
    activationRetryAfter: null,
    activationError: null,
  });
  if (!marked) {
    await deferActivation(auth, payment, 'activation_marker_update_failed');
    await writeActivationFailure(env, payment, 'activation_marker_update_failed');
    return { kind: 'activation_pending', paidAt };
  }

  await writeAudit(env, {
    actorId: payment.ownerId ?? 'system',
    actorEmail: '',
    action: 'payment.paid',
    targetType: 'payment',
    targetId: payment.$id,
    detail: JSON.stringify({
      plan: activationPlan,
      amount: payment.amount,
      paidAt,
      expiry: activationExpiresAt,
    }),
  });

  return { kind: 'paid', paidAt, plan: activationPlan!, expiry: activationExpiresAt! };
}

async function deferActivation(
  auth: TableAuth,
  payment: PaymentRow,
  reason: string,
): Promise<void> {
  const retryAfter = new Date(Date.now() + ACTIVATION_RETRY_DELAY_MS).toISOString();
  const updated = await patchRow(auth, 'payments', payment.$id, {
    activationStatus: 'pending',
    activationRetryAfter: retryAfter,
    activationError: reason,
  });
  if (!updated) {
    console.error('payments: could not persist activation retry state for', payment.$id);
  }
}

async function writeActivationFailure(
  env: Env,
  payment: PaymentRow,
  reason: string,
): Promise<void> {
  await writeAudit(env, {
    actorId: payment.ownerId ?? 'system',
    actorEmail: '',
    action: 'payment.paid.activation-failed',
    targetType: 'payment',
    targetId: payment.$id,
    detail: JSON.stringify({ reason, orgId: payment.orgId ?? null }),
  });
}
