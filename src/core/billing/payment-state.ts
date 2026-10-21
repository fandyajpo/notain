/**
 * The payment-row state machine behind the DOKU notification handler.
 *
 * A row starts `pending` when the checkout is created and may only move
 * forward: `pending → paid | expired`. `paid` is terminal — a duplicate or
 * replayed notification for an already-paid row is acknowledged and does
 * nothing, which is what makes the webhook idempotent. Nothing ever moves a
 * row *back* to pending, and nothing moves a row to paid except a verified
 * SUCCESS notification (or the Check Status reconciliation that reuses the
 * same decision).
 *
 * Per DOKU's Checkout guidance, `FAILED` notifications are ignored: inside
 * one checkout session the customer may switch payment methods, so a FAILED
 * for one channel is not a failed order.
 */

import type { DokuNotification } from './doku';

export type PaymentStatus = 'pending' | 'paid' | 'expired';

export type PaymentTransition =
  /** Verified success: activate the subscription. */
  | { action: 'activate'; paidAt: string | null }
  /** Order outlived its due date without payment. */
  | { action: 'expire' }
  /** Duplicate/replay of an already-final row — ack and stop. */
  | { action: 'duplicate' }
  /** Nothing to do (FAILED, PENDING, or other non-final channel states). */
  | { action: 'ignore'; reason: string };

/**
 * Decides what one notification means for one payment row.
 *
 * `amountMatches` is the caller's comparison of the notification's
 * `order.amount` against the amount *we* stored when creating the order —
 * the trusted value from the plan catalog. A mismatch is never activated: it
 * would mean the order was created for a different amount than we intend to
 * honour, and silently accepting it would grant a plan on terms we never
 * priced. Such rows are ignored (and left pending for manual review) rather
 * than expired, because the honest outcome is unknown.
 */
export function decideTransition(input: {
  currentStatus: PaymentStatus;
  notification: Pick<DokuNotification, 'status'>;
  amountMatches: boolean;
  now?: Date;
}): PaymentTransition {
  const now = input.now ?? new Date();

  switch (input.notification.status) {
    case 'SUCCESS': {
      if (input.currentStatus === 'paid') return { action: 'duplicate' };
      if (!input.amountMatches) return { action: 'ignore', reason: 'amount_mismatch' };
      if (input.currentStatus === 'expired') {
        // Paid after we marked it expired (slow channel / late settlement).
        // The money is real: activate anyway rather than lose the payment.
        return { action: 'activate', paidAt: now.toISOString() };
      }
      return { action: 'activate', paidAt: now.toISOString() };
    }
    case 'EXPIRED': {
      if (input.currentStatus === 'pending') return { action: 'expire' };
      return { action: 'duplicate' };
    }
    case 'FAILED':
      return { action: 'ignore', reason: 'checkout_failed_is_retryable' };
    default:
      return { action: 'ignore', reason: `status_${input.notification.status.toLowerCase()}` };
  }
}
