import { todayIsoDate, addDaysIsoDate } from '../shared/dates';
import { EMPTY_SECTIONS, type InvoiceDraft } from './model';
import { SAMPLE_ISSUER, type BusinessIssuer } from '../business/issuer';

export const SAMPLE_BUSINESS = SAMPLE_ISSUER;

/**
 * A realistic invoice used both as the landing-page demo and as the
 * one-click example a new user can load into the builder.
 *
 * Pass the signed-in user's business to make the sample read like their own
 * document — the template previews do this so the list shows their real
 * business name instead of the demo's.
 */
export function createSampleInvoice(
  now: Date = new Date(),
  business: BusinessIssuer = SAMPLE_ISSUER,
): {
  business: BusinessIssuer;
  draft: InvoiceDraft;
} {
  const date = todayIsoDate(now);
  // The organization's display name, not the account holder's personal one —
  // the same issuer rule InvoicePreview uses for the letterhead, so the copy
  // and the header always name the same business.
  const issuer = business.businessName || business.name;
  return {
    business,
    draft: {
      invoiceNumber: 'INV-2026-001',
      date,
      dueDate: addDaysIsoDate(date, 7),
      status: 'sent',
      customerName: 'Budi Santoso',
      customerPhone: '081298765432',
      items: [
        { id: 'sample-1', name: 'Nasi Goreng Spesial', quantity: 2, unitPrice: 25_000 },
        { id: 'sample-2', name: 'Es Teh Manis', quantity: 3, unitPrice: 8_000 },
        { id: 'sample-3', name: 'Kerupuk Udang', quantity: 1, unitPrice: 10_000 },
      ],
      discount: { type: 'percent', value: 5 },
      tax: { type: 'percent', value: 11 },
      sections: {
        ...EMPTY_SECTIONS,
        header: `<p>Terima kasih sudah memesan di ${issuer}. Berikut rincian pesanan kamu.</p>`,
        content:
          '<p>Pesanan diproses maksimal 1×24 jam. Hubungi kami bila ada perubahan jumlah.</p>',
        footer: `<p><strong>Pembayaran:</strong> BCA 1234567890 a.n. ${issuer}</p><p>Terima kasih 🙏</p>`,
      },
      notes: 'Terima kasih sudah berbelanja. Semoga sehat selalu!',
      details: {},
    },
  };
}
