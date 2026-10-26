import { describe, expect, it } from 'vite-plus/test';
import { createSampleInvoice } from './sample';
import { SAMPLE_ISSUER } from '../business/issuer';
import { invoiceDraftSchema } from './schema';
import { calculateTotals } from './calculator';
import { INVOICE_LIMITS } from './model';

const baseDraft = () => ({
  invoiceNumber: 'INV-2026-001',
  date: '2026-10-11',
  dueDate: '2026-10-18',
  customerName: 'Budi Santoso',
  customerPhone: '081298765432',
  items: [{ id: 'item-1', name: 'Nasi Goreng', quantity: 2, unitPrice: 25_000 }],
  discount: { type: 'amount' as const, value: 0 },
  tax: { type: 'percent' as const, value: 11 },
  sections: { header: '', content: '', footer: '' },
  notes: 'Terima kasih',
  details: {},
});

describe('invoiceDraftSchema', () => {
  it('accepts a complete draft', () => {
    const result = invoiceDraftSchema.safeParse(baseDraft());
    expect(result.success).toBe(true);
  });

  it('normalises empty optional fields to undefined', () => {
    const result = invoiceDraftSchema.safeParse({ ...baseDraft(), dueDate: '', notes: '' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.dueDate).toBeUndefined();
    expect(result.data.notes).toBeUndefined();
    expect(result.data.customerPhone).toBe('081298765432');
  });

  it('rejects a malformed invoice number', () => {
    const result = invoiceDraftSchema.safeParse({ ...baseDraft(), invoiceNumber: 'nota 1' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.path.join('.') === 'invoiceNumber')).toBe(
      true,
    );
  });

  it('requires at least one item', () => {
    const result = invoiceDraftSchema.safeParse({ ...baseDraft(), items: [] });
    expect(result.success).toBe(false);
  });

  it('rejects a due date before the invoice date', () => {
    const result = invoiceDraftSchema.safeParse({ ...baseDraft(), dueDate: '2026-10-01' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.path.join('.') === 'dueDate')).toBe(true);
  });

  it('rejects a discount larger than the subtotal', () => {
    const result = invoiceDraftSchema.safeParse({
      ...baseDraft(),
      discount: { type: 'amount', value: 1_000_000 },
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.path.join('.') === 'discount.value')).toBe(
      true,
    );
  });

  it('rejects an out-of-range percentage', () => {
    const result = invoiceDraftSchema.safeParse({
      ...baseDraft(),
      tax: { type: 'percent', value: 250 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-integer Rupiah amount', () => {
    const result = invoiceDraftSchema.safeParse({
      ...baseDraft(),
      discount: { type: 'amount', value: 100.5 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty customer name', () => {
    const result = invoiceDraftSchema.safeParse({ ...baseDraft(), customerName: '   ' });
    expect(result.success).toBe(false);
  });

  it('accepts an item with a unit label', () => {
    const result = invoiceDraftSchema.safeParse({
      ...baseDraft(),
      items: [{ id: 'item-1', name: 'Oli mesin', quantity: 1, unitPrice: 120_000, unit: 'liter' }],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.items[0]?.unit).toBe('liter');
  });

  it('normalises an empty unit to undefined so the column stays hidden', () => {
    const result = invoiceDraftSchema.safeParse({
      ...baseDraft(),
      items: [{ id: 'item-1', name: 'Nasi Goreng', quantity: 2, unitPrice: 25_000, unit: '  ' }],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.items[0]?.unit).toBeUndefined();
  });

  it('rejects a unit longer than the column allows', () => {
    const result = invoiceDraftSchema.safeParse({
      ...baseDraft(),
      items: [
        {
          id: 'item-1',
          name: 'Nasi Goreng',
          quantity: 2,
          unitPrice: 25_000,
          unit: 'x'.repeat(INVOICE_LIMITS.unit + 1),
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('accepts business detail values and trims them', () => {
    const result = invoiceDraftSchema.safeParse({
      ...baseDraft(),
      details: { 'nama-kendaraan': '  Avanza  ', 'nomor-polisi': 'B 1234 XY' },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.details).toEqual({
      'nama-kendaraan': 'Avanza',
      'nomor-polisi': 'B 1234 XY',
    });
  });

  it('rejects a detail value longer than the column allows', () => {
    const result = invoiceDraftSchema.safeParse({
      ...baseDraft(),
      details: { 'nama-kendaraan': 'x'.repeat(INVOICE_LIMITS.detailValue + 1) },
    });
    expect(result.success).toBe(false);
  });

  it('rejects more detail entries than the cap allows', () => {
    const details = Object.fromEntries(
      Array.from({ length: INVOICE_LIMITS.maxDetails + 1 }, (_, index) => [`key-${index}`, 'x']),
    );
    const result = invoiceDraftSchema.safeParse({ ...baseDraft(), details });
    expect(result.success).toBe(false);
  });
});

describe('createSampleInvoice', () => {
  it('produces a draft that passes validation', () => {
    const { draft } = createSampleInvoice(new Date(Date.UTC(2026, 9, 8)));
    expect(invoiceDraftSchema.safeParse(draft).success).toBe(true);
  });

  it('describes a real payable total', () => {
    const { draft } = createSampleInvoice(new Date(Date.UTC(2026, 9, 8)));
    const totals = calculateTotals(draft);
    // (2×25.000 + 3×8.000 + 1×10.000) = 84.000 → −5% = 79.800 → +11% = 88.578
    expect(totals.subtotal).toBe(84_000);
    expect(totals.discountAmount).toBe(4_200);
    expect(totals.taxableAmount).toBe(79_800);
    expect(totals.taxAmount).toBe(8_778);
    expect(totals.grandTotal).toBe(88_578);
  });

  it('names the organization in its copy, not the account holder', () => {
    const business = { ...SAMPLE_ISSUER, name: 'Buffy Tester', businessName: 'Kopi Uji' };
    const { draft } = createSampleInvoice(new Date(Date.UTC(2026, 9, 8)), business);
    expect(draft.sections.header).toContain('memesan di Kopi Uji');
    expect(draft.sections.footer).toContain('a.n. Kopi Uji');
    expect(draft.sections.header).not.toContain('Buffy Tester');
    expect(draft.sections.footer).not.toContain('Buffy Tester');
  });

  it('falls back to the personal name when the profile has no business name', () => {
    const business = { ...SAMPLE_ISSUER, name: 'Buffy Tester', businessName: '' };
    const { draft } = createSampleInvoice(new Date(Date.UTC(2026, 9, 8)), business);
    expect(draft.sections.header).toContain('memesan di Buffy Tester');
  });
});
