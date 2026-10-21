import { describe, expect, it } from 'vitest';
import { decideTransition } from './payment-state';

describe('decideTransition', () => {
  const now = new Date('2026-10-20T10:05:00.000Z');

  it('activates a pending row on verified SUCCESS', () => {
    expect(
      decideTransition({
        currentStatus: 'pending',
        notification: { status: 'SUCCESS' },
        amountMatches: true,
        now,
      }),
    ).toEqual({ action: 'activate', paidAt: '2026-10-20T10:05:00.000Z' });
  });

  it('treats SUCCESS on an already-paid row as a duplicate (idempotency)', () => {
    expect(
      decideTransition({
        currentStatus: 'paid',
        notification: { status: 'SUCCESS' },
        amountMatches: true,
        now,
      }),
    ).toEqual({ action: 'duplicate' });
  });

  it('never activates on an amount mismatch', () => {
    const decision = decideTransition({
      currentStatus: 'pending',
      notification: { status: 'SUCCESS' },
      amountMatches: false,
      now,
    });
    expect(decision).toEqual({ action: 'ignore', reason: 'amount_mismatch' });
  });

  it('activates a late SUCCESS after expiry rather than losing real money', () => {
    expect(
      decideTransition({
        currentStatus: 'expired',
        notification: { status: 'SUCCESS' },
        amountMatches: true,
        now,
      }),
    ).toEqual({ action: 'activate', paidAt: '2026-10-20T10:05:00.000Z' });
  });

  it('expires a pending row on EXPIRED and treats repeats as duplicates', () => {
    expect(
      decideTransition({
        currentStatus: 'pending',
        notification: { status: 'EXPIRED' },
        amountMatches: true,
        now,
      }),
    ).toEqual({ action: 'expire' });
    expect(
      decideTransition({
        currentStatus: 'expired',
        notification: { status: 'EXPIRED' },
        amountMatches: true,
        now,
      }),
    ).toEqual({ action: 'duplicate' });
  });

  it('ignores FAILED — DOKU Checkout lets the customer retry another channel', () => {
    expect(
      decideTransition({
        currentStatus: 'pending',
        notification: { status: 'FAILED' },
        amountMatches: true,
        now,
      }),
    ).toEqual({ action: 'ignore', reason: 'checkout_failed_is_retryable' });
  });

  it('ignores PENDING and unknown statuses without touching the row', () => {
    for (const status of ['PENDING', 'TIMEOUT', 'REDIRECT', 'UNKNOWN'] as const) {
      expect(
        decideTransition({
          currentStatus: 'pending',
          notification: { status },
          amountMatches: true,
          now,
        }).action,
      ).toBe('ignore');
    }
  });
});
