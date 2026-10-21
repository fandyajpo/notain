import { describe, expect, it } from 'vite-plus/test';
import {
  computePlanExpiry,
  isPaidPlan,
  isSubscriptionActive,
  makeInvoiceNumber,
  PAID_PLANS,
  planAmount,
  planRank,
  PLAN_PERIOD_MS,
} from './plans';

describe('plan catalog', () => {
  it('prices match the public pricing page copy', () => {
    expect(PAID_PLANS.pro.priceIdr).toBe(29_000);
    expect(PAID_PLANS.business.priceIdr).toBe(99_000);
  });

  it('accepts only paid plan ids', () => {
    expect(isPaidPlan('pro')).toBe(true);
    expect(isPaidPlan('business')).toBe(true);
    expect(isPaidPlan('free')).toBe(false);
    expect(isPaidPlan('')).toBe(false);
    expect(isPaidPlan(29_000)).toBe(false);
  });

  it('reads amounts from the catalog only', () => {
    expect(planAmount('pro')).toBe(29_000);
    expect(planAmount('business')).toBe(99_000);
  });

  it('ranks plans for downgrade protection', () => {
    expect(planRank('free')).toBeLessThan(planRank('pro'));
    expect(planRank('pro')).toBeLessThan(planRank('business'));
  });
});

describe('isSubscriptionActive', () => {
  const now = new Date('2026-10-21T00:00:00.000Z');

  it('never activates free, missing, or junk plans', () => {
    expect(isSubscriptionActive('free', null, now)).toBe(false);
    expect(isSubscriptionActive(null, null, now)).toBe(false);
    expect(isSubscriptionActive(undefined, '2999-01-01', now)).toBe(false);
    expect(isSubscriptionActive('<script>', '2999-01-01', now)).toBe(false);
  });

  it('treats a paid plan with no expiry as lifetime', () => {
    expect(isSubscriptionActive('pro', null, now)).toBe(true);
    expect(isSubscriptionActive('business', '', now)).toBe(true);
  });

  it('compares the stored expiry to now', () => {
    expect(isSubscriptionActive('pro', '2999-01-01T00:00:00.000Z', now)).toBe(true);
    expect(isSubscriptionActive('pro', '2020-01-01T00:00:00.000Z', now)).toBe(false);
    // An unparseable date is not "lifetime" — it is not active.
    expect(isSubscriptionActive('pro', 'not-a-date', now)).toBe(false);
  });
});

describe('computePlanExpiry', () => {
  const paidAt = new Date('2026-10-20T10:00:00.000Z');

  it('starts a fresh period for a first purchase', () => {
    const expiry = computePlanExpiry({
      currentPlan: 'free',
      currentExpiresAt: null,
      newPlan: 'pro',
      paidAt,
    });
    expect(expiry.getTime()).toBe(paidAt.getTime() + PLAN_PERIOD_MS);
  });

  it('extends a still-active renewal from its current expiry, not payment time', () => {
    const currentExpiry = new Date('2026-11-05T00:00:00.000Z');
    const expiry = computePlanExpiry({
      currentPlan: 'pro',
      currentExpiresAt: currentExpiry.toISOString(),
      newPlan: 'pro',
      paidAt, // paid 16 days early
    });
    expect(expiry.getTime()).toBe(currentExpiry.getTime() + PLAN_PERIOD_MS);
  });

  it('treats an expired plan like a fresh purchase', () => {
    const expired = new Date('2026-10-01T00:00:00.000Z');
    const expiry = computePlanExpiry({
      currentPlan: 'pro',
      currentExpiresAt: expired.toISOString(),
      newPlan: 'pro',
      paidAt,
    });
    expect(expiry.getTime()).toBe(paidAt.getTime() + PLAN_PERIOD_MS);
  });

  it('starts a fresh period on upgrade even when the old plan is active', () => {
    const currentExpiry = new Date('2026-11-05T00:00:00.000Z');
    const expiry = computePlanExpiry({
      currentPlan: 'pro',
      currentExpiresAt: currentExpiry.toISOString(),
      newPlan: 'business',
      paidAt,
    });
    expect(expiry.getTime()).toBe(paidAt.getTime() + PLAN_PERIOD_MS);
  });
});

describe('makeInvoiceNumber', () => {
  const now = new Date('2026-10-20T10:00:00.000Z');

  it('fits DOKU’s 30-char credit-card limit and stays alphanumeric', () => {
    const number = makeInvoiceNumber('business', { now, randomHex: () => 'AABBCCDD' });
    expect(number.length).toBeLessThanOrEqual(30);
    expect(number).toMatch(/^[A-Z0-9-]+$/);
    expect(number.startsWith('NOTAIN-B-')).toBe(true);
  });

  it('embeds randomness so two checkouts never collide', () => {
    const a = makeInvoiceNumber('pro', { now, randomHex: () => '11111111' });
    const b = makeInvoiceNumber('pro', { now, randomHex: () => '22222222' });
    expect(a).not.toBe(b);
    expect(a.startsWith('NOTAIN-P-')).toBe(true);
  });
});
