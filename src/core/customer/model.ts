/** Column bounds on the Appwrite `customers` table. */
export const CUSTOMER_LIMITS = {
  name: 128,
  email: 255,
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
  email: string;
  phone: string;
  /** ISO timestamp of the most recent invoice that used this customer. */
  lastUsedAt: string;
};

/** What the picker and the invoice form hold before it becomes a row. */
export type CustomerDraft = {
  name: string;
  email: string;
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

/**
 * Identity: two contacts are the same person when they share the same email
 * OR the same phone (folded). Name is deliberately not part of identity —
 * "Budi" with the same number is the same person even if one row spells it
 * "B. Santoso".
 *
 * Returns `null` when the draft has neither email nor phone — there is
 * nothing to match on, so it can only ever be a new person.
 */
export function customerIdentity(draft: Pick<CustomerDraft, 'email' | 'phone'>): string | null {
  const email = draft.email.trim().toLowerCase();
  if (email) return `email:${email}`;
  const phone = normalizePhone(draft.phone);
  if (phone) return `phone:${phone}`;
  return null;
}

/**
 * Whether two contacts are the same person.
 *
 * Matches when either the email or the phone is identical (phone folded).
 * A contact with neither field can never match anything.
 */
export function isSameCustomer(
  a: Pick<CustomerDraft, 'email' | 'phone'>,
  b: Pick<CustomerDraft, 'email' | 'phone'>,
): boolean {
  const emailA = a.email.trim().toLowerCase();
  const emailB = b.email.trim().toLowerCase();
  if (emailA && emailB && emailA === emailB) return true;

  const phoneA = normalizePhone(a.phone);
  const phoneB = normalizePhone(b.phone);
  if (phoneA && phoneB && phoneA === phoneB) return true;

  return false;
}

/**
 * Merges an incoming draft into an existing contact, filling only the fields
 * that are empty on the existing side. A field the existing contact already
 * has is never overwritten — the printed invoice must keep the number the
 * user originally gave, and a manual edit is how you correct a stored value.
 */
export function mergeCustomer(
  existing: Pick<CustomerDraft, 'name' | 'email' | 'phone'>,
  incoming: Pick<CustomerDraft, 'name' | 'email' | 'phone'>,
): CustomerDraft {
  return {
    name: existing.name.trim() || incoming.name.trim(),
    email: existing.email.trim() || incoming.email.trim(),
    phone: existing.phone.trim() || incoming.phone.trim(),
  };
}
