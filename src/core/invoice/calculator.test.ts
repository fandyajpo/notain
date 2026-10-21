import { describe, expect, it } from 'vite-plus/test';
import { calculateItemSubtotal, calculateTotals, resolveAdjustment } from './calculator';
import { EMPTY_ADJUSTMENT } from './model';

const amount = (value: number) => ({ type: 'amount' as const, value });
const percent = (value: number) => ({ type: 'percent' as const, value });

describe('calculateItemSubtotal', () => {
  it('multiplies quantity by unit price', () => {
    expect(calculateItemSubtotal({ quantity: 3, unitPrice: 25_000 })).toBe(75_000);
  });

  it('rounds to whole Rupiah', () => {
    expect(calculateItemSubtotal({ quantity: 1, unitPrice: 100.4 })).toBe(100);
  });
});

describe('resolveAdjustment', () => {
  it('resolves a percentage against the base', () => {
    expect(resolveAdjustment(percent(10), 200_000)).toBe(20_000);
  });

  it('passes a fixed amount through, capped at the base', () => {
    expect(resolveAdjustment(amount(5_000), 200_000)).toBe(5_000);
    expect(resolveAdjustment(amount(999_999), 200_000)).toBe(200_000);
  });

  it('clamps out-of-range percentages to 0–100', () => {
    expect(resolveAdjustment(percent(150), 100_000)).toBe(100_000);
    expect(resolveAdjustment(percent(-20), 100_000)).toBe(0);
  });

  it('never resolves below zero for an empty base', () => {
    expect(resolveAdjustment(amount(1_000), 0)).toBe(0);
    expect(resolveAdjustment(percent(11), 0)).toBe(0);
  });
});

describe('calculateTotals', () => {
  const items = [
    { quantity: 2, unitPrice: 25_000 },
    { quantity: 3, unitPrice: 8_000 },
  ];

  it('sums item subtotals without discount or tax', () => {
    const totals = calculateTotals({ items, discount: EMPTY_ADJUSTMENT, tax: EMPTY_ADJUSTMENT });
    expect(totals.itemSubtotals).toEqual([50_000, 24_000]);
    expect(totals.subtotal).toBe(74_000);
    expect(totals.grandTotal).toBe(74_000);
  });

  it('applies a percentage discount before tax', () => {
    const totals = calculateTotals({ items, discount: percent(10), tax: percent(11) });
    // subtotal 74_000 → −10% = 66_600 → +11% = 73_926
    expect(totals.discountAmount).toBe(7_400);
    expect(totals.taxableAmount).toBe(66_600);
    expect(totals.taxAmount).toBe(7_326);
    expect(totals.grandTotal).toBe(73_926);
  });

  it('applies a fixed discount against the subtotal only', () => {
    const totals = calculateTotals({ items, discount: amount(4_000), tax: amount(1_000) });
    expect(totals.discountAmount).toBe(4_000);
    expect(totals.taxableAmount).toBe(70_000);
    expect(totals.taxAmount).toBe(1_000);
    expect(totals.grandTotal).toBe(71_000);
  });

  it('returns zeros for an empty invoice', () => {
    const totals = calculateTotals({ items: [], discount: percent(10), tax: percent(11) });
    expect(totals.subtotal).toBe(0);
    expect(totals.grandTotal).toBe(0);
  });

  it('never lets a discount exceed the subtotal', () => {
    const totals = calculateTotals({ items, discount: amount(1_000_000), tax: EMPTY_ADJUSTMENT });
    expect(totals.discountAmount).toBe(74_000);
    expect(totals.grandTotal).toBe(0);
  });

  it('always returns whole Rupiah amounts', () => {
    const totals = calculateTotals({
      items: [{ quantity: 3, unitPrice: 3_333 }],
      discount: percent(7),
      tax: percent(11),
    });
    for (const value of Object.values(totals).flatMap((v) => (Array.isArray(v) ? v : [v]))) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});
