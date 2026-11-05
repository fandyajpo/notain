import { describe, expect, it } from 'vite-plus/test';
import { PLAN_BENEFITS, PLAN_PRICES } from './plan-benefits';
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
      expect(PLAN_PRICES[tier].period).toBe('/30 hari');
    }
    expect(PLAN_PRICES.free).toEqual({ amount: 'Rp 0', period: 'selamanya' });
  });

  it('quotes the enforced free-tier limit and includes custom templates', () => {
    expect(PLAN_BENEFITS.free[0]).toBe(
      `${FREE_PLAN_LIMITS.invoicesPerMonth} nota baru per bulan`,
    );
    expect(PLAN_BENEFITS.free).toContain('Template bawaan, buat template sendiri, dan unggah logo');
    expect(PLAN_BENEFITS.pro).not.toContain('Buat template sendiri dengan warna dan logo usaha');
    expect(PLAN_BENEFITS.pro).toContain('Laporan usaha');
    expect(PLAN_BENEFITS.free.join(' ')).not.toContain('Dukungan prioritas');
    expect(PLAN_BENEFITS.pro.join(' ')).not.toContain('Dukungan prioritas');
  });

});
