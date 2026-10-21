import { describe, expect, it, vi } from 'vite-plus/test';
import {
  CE_EVENTS,
  itemsChangeEventSchema,
  parseEvent,
  pickEventSchema,
  type ItemsChangePayload,
  type PickPayload,
} from './contracts';

const validItem = { id: 'item-1', name: 'Nasi Goreng', quantity: 2, unitPrice: 25_000 };

describe('CE_EVENTS', () => {
  it('keeps stable event names', () => {
    expect(CE_EVENTS.itemsChange).toBe('itemschange');
    expect(CE_EVENTS.pick).toBe('pick');
  });
});

describe('itemsChangeEventSchema', () => {
  it('accepts a well-formed payload', () => {
    const result = itemsChangeEventSchema.safeParse({ items: [validItem] });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.items).toHaveLength(1);
  });

  it('accepts an empty item list', () => {
    expect(itemsChangeEventSchema.safeParse({ items: [] }).success).toBe(true);
  });

  it('accepts an item whose name is still being typed', () => {
    expect(itemsChangeEventSchema.safeParse({ items: [{ ...validItem, name: '' }] }).success).toBe(
      true,
    );
  });

  it('rejects a non-array items value', () => {
    expect(itemsChangeEventSchema.safeParse({ items: validItem }).success).toBe(false);
  });

  it('rejects a missing id', () => {
    const withoutId = {
      name: validItem.name,
      quantity: validItem.quantity,
      unitPrice: validItem.unitPrice,
    };
    expect(itemsChangeEventSchema.safeParse({ items: [withoutId] }).success).toBe(false);
  });

  it('rejects a non-integer quantity', () => {
    expect(
      itemsChangeEventSchema.safeParse({ items: [{ ...validItem, quantity: 1.5 }] }).success,
    ).toBe(false);
  });

  it('rejects a zero quantity', () => {
    expect(
      itemsChangeEventSchema.safeParse({ items: [{ ...validItem, quantity: 0 }] }).success,
    ).toBe(false);
  });

  it('rejects a negative unit price', () => {
    expect(
      itemsChangeEventSchema.safeParse({ items: [{ ...validItem, unitPrice: -1 }] }).success,
    ).toBe(false);
  });

  it('rejects a non-finite unit price', () => {
    expect(
      itemsChangeEventSchema.safeParse({ items: [{ ...validItem, unitPrice: Number.NaN }] })
        .success,
    ).toBe(false);
  });

  it('carries a unit through untouched', () => {
    const result = itemsChangeEventSchema.safeParse({ items: [{ ...validItem, unit: 'liter' }] });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.items[0]?.unit).toBe('liter');
  });

  it('treats an empty unit as legal mid-typing state', () => {
    const result = itemsChangeEventSchema.safeParse({ items: [{ ...validItem, unit: '' }] });
    expect(result.success).toBe(true);
  });

  it('rejects a unit longer than the column allows', () => {
    expect(
      itemsChangeEventSchema.safeParse({ items: [{ ...validItem, unit: 'x'.repeat(17) }] }).success,
    ).toBe(false);
  });
});

describe('pickEventSchema', () => {
  it('accepts a customer pick with an empty phone', () => {
    const result = pickEventSchema.safeParse({ kind: 'customer', name: 'Budi', phone: '' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.kind).toBe('customer');
  });

  it('accepts a product pick', () => {
    const result = pickEventSchema.safeParse({
      kind: 'product',
      name: 'Nasi Goreng',
      quantity: 1,
      unitPrice: 25_000,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a product pick that carries its unit', () => {
    const result = pickEventSchema.safeParse({
      kind: 'product',
      name: 'Oli mesin',
      quantity: 1,
      unitPrice: 120_000,
      unit: 'liter',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.kind === 'product' && result.data.unit).toBe('liter');
  });

  it('rejects an unknown kind', () => {
    expect(pickEventSchema.safeParse({ kind: 'invoice', name: 'x', phone: '' }).success).toBe(
      false,
    );
  });

  it('rejects a product pick with a zero quantity', () => {
    expect(
      pickEventSchema.safeParse({
        kind: 'product',
        name: 'Nasi Goreng',
        quantity: 0,
        unitPrice: 25_000,
      }).success,
    ).toBe(false);
  });
});

describe('parseEvent', () => {
  it('returns the parsed payload for a valid detail', () => {
    const payload: ItemsChangePayload | null = parseEvent(itemsChangeEventSchema, {
      items: [validItem],
    });
    expect(payload?.items[0]?.name).toBe('Nasi Goreng');
  });

  it('returns null for a malformed detail and warns in dev', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(parseEvent(itemsChangeEventSchema, { items: 'nope' }, 'itemschange')).toBeNull();
    expect(parseEvent(pickEventSchema, undefined, 'pick')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);

    warn.mockRestore();
  });

  it('narrows a discriminated pick payload', () => {
    const payload: PickPayload | null = parseEvent(pickEventSchema, {
      kind: 'customer',
      name: 'Budi',
      phone: '',
    });
    expect(payload?.kind).toBe('customer');
  });
});
