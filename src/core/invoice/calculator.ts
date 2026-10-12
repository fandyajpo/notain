import { clampPercent, clampRupiah, type Rupiah } from '../shared/money';
import type { InvoiceAdjustment, InvoiceItem } from './model';

/**
 * Every number shown on an invoice comes from this module. UI code must never
 * re-implement arithmetic — it only renders what these functions return.
 */

export type InvoiceTotals = {
  /** Per-line subtotals, index-aligned with the items passed in. */
  itemSubtotals: Rupiah[];
  subtotal: Rupiah;
  discountAmount: Rupiah;
  taxableAmount: Rupiah;
  taxAmount: Rupiah;
  grandTotal: Rupiah;
};

export function calculateItemSubtotal(item: Pick<InvoiceItem, 'quantity' | 'unitPrice'>): Rupiah {
  return clampRupiah(item.quantity * item.unitPrice);
}

/**
 * Resolves an adjustment (fixed amount or percentage) into a concrete amount.
 * Percentages are applied to `base` and rounded to whole Rupiah.
 */
export function resolveAdjustment(adjustment: InvoiceAdjustment, base: Rupiah): Rupiah {
  if (adjustment.type === 'percent') {
    return clampRupiah((base * clampPercent(adjustment.value)) / 100, 0, Math.max(base, 0));
  }
  return clampRupiah(adjustment.value, 0, Math.max(base, 0));
}

/**
 * Computes the full financial summary of an invoice.
 *
 * ```
 * item subtotal = quantity × unit price
 * subtotal      = Σ item subtotals
 * discount      = resolve(discount, subtotal)
 * taxable       = subtotal − discount
 * tax           = resolve(tax, taxable)
 * grand total   = taxable + tax
 * ```
 */
export function calculateTotals(input: {
  items: ReadonlyArray<Pick<InvoiceItem, 'quantity' | 'unitPrice'>>;
  discount: InvoiceAdjustment;
  tax: InvoiceAdjustment;
}): InvoiceTotals {
  const itemSubtotals = input.items.map(calculateItemSubtotal);
  const subtotal = clampRupiah(itemSubtotals.reduce((sum, value) => sum + value, 0));

  const discountAmount = resolveAdjustment(input.discount, subtotal);
  const taxableAmount = clampRupiah(subtotal - discountAmount, 0);
  const taxAmount = resolveAdjustment(input.tax, taxableAmount);
  const grandTotal = clampRupiah(taxableAmount + taxAmount, 0);

  return {
    itemSubtotals,
    subtotal,
    discountAmount,
    taxableAmount,
    taxAmount,
    grandTotal,
  };
}
