/**
 * Invoice numbers look like `INV-2026-001`. They are user-facing and therefore
 * sequential within a calendar year, derived from the numbers that already
 * exist rather than from a stored counter.
 */

export const INVOICE_NUMBER_PREFIX = 'INV';

export function invoiceNumberPrefix(year: number): string {
  return `${INVOICE_NUMBER_PREFIX}-${year}-`;
}

export function formatInvoiceNumber(year: number, sequence: number): string {
  return `${invoiceNumberPrefix(year)}${String(sequence).padStart(3, '0')}`;
}

export function extractInvoiceSequence(invoiceNumber: string, year: number): number | null {
  const prefix = invoiceNumberPrefix(year);
  if (!invoiceNumber.startsWith(prefix)) return null;
  const suffix = invoiceNumber.slice(prefix.length);
  if (!/^\d{1,9}$/.test(suffix)) return null;
  const sequence = Number(suffix);
  return Number.isInteger(sequence) && sequence > 0 ? sequence : null;
}

/** Returns the next free invoice number for `year` given existing numbers. */
export function nextInvoiceNumber(
  existingNumbers: ReadonlyArray<string>,
  now: Date = new Date(),
): string {
  const year = now.getFullYear();
  const highest = existingNumbers
    .map((number) => extractInvoiceSequence(number, year))
    .filter((sequence): sequence is number => sequence !== null)
    .reduce((max, sequence) => Math.max(max, sequence), 0);
  return formatInvoiceNumber(year, highest + 1);
}

export function isInvoiceNumber(value: string): boolean {
  return /^INV-\d{4}-\d{3,9}$/.test(value);
}
