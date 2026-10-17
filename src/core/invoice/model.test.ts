import { describe, expect, it } from 'vitest';
import type { InvoiceDraft } from './model';
import { duplicateDraft } from './model';

const source: InvoiceDraft = {
  invoiceNumber: 'INV-2026-001',
  date: '2026-10-01',
  dueDate: '2026-10-15',
  templateId: 'tpl-abc',
  status: 'paid',
  customerName: 'Budi Santoso',
  customerPhone: '081234567890',
  items: [
    { id: 'item-1', name: 'Kopi', quantity: 2, unitPrice: 15000 },
    { id: 'item-2', name: 'Teh', quantity: 1, unitPrice: 10000 },
  ],
  discount: { type: 'percent', value: 10 },
  tax: { type: 'amount', value: 5000 },
  sections: { header: '<p>Halo</p>', content: '', footer: '' },
  notes: 'Terima kasih.',
  details: { 'nomor-polisi': 'B 1234 XY' },
};

describe('duplicateDraft', () => {
  it('carries over everything the user authored', () => {
    const copy = duplicateDraft(source, 'INV-2026-002', '2026-11-01');

    expect(copy.customerName).toBe('Budi Santoso');
    expect(copy.customerPhone).toBe('081234567890');
    expect(copy.templateId).toBe('tpl-abc');
    expect(copy.discount).toEqual({ type: 'percent', value: 10 });
    expect(copy.tax).toEqual({ type: 'amount', value: 5000 });
    expect(copy.sections).toEqual(source.sections);
    expect(copy.notes).toBe('Terima kasih.');
    expect(copy.details).toEqual({ 'nomor-polisi': 'B 1234 XY' });
    // A copy gets its own record: editing the duplicate's details must never
    // write through into the invoice it came from.
    expect(copy.details).not.toBe(source.details);
    expect(
      copy.items.map(({ name, quantity, unitPrice }) => ({ name, quantity, unitPrice })),
    ).toEqual([
      { name: 'Kopi', quantity: 2, unitPrice: 15000 },
      { name: 'Teh', quantity: 1, unitPrice: 10000 },
    ]);
  });

  it('gives the copy a fresh number and date', () => {
    const copy = duplicateDraft(source, 'INV-2026-002', '2026-11-01');

    expect(copy.invoiceNumber).toBe('INV-2026-002');
    expect(copy.date).toBe('2026-11-01');
  });

  it('restarts the copy unset, since a duplicate is not sent yet', () => {
    // The source is `paid`; the copy must not inherit that lifecycle state.
    const copy = duplicateDraft(source, 'INV-2026-002', '2026-11-01');

    expect(copy.status).toBeNull();
  });

  it('keeps the due-date offset, not the old calendar day', () => {
    // Source is net-14 (Oct 1 → Oct 15). The copy on Nov 1 must also be net-14.
    const copy = duplicateDraft(source, 'INV-2026-002', '2026-11-01');

    expect(copy.dueDate).toBe('2026-11-15');
  });

  it('leaves the due date unset when the source had none', () => {
    const copy = duplicateDraft({ ...source, dueDate: undefined }, 'INV-2026-002', '2026-11-01');

    expect(copy.dueDate).toBeUndefined();
  });

  it('mints new item ids so the grid never shares a React key', () => {
    const copy = duplicateDraft(source, 'INV-2026-002', '2026-11-01');

    const copyIds = copy.items.map((item) => item.id);
    expect(copyIds).not.toEqual(source.items.map((item) => item.id));
    expect(new Set(copyIds).size).toBe(copy.items.length);
  });

  it('does not alias the source arrays or objects', () => {
    const copy = duplicateDraft(source, 'INV-2026-002', '2026-11-01');

    expect(copy.items).not.toBe(source.items);
    expect(copy.sections).not.toBe(source.sections);
    expect(copy.discount).not.toBe(source.discount);
    expect(copy.tax).not.toBe(source.tax);
  });
});
