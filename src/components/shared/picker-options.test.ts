import { describe, expect, it } from 'vitest';
import type { Invoice } from '../../core/invoice/model';
import { derivePickerOptions, mergeCustomerOptions, PICKER_OPTION_LIMIT } from './picker-options';
import type { Customer } from '../../core/customer/model';

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: `inv-${Math.random().toString(36).slice(2)}`,
    ownerId: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    invoiceNumber: 'INV-2026-001',
    date: '2026-01-01',
    status: 'sent',
    customerName: 'Budi Santoso',
    customerPhone: '081234567890',
    items: [{ id: 'item-1', name: 'Nasi Goreng', quantity: 1, unitPrice: 25_000 }],
    discount: { type: 'amount', value: 0 },
    tax: { type: 'amount', value: 0 },
    sections: { header: '', content: '', footer: '' },
    ...overrides,
  };
}

describe('derivePickerOptions', () => {
  it('returns empty lists for no history', () => {
    expect(derivePickerOptions([])).toEqual({ customers: [], products: [] });
    expect(derivePickerOptions(undefined)).toEqual({ customers: [], products: [] });
    expect(derivePickerOptions(null)).toEqual({ customers: [], products: [] });
  });

  it('extracts the customer and products of a single invoice', () => {
    const options = derivePickerOptions([invoice()]);

    expect(options.customers).toHaveLength(1);
    expect(options.customers[0]).toMatchObject({
      kind: 'customer',
      name: 'Budi Santoso',
      phone: '081234567890',
      invoiceCount: 1,
    });

    expect(options.products).toHaveLength(1);
    expect(options.products[0]).toMatchObject({
      kind: 'product',
      name: 'Nasi Goreng',
      unitPrice: 25_000,
      invoiceCount: 1,
    });
  });

  it('carries the unit the history row was counted in', () => {
    const options = derivePickerOptions([
      invoice({
        items: [{ id: 'i1', name: 'Oli mesin', quantity: 1, unitPrice: 120_000, unit: 'liter' }],
      }),
    ]);

    expect(options.products[0]).toMatchObject({ name: 'Oli mesin', unit: 'liter' });
  });

  it('leaves the unit off an option whose history rows never had one', () => {
    const options = derivePickerOptions([invoice()]);

    expect(options.products[0]?.unit).toBeUndefined();
  });

  it('lets the newest row decide the unit of a repeated product', () => {
    const older = invoice({
      date: '2026-01-01',
      updatedAt: '2026-01-01T00:00:00.000Z',
      items: [{ id: 'i1', name: 'Bensin', quantity: 1, unitPrice: 10_000 }],
    });
    const newer = invoice({
      date: '2026-02-01',
      updatedAt: '2026-02-01T00:00:00.000Z',
      items: [{ id: 'i2', name: 'Bensin', quantity: 1, unitPrice: 10_000, unit: 'liter' }],
    });

    const options = derivePickerOptions([newer, older]);
    expect(options.products).toHaveLength(1);
    expect(options.products[0]?.unit).toBe('liter');
  });

  it('merges repeat customers and counts their invoices', () => {
    const options = derivePickerOptions([
      invoice({ id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' }),
      invoice({ id: 'b', updatedAt: '2026-02-01T00:00:00.000Z' }),
    ]);

    expect(options.customers).toHaveLength(1);
    expect(options.customers[0]?.invoiceCount).toBe(2);
    expect(options.customers[0]?.lastUsedAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('keeps same-name customers apart when the phone differs', () => {
    const options = derivePickerOptions([
      invoice({ customerPhone: '081111111111' }),
      invoice({ customerPhone: '082222222222' }),
    ]);

    expect(options.customers).toHaveLength(2);
    expect(options.customers.map((customer) => customer.phone).sort()).toEqual([
      '081111111111',
      '082222222222',
    ]);
  });

  it('treats same-name customers with different casing as one', () => {
    const options = derivePickerOptions([
      invoice({ customerName: 'budi santoso' }),
      invoice({ customerName: 'Budi Santoso' }),
    ]);

    expect(options.customers).toHaveLength(1);
    expect(options.customers[0]?.invoiceCount).toBe(2);
  });

  it('keeps same-name products apart when the price differs', () => {
    const options = derivePickerOptions([
      invoice({ items: [{ id: 'i1', name: 'Kopi', quantity: 1, unitPrice: 10_000 }] }),
      invoice({ items: [{ id: 'i2', name: 'Kopi', quantity: 1, unitPrice: 15_000 }] }),
    ]);

    expect(options.products).toHaveLength(2);
    expect(options.products.map((product) => product.unitPrice).sort()).toEqual([10_000, 15_000]);
  });

  it('counts a repeated line within one invoice only once', () => {
    const options = derivePickerOptions([
      invoice({
        items: [
          { id: 'i1', name: 'Kopi', quantity: 1, unitPrice: 10_000 },
          { id: 'i2', name: 'Kopi', quantity: 3, unitPrice: 10_000 },
        ],
      }),
    ]);

    expect(options.products).toHaveLength(1);
    expect(options.products[0]?.invoiceCount).toBe(1);
  });

  it('sorts the newest customer first', () => {
    const options = derivePickerOptions([
      invoice({ id: 'old', customerName: 'Lama', updatedAt: '2026-01-01T00:00:00.000Z' }),
      invoice({ id: 'new', customerName: 'Baru', updatedAt: '2026-03-01T00:00:00.000Z' }),
    ]);

    expect(options.customers.map((customer) => customer.name)).toEqual(['Baru', 'Lama']);
  });

  it('skips customers and products without a name', () => {
    const options = derivePickerOptions([
      invoice({
        customerName: '   ',
        items: [{ id: 'i1', name: '  ', quantity: 1, unitPrice: 5_000 }],
      }),
    ]);

    expect(options.customers).toHaveLength(0);
    expect(options.products).toHaveLength(0);
  });

  it('trims names before storing them', () => {
    const options = derivePickerOptions([invoice({ customerName: '  Budi  ' })]);
    expect(options.customers[0]?.name).toBe('Budi');
  });

  it('keeps a customer with no phone as an empty phone option', () => {
    const options = derivePickerOptions([invoice({ customerPhone: undefined })]);
    expect(options.customers[0]?.phone).toBe('');
  });

  it('caps each list at the requested limit, newest first', () => {
    const many = Array.from({ length: PICKER_OPTION_LIMIT + 5 }, (_, index) =>
      invoice({
        id: `inv-${index}`,
        customerName: `Customer ${index}`,
        updatedAt: `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
      }),
    );

    const options = derivePickerOptions(many);

    expect(options.customers).toHaveLength(PICKER_OPTION_LIMIT);
    expect(options.customers[0]?.name).toBe(`Customer ${PICKER_OPTION_LIMIT + 4}`);
    expect(options.customers.at(-1)?.name).toBe('Customer 5');
  });

  it('returns empty lists when the limit is zero', () => {
    expect(derivePickerOptions([invoice()], 0)).toEqual({ customers: [], products: [] });
  });

  it('falls back to the invoice date when timestamps are missing', () => {
    const options = derivePickerOptions([
      invoice({ createdAt: '', updatedAt: '', date: '2026-05-05' }),
    ]);
    expect(options.customers[0]?.lastUsedAt).toContain('2026-05-05');
  });
});

function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: `cus-${Math.random().toString(36).slice(2)}`,
    name: 'Budi Santoso',
    email: '',
    phone: '081234567890',
    lastUsedAt: '2026-02-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('mergeCustomerOptions', () => {
  it('returns an empty list when there is nothing saved and nothing in history', () => {
    expect(mergeCustomerOptions([], [])).toEqual([]);
  });

  it('turns a saved customer into a picker option', () => {
    expect(mergeCustomerOptions([customer()], [])).toEqual([
      {
        kind: 'customer',
        label: 'Budi Santoso',
        name: 'Budi Santoso',
        email: '',
        phone: '081234567890',
        lastUsedAt: '2026-02-01T00:00:00.000Z',
        invoiceCount: 0,
      },
    ]);
  });

  it('skips a saved row whose name is blank — there is nothing to label it with', () => {
    expect(mergeCustomerOptions([customer({ name: '   ' })], [])).toEqual([]);
  });

  it('lists only the directory when it has rows — history must not double a person', () => {
    const derived = derivePickerOptions([
      invoice({
        customerName: 'Siti',
        customerPhone: '08111',
        createdAt: '2026-03-01T00:00:00.000Z',
      }),
      invoice({ customerName: 'Budi Santoso', customerPhone: '089999999999' }),
    ]).customers;

    expect(mergeCustomerOptions([customer()], derived).map((o) => o.name)).toEqual([
      'Budi Santoso',
    ]);
  });

  it('falls back to history when the directory is still empty', () => {
    const derived = derivePickerOptions([
      invoice({ customerName: 'Siti', customerPhone: '08111' }),
    ]).customers;

    expect(mergeCustomerOptions([], derived).map((o) => o.name)).toEqual(['Siti']);
  });

  it('sorts the most recently used customer first', () => {
    const stored = [
      customer({ name: 'Lama', phone: '08111', lastUsedAt: '2026-01-01T00:00:00.000Z' }),
      customer({ name: 'Baru', phone: '08222', lastUsedAt: '2026-06-01T00:00:00.000Z' }),
    ];

    expect(mergeCustomerOptions(stored, []).map((o) => o.name)).toEqual(['Baru', 'Lama']);
  });

  it('caps the merged list at the picker limit, newest first', () => {
    const stored = Array.from({ length: PICKER_OPTION_LIMIT + 5 }, (_, index) =>
      customer({
        id: `cus-${index}`,
        name: `Stored ${index}`,
        phone: `0811111111${String(index).padStart(2, '0')}`,
        lastUsedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
      }),
    );

    const merged = mergeCustomerOptions(stored, []);

    expect(merged).toHaveLength(PICKER_OPTION_LIMIT);
    expect(merged[0]?.name).toBe(`Stored ${PICKER_OPTION_LIMIT + 4}`);
  });
});
