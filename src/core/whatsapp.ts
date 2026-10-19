import { formatTanggal } from './shared/dates';
import { formatRupiah, type Rupiah } from './shared/money';

export type WhatsAppMessageInput = {
  customerName: string;
  invoiceNumber: string;
  businessName: string;
  total: Rupiah;
};

/** Converts an Indonesian phone number to international `62…` form. */
export function normalizeWhatsAppPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('8')) return `62${digits}`;
  return digits;
}

export function buildInvoiceWhatsAppMessage(input: WhatsAppMessageInput): string {
  return [
    `Halo ${input.customerName} 👋`,
    '',
    `Berikut invoice ${input.invoiceNumber}`,
    `dari ${input.businessName} sebesar ${formatRupiah(input.total)}.`,
    '',
    'Terima kasih 🙏',
  ].join('\n');
}

export type PaymentReminderInput = {
  customerName: string;
  invoiceNumber: string;
  businessName: string;
  total: Rupiah;
  /** ISO due date; omitted for invoices that never had one. */
  dueDate?: string;
};

/**
 * Nudge for an unpaid invoice, sent straight from the dashboard's "Perlu
 * perhatian" list. Stays polite and specific: who it is for, what is owed,
 * and by when (when a due date exists — many invoices have none).
 */
export function buildPaymentReminderMessage(input: PaymentReminderInput): string {
  const dueLine =
    input.dueDate !== undefined && input.dueDate !== ''
      ? `yang jatuh tempo pada ${formatTanggal(input.dueDate)}`
      : 'yang belum dibayar';
  return [
    `Halo ${input.customerName} 👋`,
    '',
    `Ini pengingat pembayaran invoice ${input.invoiceNumber}`,
    `dari ${input.businessName} sebesar ${formatRupiah(input.total)}`,
    `${dueLine}.`,
    '',
    'Terima kasih 🙏',
  ].join('\n');
}

export function buildWhatsAppUrl(input: { phone?: string; message: string }): string {
  const phone = input.phone ? normalizeWhatsAppPhone(input.phone) : '';
  const query = `?text=${encodeURIComponent(input.message)}`;
  return phone ? `https://wa.me/${phone}${query}` : `https://wa.me/${query}`;
}
