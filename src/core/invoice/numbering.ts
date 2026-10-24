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

/**
 * The invoice document id, derived from *who owns which number*.
 *
 * Creating an invoice with this id is what turns "one number per owner" from
 * a client-side promise into a server-side fact: Appwrite rejects a second
 * document with the same id, so two tabs that both offer themselves
 * `INV-2026-007` and both hit save cannot both win — the loser gets a 409 and
 * is told to pick another number. No extra round trip, no new table, no
 * schema change: the uniqueness primitive Appwrite already enforces is the
 * document id itself.
 *
 * `inv_` + 32 hex chars = exactly 36 characters, Appwrite's id limit, and a
 * shape `ID_SEGMENT_PATTERN` already accepts for the URL routes. sha-256 over
 * `owner: number` keeps ids distinct across tenants (every owner starts at
 * `INV-2026-001`) with collision odds that do not merit a thought.
 *
 * Web Crypto runs everywhere this module is bundled — browser, Pages Function,
 * test runner — so the admin Function can mint the same id as the app.
 */
export async function invoiceDocumentId(ownerId: string, invoiceNumber: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${ownerId}:${invoiceNumber}`),
  );
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `inv_${hex.slice(0, 32)}`;
}
