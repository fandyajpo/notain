import { describe, expect, it } from 'vitest';
import { repairInvoiceContent } from './repair';
import type { InvoiceDraft } from './model';

const base: InvoiceDraft = {
  invoiceNumber: 'INV-2026-001',
  date: '2026-10-01',
  dueDate: '2026-10-15',
  templateId: 'tpl-1',
  status: 'sent',
  customerName: 'Budi',
  customerPhone: '081234567890',
  customerEmail: 'budi@example.com',
  items: [{ id: 'i1', name: 'Apel', quantity: 2, unitPrice: 10_000 }],
  details: { plate: 'B 1234 XY' },
  discount: { type: 'amount', value: 1_000 },
  tax: { type: 'percent', value: 11 },
  sections: { header: '<p>Kop</p>', content: '<p>Isi</p>', footer: '<p>Footer</p>' },
  notes: 'Terima kasih.',
};

describe('repairInvoiceContent', () => {
  it('leaves a schema-valid draft untouched', () => {
    const { draft, repaired } = repairInvoiceContent(base);
    expect(repaired).toEqual([]);
    expect(draft).toEqual(base);
  });

  it('does not mutate its input', () => {
    const snapshot = JSON.parse(JSON.stringify(base)) as InvoiceDraft;
    repairInvoiceContent(base);
    expect(base).toEqual(snapshot);
  });

  it('cleans separators out of a WhatsApp number', () => {
    expect(
      repairInvoiceContent({ ...base, customerPhone: '0812 3456-7890 (WA)' }).draft.customerPhone,
    ).toBe('081234567890');
    expect(
      repairInvoiceContent({ ...base, customerPhone: '6281234567890' }).draft.customerPhone,
    ).toBe('+6281234567890');
  });

  it('keeps a genuinely wrong number so the field error can name it', () => {
    const { draft, repaired } = repairInvoiceContent({ ...base, customerPhone: 'telepon rumah' });
    expect(draft.customerPhone).toBe('telepon rumah');
    expect(repaired).toEqual([]);
  });

  it('clears dates the schema would refuse', () => {
    const badDate = repairInvoiceContent({ ...base, date: '01/10/2026', dueDate: '15-10-2026' });
    expect(badDate.draft.date).toBe('');
    expect(badDate.draft.dueDate).toBe('');
    expect(badDate.repaired).toHaveLength(2);

    const beforeIssue = repairInvoiceContent({
      ...base,
      date: '2026-10-15',
      dueDate: '2026-10-01',
    });
    expect(beforeIssue.draft.dueDate).toBe('');
  });

  it('clamps adjustments into what the schema allows', () => {
    const negative = repairInvoiceContent({
      ...base,
      discount: { type: 'amount', value: -500 },
      tax: { type: 'percent', value: 250 },
    });
    expect(negative.draft.discount).toEqual({ type: 'amount', value: 0 });
    expect(negative.draft.tax).toEqual({ type: 'percent', value: 100 });

    const fractional = repairInvoiceContent({
      ...base,
      discount: { type: 'amount', value: 1_000.5 },
    });
    expect(fractional.draft.discount.value).toBe(1_001);
  });

  it('drops placeholder rows and coerces the rest', () => {
    const { draft, repaired } = repairInvoiceContent({
      ...base,
      items: [
        { id: 'i1', name: '   ', quantity: 1, unitPrice: 5_000 },
        { id: '', name: 'Apel', quantity: 2.4, unitPrice: 10_000.6, unit: 'satuan-sangat-panjang' },
      ],
    });
    expect(draft.items).toEqual([
      { id: 'item-2', name: 'Apel', quantity: 2, unitPrice: 10_001, unit: 'satuan-sangat-pa' },
    ]);
    expect(repaired).toContain('Baris barang tanpa nama dihapus.');
    expect(repaired).toContain('Baris barang dirapikan.');
  });

  it('normalises a hand-typed invoice number and truncates over-long text', () => {
    const loose = repairInvoiceContent({ ...base, invoiceNumber: 'inv/2026/007' });
    expect(loose.draft.invoiceNumber).toBe('INV-2026-007');

    const long = repairInvoiceContent({
      ...base,
      customerName: 'x'.repeat(200),
      notes: 'n'.repeat(6_000),
      sections: { ...base.sections, header: '<p>' + 'h'.repeat(21_000) },
    });
    expect(long.draft.customerName).toHaveLength(128);
    expect(long.draft.notes).toHaveLength(5_000);
    expect(long.draft.sections.header).toHaveLength(20_000);
  });

  it('caps the details record at the catalogue bound', () => {
    const details = Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => [`k${index}`, String(index)]),
    );
    const { draft, repaired } = repairInvoiceContent({ ...base, details });
    expect(Object.keys(draft.details)).toHaveLength(16);
    expect(repaired).toContain('Detail bisnis melebihi batas dan dipotong.');
  });
});
