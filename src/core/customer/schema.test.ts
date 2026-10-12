import { describe, expect, it } from 'vitest';
import { customerDraftSchema, customerShapeSchema } from './schema';

describe('customerDraftSchema', () => {
  it('trims both fields on the way through', () => {
    expect(customerDraftSchema.parse({ name: '  Budi  ', phone: ' 0812 ' })).toEqual({
      name: 'Budi',
      phone: '0812',
    });
  });

  it('accepts a customer with no phone', () => {
    expect(customerDraftSchema.parse({ name: 'Budi', phone: '' })).toEqual({
      name: 'Budi',
      phone: '',
    });
  });

  it('rejects a blank name', () => {
    const result = customerDraftSchema.safeParse({ name: '   ', phone: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a name longer than the column', () => {
    const result = customerDraftSchema.safeParse({
      name: 'x'.repeat(CUSTOMER_NAME_MAX + 1),
      phone: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('customerShapeSchema', () => {
  it('passes a well-formed row through', () => {
    expect(
      customerShapeSchema.parse({ name: 'Budi', phone: '0812', lastUsedAt: '2026-10-12' }),
    ).toEqual({ name: 'Budi', phone: '0812', lastUsedAt: '2026-10-12' });
  });

  it('falls back to empty strings rather than failing the row', () => {
    // Appwrite returns `null` for unset optional columns; a row with a bad
    // phone must still keep its name, which is the only field the picker needs.
    const parsed = customerShapeSchema.safeParse({
      name: 'Budi',
      phone: null,
      lastUsedAt: null,
    });
    expect(parsed.success && parsed.data).toEqual({ name: 'Budi', phone: '', lastUsedAt: '' });
  });
});

const CUSTOMER_NAME_MAX = 128;
