import { describe, expect, it } from 'vitest';
import { INVOICE_LIMITS } from '../core/invoice/model';
import { DEFAULT_THEME, createDefaultLayout } from '../core/template/model';
import {
  parseInvoiceItems,
  invoiceRowToDomain,
  templateRowToDomain,
  customerRowToDomain,
  customerToRowData,
  type InvoiceRow,
  type TemplateRow,
  type CustomerRow,
} from './mappers';

const item = (over: Record<string, unknown> = {}) => ({
  id: 'item-1',
  name: 'Knalpot Racing',
  quantity: 2,
  unitPrice: 100_000,
  ...over,
});

const row = (over: Partial<InvoiceRow> = {}): InvoiceRow =>
  ({
    $id: 'inv-1',
    $createdAt: '2026-10-01T00:00:00.000+00:00',
    $updatedAt: '2026-10-01T00:00:00.000+00:00',
    ownerId: 'user-1',
    invoiceNumber: 'INV-2026-001',
    date: '2026-10-01',
    dueDate: null,
    customerName: 'Budi',
    customerPhone: null,
    items: JSON.stringify([item()]),
    discountType: 'percent',
    discountValue: 0,
    taxType: 'percent',
    taxValue: 0,
    notes: null,
    headerHtml: '',
    contentHtml: '',
    footerHtml: '',
    ...over,
  }) as InvoiceRow;

describe('parseInvoiceItems', () => {
  it('keeps a well-formed item', () => {
    expect(parseInvoiceItems(JSON.stringify([item()]))).toEqual([item()]);
  });

  it('keeps an unnamed item so the stored total still adds up', () => {
    const items = parseInvoiceItems(JSON.stringify([item({ name: '' })]));
    expect(items).toHaveLength(1);
    expect(items[0]?.name).toBe('');
  });

  it('keeps a zero-quantity item', () => {
    const items = parseInvoiceItems(JSON.stringify([item({ quantity: 0 })]));
    expect(items).toHaveLength(1);
    expect(items[0]?.quantity).toBe(0);
  });

  it('drops an entry with a negative quantity', () => {
    expect(parseInvoiceItems(JSON.stringify([item({ quantity: -1 })]))).toEqual([]);
  });

  it('drops an entry whose fields have the wrong type', () => {
    expect(parseInvoiceItems(JSON.stringify([item({ quantity: '2' })]))).toEqual([]);
  });

  it('drops an entry with an out-of-range name', () => {
    const long = 'x'.repeat(INVOICE_LIMITS.itemName + 1);
    expect(parseInvoiceItems(JSON.stringify([item({ name: long })]))).toEqual([]);
  });

  it('keeps the valid entries and drops the corrupt ones', () => {
    const items = parseInvoiceItems(
      JSON.stringify([item(), item({ id: '' }), item({ name: 'x' })]),
    );
    expect(items).toHaveLength(2);
  });

  it('returns an empty list for non-JSON or non-array payloads', () => {
    expect(parseInvoiceItems('not json')).toEqual([]);
    expect(parseInvoiceItems('{"id":"item-1"}')).toEqual([]);
    expect(parseInvoiceItems('')).toEqual([]);
    expect(parseInvoiceItems(null)).toEqual([]);
  });
});

describe('invoiceRowToDomain', () => {
  it('preserves items that only fail a business rule', () => {
    const invoice = invoiceRowToDomain(
      row({ items: JSON.stringify([item({ name: '', quantity: 1 })]) }),
    );
    expect(invoice.items).toHaveLength(1);
  });

  it('treats missing optional columns as absent rather than crashing', () => {
    const invoice = invoiceRowToDomain(row());
    expect(invoice.dueDate).toBeUndefined();
    expect(invoice.notes).toBeUndefined();
    expect(invoice.customerPhone).toBeUndefined();
  });
});

const templateRow = (over: Partial<TemplateRow> = {}): TemplateRow =>
  ({
    $id: 'tpl-1',
    $createdAt: '2026-10-01T00:00:00.000+00:00',
    $updatedAt: '2026-10-01T00:00:00.000+00:00',
    ownerId: 'user-1',
    name: 'Klasik',
    layout: JSON.stringify(createDefaultLayout()),
    theme: JSON.stringify(DEFAULT_THEME),
    headerHtml: '<p>Kop</p>',
    contentHtml: '',
    footerHtml: '',
    notes: null,
    ...over,
  }) as TemplateRow;

describe('templateRowToDomain', () => {
  it('keeps the rich-text defaults when optional columns come back null', () => {
    // Appwrite hands `null` back for a text column that was never written. One
    // null `notes` used to fail `templateDefaultsSchema`, which then threw away
    // the whole defaults object — rich text included.
    const template = templateRowToDomain(templateRow());

    expect(template.defaults.header).toBe('<p>Kop</p>');
    expect(template.defaults.footer).toBe('');
    expect(template.defaults.notes).toBeUndefined();
  });

  it('keeps the layout and theme when every optional column is null', () => {
    const template = templateRowToDomain(
      templateRow({ headerHtml: null, contentHtml: null, footerHtml: null, notes: null }),
    );

    expect(template.layout.length).toBeGreaterThan(0);
    expect(template.theme).toEqual(DEFAULT_THEME);
    expect(template.defaults).toEqual({ header: '', content: '', footer: '', notes: undefined });
  });
});

const customerRow = (over: Partial<CustomerRow> = {}): CustomerRow =>
  ({
    $id: 'cus-1',
    ownerId: 'user-1',
    name: 'Budi Santoso',
    phone: '081234567890',
    lastUsedAt: '2026-10-12T00:00:00.000Z',
    ...over,
  }) as CustomerRow;

describe('customerRowToDomain', () => {
  it('maps a well-formed row', () => {
    expect(customerRowToDomain(customerRow())).toEqual({
      id: 'cus-1',
      name: 'Budi Santoso',
      phone: '081234567890',
      lastUsedAt: '2026-10-12T00:00:00.000Z',
    });
  });

  it('keeps the name when the optional columns come back null', () => {
    // Appwrite hands `null` for an optional text column that was never written.
    // The name is the only field the picker needs, so a null phone must not
    // cost the whole row.
    expect(customerRowToDomain(customerRow({ phone: null, lastUsedAt: null }))).toEqual({
      id: 'cus-1',
      name: 'Budi Santoso',
      phone: '',
      lastUsedAt: '',
    });
  });

  it('blanks a row whose name failed to parse — there is nothing to label it with', () => {
    const parsed = customerRowToDomain(customerRow({ name: null as unknown as string }));

    expect(parsed.name).toBe('');
  });
});

describe('customerToRowData', () => {
  it('trims both fields and stores a blank phone as null', () => {
    expect(
      customerToRowData({ name: '  Budi  ', phone: '   ' }, '2026-10-12T00:00:00.000Z'),
    ).toEqual({
      name: 'Budi',
      phone: null,
      lastUsedAt: '2026-10-12T00:00:00.000Z',
    });
  });

  it('keeps a phone that was actually given', () => {
    expect(customerToRowData({ name: 'Budi', phone: ' 0812 ' }, '2026-10-12').phone).toBe('0812');
  });
});
