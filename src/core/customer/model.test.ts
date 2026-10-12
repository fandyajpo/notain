import { describe, expect, it } from 'vitest';
import { CUSTOMER_LIMITS, customerKey, normalizePhone } from './model';

describe('normalizePhone', () => {
  it('drops every non-digit and folds the trunk prefix', () => {
    // `+62 812-3456-7890` and `081234567890` are the same number, and the
    // folded form is what the key is built from.
    expect(normalizePhone('+62 812-3456-7890')).toBe('081234567890');
  });

  it('strips punctuation without touching an already-local number', () => {
    expect(normalizePhone('0812-3456-7890')).toBe('081234567890');
  });

  it('folds the 62 trunk prefix into a leading 0', () => {
    expect(normalizePhone('6281234567890')).toBe('081234567890');
  });

  it('leaves a local 0-prefixed number alone', () => {
    expect(normalizePhone('081234567890')).toBe('081234567890');
  });

  it('does not fold a number that merely starts with 62 but is too short to be one', () => {
    // A three-digit "62…" is somebody's extension, not a country code.
    expect(normalizePhone('62')).toBe('62');
    expect(normalizePhone('6200')).toBe('6200');
  });

  it('treats an empty or blank number as no number', () => {
    expect(normalizePhone('')).toBe('');
    expect(normalizePhone(' - ')).toBe('');
  });
});

describe('customerKey', () => {
  it('ignores case and surrounding whitespace in the name', () => {
    expect(customerKey({ name: '  BUDI santoso ', phone: '' })).toBe(
      customerKey({ name: 'budi Santoso', phone: '' }),
    );
  });

  it('treats the same person written with either trunk prefix as one', () => {
    expect(customerKey({ name: 'Budi', phone: '081234567890' })).toBe(
      customerKey({ name: 'Budi', phone: '+62 812-3456-7890' }),
    );
  });

  it('separates two people who share a name but not a number', () => {
    expect(customerKey({ name: 'Budi', phone: '081234567890' })).not.toBe(
      customerKey({ name: 'Budi', phone: '081299990000' }),
    );
  });
});

describe('CUSTOMER_LIMITS', () => {
  it('matches the Appwrite column bounds', () => {
    expect(CUSTOMER_LIMITS).toEqual({ name: 128, phone: 32 });
  });
});
