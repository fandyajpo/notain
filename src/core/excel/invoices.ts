import type { Invoice } from '../invoice/model';
import { calculateTotals } from '../invoice/calculator';
import { formatTanggal } from '../shared/dates';
import type { SheetRow } from './csv';

/** Header for the invoice export — a one-line-per-invoice summary. */
export const INVOICE_COLUMNS = [
  'No. Invoice',
  'Tanggal',
  'Jatuh Tempo',
  'Customer',
  'WhatsApp',
  'Jumlah Item',
  'Subtotal',
  'Diskon',
  'Pajak',
  'Total',
  'Catatan',
] as const;

/**
 * One spreadsheet row per invoice. Money and item count are written as plain
 * numbers (not formatted Rupiah) so the columns stay sortable and summable in
 * Excel; dates are rendered in the user's locale because the export is meant to
 * be read, not re-imported.
 */
export function toInvoiceRow(invoice: Invoice): SheetRow {
  const totals = calculateTotals({
    items: invoice.items,
    discount: invoice.discount,
    tax: invoice.tax,
  });

  return [
    invoice.invoiceNumber,
    formatTanggal(invoice.date),
    invoice.dueDate ? formatTanggal(invoice.dueDate) : '',
    invoice.customerName,
    invoice.customerPhone ?? '',
    invoice.items.length,
    totals.subtotal,
    totals.discountAmount,
    totals.taxAmount,
    totals.grandTotal,
    invoice.notes ?? '',
  ];
}

/** Full sheet: header first, then one row per invoice, oldest issued first. */
export function toInvoiceRows(invoices: Invoice[]): SheetRow[] {
  const sorted = [...invoices].sort((a, b) => a.date.localeCompare(b.date));
  return [[...INVOICE_COLUMNS], ...sorted.map(toInvoiceRow)];
}
