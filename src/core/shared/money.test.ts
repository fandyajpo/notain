import { describe, expect, it } from 'vitest';
import {
  assertRupiah,
  clampPercent,
  clampRupiah,
  formatAmountForInput,
  formatRupiah,
  parseRupiah,
} from './money';

describe('assertRupiah', () => {
  it('accepts whole finite amounts', () => {
    expect(assertRupiah(15_000)).toBe(15_000);
    expect(assertRupiah(0)).toBe(0);
  });

  it('rejects non-finite and fractional amounts', () => {
    expect(() => assertRupiah(Number.NaN)).toThrow(TypeError);
    expect(() => assertRupiah(Number.POSITIVE_INFINITY)).toThrow(TypeError);
    expect(() => assertRupiah(100.5)).toThrow(TypeError);
  });
});

describe('clampRupiah', () => {
  it('rounds and clamps into range', () => {
    expect(clampRupiah(100.4)).toBe(100);
    expect(clampRupiah(-50, 0)).toBe(0);
    expect(clampRupiah(5_000, 0, 1_000)).toBe(1_000);
  });

  it('falls back to the minimum for non-finite input', () => {
    expect(clampRupiah(Number.NaN, 0)).toBe(0);
  });
});

describe('formatRupiah', () => {
  it('formats whole Rupiah with Indonesian separators', () => {
    expect(formatRupiah(20_000)).toBe('Rp20.000');
    expect(formatRupiah(1_250_000)).toBe('Rp1.250.000');
    expect(formatRupiah(0)).toBe('Rp0');
  });

  it('does not print a fraction', () => {
    expect(formatRupiah(100.6)).toBe('Rp101');
  });
});

describe('parseRupiah', () => {
  it('reads Indonesian formatted input', () => {
    expect(parseRupiah('20.000')).toBe(20_000);
    expect(parseRupiah('Rp 1.250.000')).toBe(1_250_000);
    expect(parseRupiah('20000')).toBe(20_000);
  });

  it('returns NaN for unusable input', () => {
    expect(parseRupiah('')).toBeNaN();
    expect(parseRupiah('gratis')).toBeNaN();
    expect(parseRupiah('-')).toBeNaN();
  });
});

describe('formatAmountForInput', () => {
  it('leaves zero empty so the placeholder shows', () => {
    expect(formatAmountForInput(0)).toBe('');
  });

  it('formats a value the user can edit back', () => {
    expect(formatAmountForInput(250_000)).toBe('250.000');
    expect(parseRupiah(formatAmountForInput(250_000))).toBe(250_000);
  });
});

describe('clampPercent', () => {
  it('keeps percentages inside 0–100', () => {
    expect(clampPercent(11)).toBe(11);
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(400)).toBe(100);
    expect(clampPercent(Number.NaN)).toBe(0);
  });
});
