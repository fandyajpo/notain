import { describe, expect, it } from 'vite-plus/test';
import {
  invoiceContentFingerprint,
  invoiceContentPayload,
  type InvoiceContentSource,
} from './fingerprint';

const base: InvoiceContentSource = {
  invoiceNumber: 'INV-2026-001',
  date: '2026-10-01',
  dueDate: '2026-10-15',
  templateId: 'tpl-1',
  customerName: 'Budi',
  customerPhone: '081234567890',
  customerEmail: 'budi@example.com',
  items: [{ id: 'i1', name: 'Apel', quantity: 2, unitPrice: 10_000, unit: 'kg' }],
  details: { plate: 'B 1234 XY' },
  discount: { type: 'amount', value: 1_000 },
  tax: { type: 'percent', value: 11 },
  sections: { header: '<p>Kop</p>', content: '<p>Isi</p>', footer: '<p>Footer</p>' },
  notes: 'Terima kasih.',
};

describe('invoiceContentPayload', () => {
  it('is stable across key order', () => {
    const reordered: InvoiceContentSource = {
      notes: base.notes,
      sections: {
        footer: base.sections.footer,
        header: base.sections.header,
        content: base.sections.content,
      },
      tax: base.tax,
      discount: base.discount,
      details: base.details,
      items: base.items,
      customerEmail: base.customerEmail,
      customerPhone: base.customerPhone,
      customerName: base.customerName,
      templateId: base.templateId,
      dueDate: base.dueDate,
      date: base.date,
      invoiceNumber: base.invoiceNumber,
    };
    expect(invoiceContentPayload(reordered)).toBe(invoiceContentPayload(base));
  });

  it('ignores an absent optional the same as an explicit undefined', () => {
    const withoutDueDate: InvoiceContentSource = { ...base };
    delete withoutDueDate.dueDate;
    expect(invoiceContentPayload({ ...withoutDueDate, dueDate: undefined })).toBe(
      invoiceContentPayload(withoutDueDate),
    );
  });

  it('ignores fields a content write cannot touch', () => {
    const withExtras = {
      ...base,
      id: 'row-9',
      ownerId: 'user-9',
      status: 'paid' as const,
      createdAt: '2026-01-01T00:00:00.000+00:00',
      updatedAt: '2026-01-02T00:00:00.000+00:00',
      paymentProof: null,
    };
    expect(invoiceContentPayload(withExtras)).toBe(invoiceContentPayload(base));
  });

  it('reflects a change to any content field', () => {
    const mutations: Array<[string, InvoiceContentSource]> = [
      ['invoiceNumber', { ...base, invoiceNumber: 'INV-2026-002' }],
      ['date', { ...base, date: '2026-10-02' }],
      ['dueDate', { ...base, dueDate: '2026-10-20' }],
      ['templateId', { ...base, templateId: 'tpl-2' }],
      ['customerName', { ...base, customerName: 'Cecep' }],
      ['customerPhone', { ...base, customerPhone: '089876543210' }],
      ['customerEmail', { ...base, customerEmail: 'cecep@example.com' }],
      [
        'items',
        {
          ...base,
          items: [{ id: 'i1', name: 'Apel', quantity: 3, unitPrice: 10_000, unit: 'kg' }],
        },
      ],
      ['details', { ...base, details: { plate: 'B 9999 ZZ' } }],
      ['discount', { ...base, discount: { type: 'percent', value: 5 } }],
      ['tax', { ...base, tax: { type: 'amount', value: 500 } }],
      ['sections', { ...base, sections: { ...base.sections, header: '<p>Kop baru</p>' } }],
      ['notes', { ...base, notes: 'Dikirim hari ini.' }],
    ];
    const original = invoiceContentPayload(base);
    for (const [field, mutated] of mutations) {
      expect(invoiceContentPayload(mutated), field).not.toBe(original);
    }
  });
});

describe('invoiceContentFingerprint', () => {
  it('is a stable 64-character hex digest of the payload', async () => {
    const first = await invoiceContentFingerprint(base);
    const second = await invoiceContentFingerprint({ ...base });
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toBe(first);
  });

  it('separates structurally different content', async () => {
    expect(await invoiceContentFingerprint({ ...base, customerName: 'Cecep' })).not.toBe(
      await invoiceContentFingerprint(base),
    );
  });
});
