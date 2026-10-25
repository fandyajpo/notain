import { describe, expect, it } from 'vite-plus/test';
import { PLAN_BENEFITS, PLAN_PRICES, yearlySavingNote } from './plan-benefits';
import { FREE_PLAN_LIMITS, PAID_PLANS } from './plans';

/**
 * The pricing page's copy and the checkout's catalog are two views of one
 * product truth. These tests are the drift guard: they fail the moment the
 * display price, the server price, or the free-tier benefit line disagree —
 * which is exactly the bug a hand-typed "Rp 49.000" next to a programmatic
 * `49_000` would otherwise ship.
 */
describe('plan display copy', () => {
  it('prints exactly the amount checkout charges, in Rupiah form', () => {
    for (const tier of ['pro', 'business'] as const) {
      const printed = Number(PLAN_PRICES[tier].amount.replace(/[^0-9]/g, ''));
      expect(printed).toBe(PAID_PLANS[tier].priceIdr);
      expect(PLAN_PRICES[tier].period).toBe('/bulan');
    }
    expect(PLAN_PRICES.free).toEqual({ amount: 'Rp 0', period: 'selamanya' });
  });

  it('quotes the enforced free-tier limit, not a typed copy of it', () => {
    expect(PLAN_BENEFITS.free[0]).toBe(
      `${FREE_PLAN_LIMITS.invoicesPerMonth} invoice baru per bulan`,
    );
  });

  it('derives the yearly saving from the monthly price', () => {
    // 12 × 49.000 = 588.000 − 490.000, computed rather than hand-written.
    expect(yearlySavingNote('pro')).toBe(
      'Rp 490.000 / tahun — hemat Rp 98.000 dibanding pembayaran bulanan selama 12 bulan.',
    );
    expect(yearlySavingNote('business')).toBe(
      'Rp 990.000 / tahun — hemat Rp 198.000 dibanding pembayaran bulanan selama 12 bulan.',
    );
  });

  it('has no annual figure for the free tier', () => {
    // `yearlySavingNote` only takes paid tiers, so the guard here is that
    // free's monthly price really is zero — a nonzero free price would make
    // every derived comparison meaningless.
    expect(PLAN_PRICES.free.amount).toMatch(/\b0\b/);
  });
});
