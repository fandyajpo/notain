import { describe, expect, it } from 'vitest';
import {
  CUSTOMER_LIMITS,
  customerIdentity,
  isSameCustomer,
  mergeCustomer,
  normalizePhone,
} from './model';

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

describe('customerIdentity', () => {
  it('prefers email when present', () => {
    expect(customerIdentity({ email: 'Budi@Mail.com', phone: '0812' })).toBe('email:budi@mail.com');
  });

  it('falls back to folded phone when there is no email', () => {
    expect(customerIdentity({ email: '', phone: '+62 812-3456-7890' })).toBe(
      'phone:081234567890',
    );
  });

  it('returns null when there is neither email nor phone', () => {
    expect(customerIdentity({ email: '', phone: '' })).toBeNull();
  });
});

describe('isSameCustomer', () => {
  it('matches when both email and phone are identical', () => {
    expect(
      isSameCustomer(
        { email: 'a@mail.com', phone: '0812' },
        { email: 'a@mail.com', phone: '0812' },
      ),
    ).toBe(true);
  });

  it('matches on the same email when both have no phone', () => {
    expect(
      isSameCustomer({ email: 'Budi@Mail.com', phone: '' }, { email: 'budi@mail.com', phone: '' }),
    ).toBe(true);
  });

  it('matches on the same phone when both have no email', () => {
    expect(
      isSameCustomer({ email: '', phone: '081234567890' }, { email: '', phone: '+62 812-3456-7890' }),
    ).toBe(true);
  });

  it('separates the same email with a different phone', () => {
    // The core rule: same email but different phone number is a different
    // person and may coexist.
    expect(
      isSameCustomer(
        { email: 'budi@gmail.com', phone: '08111' },
        { email: 'budi@gmail.com', phone: '08222' },
      ),
    ).toBe(false);
  });

  it('separates the same phone with a different email', () => {
    expect(
      isSameCustomer(
        { email: 'a@mail.com', phone: '0812' },
        { email: 'b@mail.com', phone: '0812' },
      ),
    ).toBe(false);
  });

  it('separates the same email when only one side has a phone', () => {
    expect(
      isSameCustomer(
        { email: 'a@mail.com', phone: '0812' },
        { email: 'a@mail.com', phone: '' },
      ),
    ).toBe(false);
  });

  it('separates two people who share a name but not email or phone', () => {
    expect(
      isSameCustomer(
        { email: 'a@mail.com', phone: '0812' },
        { email: 'b@mail.com', phone: '0899' },
      ),
    ).toBe(false);
  });

  it('never matches a contact that has neither email nor phone', () => {
    expect(isSameCustomer({ email: '', phone: '' }, { email: '', phone: '' })).toBe(false);
    expect(isSameCustomer({ email: '', phone: '' }, { email: 'a@mail.com', phone: '' })).toBe(
      false,
    );
  });
});

describe('mergeCustomer', () => {
  it('fills empty fields from the incoming draft', () => {
    expect(
      mergeCustomer(
        { name: 'Budi', email: '', phone: '0812' },
        { name: 'B. Santoso', email: 'budi@mail.com', phone: '' },
      ),
    ).toEqual({ name: 'Budi', email: 'budi@mail.com', phone: '0812' });
  });

  it('never overwrites a field the existing contact already has', () => {
    expect(
      mergeCustomer(
        { name: 'Budi', email: 'old@mail.com', phone: '0812' },
        { name: 'Budi Baru', email: 'new@mail.com', phone: '0899' },
      ),
    ).toEqual({ name: 'Budi', email: 'old@mail.com', phone: '0812' });
  });

  it('takes the incoming name when the existing name is blank', () => {
    expect(
      mergeCustomer(
        { name: '  ', email: '', phone: '' },
        { name: 'Siti', email: 'siti@mail.com', phone: '' },
      ),
    ).toEqual({ name: 'Siti', email: 'siti@mail.com', phone: '' });
  });
});

describe('CUSTOMER_LIMITS', () => {
  it('matches the Appwrite column bounds', () => {
    expect(CUSTOMER_LIMITS).toEqual({ name: 128, email: 255, phone: 32 });
  });
});
