import { describe, expect, it } from 'vitest';
import {
  buildInvoiceWhatsAppMessage,
  buildPaymentReminderMessage,
  buildWhatsAppUrl,
  normalizeWhatsAppPhone,
} from './whatsapp';

describe('normalizeWhatsAppPhone', () => {
  it('converts local numbers to the 62 country code', () => {
    expect(normalizeWhatsAppPhone('081234567890')).toBe('6281234567890');
    expect(normalizeWhatsAppPhone('81234567890')).toBe('6281234567890');
  });

  it('leaves an international number alone', () => {
    expect(normalizeWhatsAppPhone('+62 812-3456-7890')).toBe('6281234567890');
  });

  it('strips formatting characters', () => {
    expect(normalizeWhatsAppPhone('0812 3456 7890')).toBe('6281234567890');
  });
});

describe('buildWhatsAppUrl', () => {
  it('encodes the message as the text parameter', () => {
    const url = buildWhatsAppUrl({ message: 'Halo 👋' });
    expect(url).toBe(`https://wa.me/?text=${encodeURIComponent('Halo 👋')}`);
  });

  it('targets the customer when a phone is given', () => {
    const url = buildWhatsAppUrl({ phone: '081234567890', message: 'hi' });
    expect(url.startsWith('https://wa.me/6281234567890?text=')).toBe(true);
  });
});

describe('buildInvoiceWhatsAppMessage', () => {
  it('names the customer, invoice, business, and total', () => {
    const message = buildInvoiceWhatsAppMessage({
      customerName: 'Budi',
      invoiceNumber: 'INV-2026-001',
      businessName: 'Warung Maju Jaya',
      total: 73_926,
    });

    expect(message).toContain('Halo Budi');
    expect(message).toContain('INV-2026-001');
    expect(message).toContain('Warung Maju Jaya');
    expect(message).toContain('Rp73.926');
  });
});

describe('buildPaymentReminderMessage', () => {
  it('includes the formatted due date when one exists', () => {
    const message = buildPaymentReminderMessage({
      customerName: 'Budi',
      invoiceNumber: 'INV-2026-002',
      businessName: 'Warung Maju Jaya',
      total: 50_000,
      dueDate: '2026-10-01',
    });

    expect(message).toContain('Halo Budi');
    expect(message).toContain('INV-2026-002');
    expect(message).toContain('Rp50.000');
    expect(message).toContain('jatuh tempo');
    expect(message).toContain('1 Oktober 2026');
  });

  it('falls back to a plain unpaid note without a due date', () => {
    const message = buildPaymentReminderMessage({
      customerName: 'Budi',
      invoiceNumber: 'INV-2026-003',
      businessName: 'Warung Maju Jaya',
      total: 15_000,
    });

    expect(message).toContain('belum dibayar');
    expect(message).not.toContain('jatuh tempo');
  });
});
