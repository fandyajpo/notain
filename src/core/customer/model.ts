/** Column bounds on the Appwrite `customers` table. */
export const CUSTOMER_LIMITS = {
  name: 128,
  phone: 32,
} as const;

/**
 * A customer as the app knows them.
 *
 * This is the one place a customer *exists*. Invoices still embed
 * `customerName`/`customerPhone` on purpose — the printed document must keep
 * the name it was issued with even if the customer is renamed or deleted
 * later. The row here is only a directory for the picker.
 */
export type Customer = {
  id: string;
  name: string;
  phone: string;
  /** ISO timestamp of the most recent invoice that used this customer. */
  lastUsedAt: string;
};

/** What the picker and the invoice form hold before it becomes a row. */
export type CustomerDraft = {
  name: string;
  phone: string;
};

/**
 * Folds a phone number into a comparable form.
 *
 * Indonesian numbers reach the form in at least three shapes — `0812…`,
 * `62812…` and `+62 812…` — and treating them as three different people is
 * what makes a hand-rolled customer list useless. Only the *key* is
 * normalised; the stored value keeps whatever the user typed.
 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('62') && digits.length > 4) return `0${digits.slice(2)}`;
  return digits;
}

/** Identity used to decide whether two drafts are the same customer. */
export function customerKey(draft: Pick<CustomerDraft, 'name' | 'phone'>): string {
  return `${draft.name.trim().toLowerCase()} ${normalizePhone(draft.phone)}`;
}
