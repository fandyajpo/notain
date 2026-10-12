/**
 * Money is represented as whole Indonesian Rupiah. There is no fractional
 * currency in this product, so every amount is a safe integer.
 */

export type Rupiah = number;

const MAX_SAFE_RUPIAH = 1_000_000_000_000_000;

export function assertRupiah(value: number): Rupiah {
  if (!Number.isFinite(value)) {
    throw new TypeError('Amount must be a finite number.');
  }
  if (!Number.isSafeInteger(value)) {
    throw new TypeError('Amount must be a whole number of Rupiah.');
  }
  if (Math.abs(value) > MAX_SAFE_RUPIAH) {
    throw new RangeError('Amount exceeds the supported maximum.');
  }
  return value;
}

export function clampRupiah(value: number, min = 0, max = MAX_SAFE_RUPIAH): Rupiah {
  if (!Number.isFinite(value)) return min;
  const rounded = Math.round(value);
  return Math.min(Math.max(rounded, min), max);
}

const formatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** `20000` → `Rp20.000` */
export function formatRupiah(value: Rupiah): string {
  if (!Number.isFinite(value)) return 'Rp0';
  return formatter.format(Math.round(value)).replace(/\u00A0/g, '');
}

/**
 * Parses a human-entered amount such as `20.000`, `20000`, or `Rp 20.000`
 * into whole Rupiah. Returns `NaN` when the input is not a valid amount.
 */
export function parseRupiah(input: string): number {
  const cleaned = input.replace(/[^\d.,-]/g, '').trim();
  if (cleaned === '' || cleaned === '-') return Number.NaN;

  // Indonesian formatting uses `.` as the thousands separator.
  const normalized = cleaned.replace(/\./g, '').replace(/,/g, '.');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return Math.round(parsed);
}

/** Formats an amount for display inside a text input, e.g. `20000` → `20.000`. */
export function formatAmountForInput(value: Rupiah): string {
  if (!Number.isFinite(value) || value === 0) return '';
  return new Intl.NumberFormat('id-ID').format(Math.round(value));
}

/** Percentage value clamped to a sane invoice range. */
export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 100);
}
