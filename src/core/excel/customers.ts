import type { Customer, CustomerDraft } from '../customer/model';
import { customerDraftSchema } from '../customer/schema';
import type { SheetRow } from './csv';

/** Header row written by export and expected by import. */
export const CUSTOMER_COLUMNS = ['Nama', 'Email', 'WhatsApp'] as const;

/** Rows a downloaded template ships with — a header plus one worked example. */
export const CUSTOMER_TEMPLATE_ROWS: SheetRow[] = [
  ['Nama', 'Email', 'WhatsApp'],
  ['Budi Santoso', 'budi@email.com', '081234567890'],
];

/** Header aliases accepted on import, lowercased and trimmed. */
const NAME_ALIASES = ['nama', 'name'];
const EMAIL_ALIASES = ['email', 'e-mail', 'surel'];
const PHONE_ALIASES = ['whatsapp', 'wa', 'no hp', 'no. hp', 'telepon', 'telp', 'phone', 'nomor'];

/** One spreadsheet row per customer — what export writes. */
export function toCustomerRow(customer: Customer): SheetRow {
  return [customer.name, customer.email, customer.phone];
}

/** Full sheet: header first, then one row per customer, oldest use last. */
export function toCustomerRows(customers: Customer[]): SheetRow[] {
  return [[...CUSTOMER_COLUMNS], ...customers.map(toCustomerRow)];
}

export type CustomerImportIssue = { row: number; message: string };

export type CustomerImportResult = {
  customers: CustomerDraft[];
  issues: CustomerImportIssue[];
};

function findColumn(header: string[], aliases: string[]): number {
  return header.findIndex((cell) => aliases.includes(cell));
}

/**
 * Turn raw sheet rows into customer drafts plus a list of row-level problems.
 *
 * The first row is treated as the header and matched case-insensitively against
 * `Nama`/`WhatsApp` (with a few common aliases). Fully blank rows are skipped.
 * Each data row is validated with the same `customerDraftSchema` the invoice
 * form uses, so import enforces exactly the rules a manual entry would.
 * Row numbers in `issues` are 1-based spreadsheet rows, so the first data row
 * reports as row 2 — the number a user sees in Excel.
 */
export function parseCustomerImportRows(rows: SheetRow[]): CustomerImportResult {
  const customers: CustomerDraft[] = [];
  const issues: CustomerImportIssue[] = [];

  if (rows.length === 0) return { customers, issues };

  const header = rows[0].map((cell) => String(cell).trim().toLowerCase());
  const nameIdx = findColumn(header, NAME_ALIASES);
  const emailIdx = findColumn(header, EMAIL_ALIASES);
  const phoneIdx = findColumn(header, PHONE_ALIASES);

  if (nameIdx === -1) {
    issues.push({ row: 1, message: 'Kolom "Nama" tidak ditemukan di baris header.' });
    return { customers, issues };
  }

  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r];
    if (row.every((cell) => String(cell).trim() === '')) continue;

    const parsed = customerDraftSchema.safeParse({
      name: String(row[nameIdx] ?? '').trim(),
      email: emailIdx === -1 ? '' : String(row[emailIdx] ?? '').trim(),
      phone: phoneIdx === -1 ? '' : String(row[phoneIdx] ?? '').trim(),
    });

    if (!parsed.success) {
      const message = parsed.error.issues.map((issue) => issue.message).join(' ');
      issues.push({ row: r + 1, message });
      continue;
    }

    customers.push({
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone,
    });
  }

  return { customers, issues };
}
