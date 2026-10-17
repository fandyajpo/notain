import { describe, expect, it } from 'vitest';
import { INVOICE_LIMITS } from '../core/invoice/model';
import { DEFAULT_THEME, createDefaultLayout } from '../core/template/model';
import {
  parseInvoiceItems,
  parseInvoiceDetails,
  draftToRowData,
  draftToRowUpdateData,
  invoiceRowToDomain,
  templateRowToDomain,
  profileRowToDomain,
  profileToRowData,
  customerRowToDomain,
  customerToRowData,
  statsRowToDomain,
  statsToRowData,
  type InvoiceRow,
  type TemplateRow,
  type ProfileRow,
  type CustomerRow,
  type StatsRow,
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

  it('keeps a unit label when the item has one', () => {
    const items = parseInvoiceItems(JSON.stringify([item({ unit: 'liter' })]));
    expect(items[0]?.unit).toBe('liter');
  });

  it('reads a legacy item without a unit as having none', () => {
    expect(parseInvoiceItems(JSON.stringify([item()]))[0]).not.toHaveProperty('unit');
  });

  it('drops a corrupt unit but keeps the row and its price', () => {
    const items = parseInvoiceItems(JSON.stringify([item({ unit: 5 })]));
    expect(items).toHaveLength(1);
    expect(items[0]?.unit).toBeUndefined();
    expect(items[0]?.unitPrice).toBe(100_000);
  });

  it('drops an over-long unit but keeps the row', () => {
    const items = parseInvoiceItems(
      JSON.stringify([item({ unit: 'x'.repeat(INVOICE_LIMITS.unit + 1) })]),
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.unit).toBeUndefined();
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
    expect(invoice.details).toEqual({});
  });

  it('reads the business detail record back', () => {
    const invoice = invoiceRowToDomain(
      row({ details: JSON.stringify({ 'nomor-polisi': 'B 1234 XY', 'berat-kg': '3' }) }),
    );
    expect(invoice.details).toEqual({ 'nomor-polisi': 'B 1234 XY', 'berat-kg': '3' });
  });
});

describe('invoice status round-trip', () => {
  it('reads an unset (empty) column as null — "Belum dikirim"', () => {
    expect(invoiceRowToDomain(row({ status: '' })).status).toBeNull();
  });

  it('reads a missing or corrupt column as null instead of crashing', () => {
    expect(invoiceRowToDomain(row({ status: undefined as unknown as string })).status).toBeNull();
    expect(invoiceRowToDomain(row({ status: 'banana' })).status).toBeNull();
  });

  it('reads each set status back verbatim', () => {
    expect(invoiceRowToDomain(row({ status: 'sent' })).status).toBe('sent');
    expect(invoiceRowToDomain(row({ status: 'paid' })).status).toBe('paid');
    expect(invoiceRowToDomain(row({ status: 'void' })).status).toBe('void');
  });

  it('writes an unset status as the empty string, never null', () => {
    const written = draftToRowData({
      invoiceNumber: 'INV-2026-001',
      date: '2026-10-01',
      status: null,
      customerName: 'Budi',
      items: [item()],
      discount: { type: 'amount' as const, value: 0 },
      tax: { type: 'amount' as const, value: 0 },
      sections: { header: '', content: '', footer: '' },
      details: {},
    });
    expect(written.status).toBe('');
    // Round trip: '' must come back as null, so the display label matches.
    expect(invoiceRowToDomain(row({ status: written.status as string })).status).toBeNull();
  });
});

describe('parseInvoiceDetails', () => {
  it('keeps a well-formed record', () => {
    expect(parseInvoiceDetails(JSON.stringify({ 'nama-kendaraan': 'Avanza' }))).toEqual({
      'nama-kendaraan': 'Avanza',
    });
  });

  it('returns an empty record for a column that was never written', () => {
    expect(parseInvoiceDetails(null)).toEqual({});
    expect(parseInvoiceDetails(undefined)).toEqual({});
    expect(parseInvoiceDetails('')).toEqual({});
  });

  it('returns an empty record for corrupt JSON or a non-object payload', () => {
    expect(parseInvoiceDetails('not json')).toEqual({});
    expect(parseInvoiceDetails('["nama-kendaraan"]')).toEqual({});
    expect(parseInvoiceDetails('"Avanza"')).toEqual({});
  });

  it('blanks an over-long value instead of dropping the whole record', () => {
    const details = parseInvoiceDetails(
      JSON.stringify({ 'nama-kendaraan': 'x'.repeat(INVOICE_LIMITS.detailValue + 1) }),
    );
    expect(details).toEqual({ 'nama-kendaraan': '' });
  });
});

describe('draftToRowData details column', () => {
  const baseDraft = () => ({
    invoiceNumber: 'INV-2026-001',
    date: '2026-10-01',
    status: 'sent' as const,
    customerName: 'Budi',
    items: [item()],
    discount: { type: 'amount' as const, value: 0 },
    tax: { type: 'amount' as const, value: 0 },
    sections: { header: '', content: '', footer: '' },
    details: { 'nomor-polisi': 'B 1234 XY' },
  });

  it('serialises a non-empty record and reads it back', () => {
    const written = draftToRowData(baseDraft());
    expect(written.details).toBe(JSON.stringify({ 'nomor-polisi': 'B 1234 XY' }));
    expect(parseInvoiceDetails(written.details)).toEqual({ 'nomor-polisi': 'B 1234 XY' });
  });

  it('writes null when the invoice has no details', () => {
    const written = draftToRowData({ ...baseDraft(), details: {} });
    expect(written.details).toBeNull();
    expect(parseInvoiceDetails(written.details)).toEqual({});
  });
});

describe('draftToRowUpdateData', () => {
  const draft = (status: 'sent' | 'paid' | null) => ({
    invoiceNumber: 'INV-2026-001',
    date: '2026-10-01',
    status,
    customerName: 'Budi',
    items: [item()],
    discount: { type: 'amount' as const, value: 0 },
    tax: { type: 'amount' as const, value: 0 },
    sections: { header: '<p>H</p>', content: '<p>C</p>', footer: '<p>F</p>' },
    details: {},
  });

  it('omits the status column no matter what the draft carries', () => {
    // The whole point: Appwrite writes only the keys present in `data`, so an
    // absent `status` key is what keeps a content save off the lifecycle.
    expect(draftToRowUpdateData(draft(null))).not.toHaveProperty('status');
    expect(draftToRowUpdateData(draft('paid'))).not.toHaveProperty('status');
    expect(draftToRowUpdateData(draft('sent'))).not.toHaveProperty('status');
  });

  it('writes every other column exactly as the full payload does', () => {
    const source = draft('paid');
    const full = draftToRowData(source);
    const update = draftToRowUpdateData(source);
    const withoutStatus = Object.fromEntries(
      Object.entries(full).filter(([key]) => key !== 'status'),
    );
    expect(update).toEqual(withoutStatus);
    expect(Object.keys(update)).toEqual(Object.keys(withoutStatus));
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

  it('reads a row written before businessType existed as null', () => {
    expect(templateRowToDomain(templateRow()).businessType).toBeNull();
    expect(templateRowToDomain(templateRow({ businessType: null })).businessType).toBeNull();
  });

  it('keeps a business type the taxonomy still defines', () => {
    expect(templateRowToDomain(templateRow({ businessType: 'bengkel-mobil' })).businessType).toBe(
      'bengkel-mobil',
    );
  });

  it('degrades a business type the taxonomy no longer knows to null', () => {
    expect(templateRowToDomain(templateRow({ businessType: 'bengkel-kapal' })).businessType).toBe(
      null,
    );
  });
});

describe('profile businessType round-trip', () => {
  const profileRow = (over: Partial<ProfileRow> = {}): ProfileRow =>
    ({
      $id: 'user-1',
      name: 'Fandy',
      businessName: 'Bengkel Fa',
      phone: '081234567890',
      address: null,
      email: null,
      logoFileId: null,
      plan: 'free',
      planExpiresAt: null,
      ...over,
    }) as ProfileRow;

  it('reads and writes a known slug', () => {
    const profile = profileRowToDomain(profileRow({ businessType: 'bengkel-mobil' }));
    expect(profile.businessType).toBe('bengkel-mobil');
    expect(profileToRowData(profile).businessType).toBe('bengkel-mobil');
  });

  it('reads a missing column or an unknown slug as null', () => {
    expect(profileRowToDomain(profileRow()).businessType).toBeNull();
    expect(profileRowToDomain(profileRow({ businessType: 'bengkel-kapal' })).businessType).toBe(
      null,
    );
  });

  it('writes null when no type was ever chosen', () => {
    expect(profileToRowData(profileRowToDomain(profileRow())).businessType).toBeNull();
  });
});

const customerRow = (over: Partial<CustomerRow> = {}): CustomerRow =>
  ({
    $id: 'cus-1',
    ownerId: 'user-1',
    name: 'Budi Santoso',
    email: 'budi@mail.com',
    phone: '081234567890',
    lastUsedAt: '2026-10-12T00:00:00.000Z',
    ...over,
  }) as CustomerRow;

describe('customerRowToDomain', () => {
  it('maps a well-formed row', () => {
    expect(customerRowToDomain(customerRow())).toEqual({
      id: 'cus-1',
      name: 'Budi Santoso',
      email: 'budi@mail.com',
      phone: '081234567890',
      lastUsedAt: '2026-10-12T00:00:00.000Z',
    });
  });

  it('keeps the name when the optional columns come back null', () => {
    // Appwrite hands `null` for an optional text column that was never written.
    // The name is the only field the picker needs, so a null phone must not
    // cost the whole row.
    expect(customerRowToDomain(customerRow({ email: null, phone: null, lastUsedAt: null }))).toEqual({
      id: 'cus-1',
      name: 'Budi Santoso',
      email: '',
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
  it('trims all fields and stores blanks as null', () => {
    expect(
      customerToRowData(
        { name: '  Budi  ', email: '  ', phone: '   ' },
        '2026-10-12T00:00:00.000Z',
      ),
    ).toEqual({
      name: 'Budi',
      email: null,
      phone: null,
      lastUsedAt: '2026-10-12T00:00:00.000Z',
    });
  });

  it('keeps values that were actually given', () => {
    const row = customerToRowData(
      { name: 'Budi', email: ' budi@mail.com ', phone: ' 0812 ' },
      '2026-10-12',
    );
    expect(row.email).toBe('budi@mail.com');
    expect(row.phone).toBe('0812');
  });
});

describe('statsRowToDomain', () => {
  const statsRow = (over: Partial<StatsRow> = {}): StatsRow =>
    ({
      $id: 'stats-1',
      $createdAt: '2026-10-10T00:00:00.000+00:00',
      $updatedAt: '2026-10-11T08:30:00.000+00:00',
      ownerId: 'user-1',
      totalInvoices: 12,
      sentCount: 5,
      paidCount: 4,
      voidCount: 1,
      totalCustomers: 7,
      totalTemplates: 3,
      ...over,
    }) as StatsRow;

  it('reads the counters and row identity back', () => {
    expect(statsRowToDomain(statsRow())).toEqual({
      id: 'stats-1',
      ownerId: 'user-1',
      totalInvoices: 12,
      sentCount: 5,
      paidCount: 4,
      voidCount: 1,
      totalCustomers: 7,
      totalTemplates: 3,
      updatedAt: '2026-10-11T08:30:00.000+00:00',
    });
  });

  it('degrades a null or corrupt counter to 0 — the next refresh recomputes it', () => {
    const parsed = statsRowToDomain(
      statsRow({
        sentCount: null,
        paidCount: -3 as unknown as number,
        totalCustomers: 'x' as unknown as number,
      }),
    );

    expect(parsed.sentCount).toBe(0);
    expect(parsed.paidCount).toBe(0);
    expect(parsed.totalCustomers).toBe(0);
    expect(parsed.totalInvoices).toBe(12);
  });

  it('keeps a genuinely empty row (all zeros) intact', () => {
    const parsed = statsRowToDomain(
      statsRow({ totalInvoices: 0, sentCount: 0, paidCount: 0, voidCount: 0 }),
    );

    expect(parsed.totalInvoices).toBe(0);
    expect(parsed.updatedAt).toBe('2026-10-11T08:30:00.000+00:00');
  });
});

describe('statsToRowData', () => {
  it('serializes exactly the six counter columns', () => {
    expect(
      statsToRowData({
        totalInvoices: 12,
        sentCount: 5,
        paidCount: 4,
        voidCount: 1,
        totalCustomers: 7,
        totalTemplates: 3,
      }),
    ).toEqual({
      totalInvoices: 12,
      sentCount: 5,
      paidCount: 4,
      voidCount: 1,
      totalCustomers: 7,
      totalTemplates: 3,
    });
  });
});
