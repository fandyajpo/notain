import type { InvoiceAdjustment, InvoiceItem } from './model';

/**
 * Optimistic concurrency for invoice *content*, without a version column.
 *
 * The admin panel is a second writer on rows the owner may also have open in
 * their builder, and a content save writes the whole content half of the row —
 * so two editors silently clobber each other. `$updatedAt` cannot version it:
 * status flips and payment-proof uploads bump the same timestamp while leaving
 * every content column alone, so comparing it would refuse saves that are
 * perfectly fine.
 *
 * The fingerprint covers exactly the columns `draftToRowUpdateData` writes.
 * The client hashes the draft its dialog *loaded*; the server re-hashes the
 * stored row on save and refuses on a mismatch. Both sides run this same
 * projection, so the round trip through the row mappers cannot drift.
 */

/** Exactly the fields a content write touches — what a fingerprint covers. */
export type InvoiceContentSource = {
  invoiceNumber: string;
  date: string;
  dueDate?: string;
  templateId?: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  items: InvoiceItem[];
  details: Record<string, string>;
  discount: InvoiceAdjustment;
  tax: InvoiceAdjustment;
  sections: { header: string; content: string; footer: string };
  notes?: string;
};

/**
 * Recursively key-sorted JSON, with `undefined` dropped the way
 * `JSON.stringify` would drop it. Two structurally equal objects therefore
 * serialise to the same bytes however their keys were ordered on the way in —
 * which is the whole point, since one side reads through a row mapper and the
 * other through an HTTP body.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(entries.map(([key, entry]) => [key, canonicalize(entry)]));
  }
  return value;
}

/** The canonical JSON of the content columns — the exact bytes that are hashed. */
export function invoiceContentPayload(source: InvoiceContentSource): string {
  // Projected rather than passed through: `id`, `ownerId`, `status`, the
  // payment proof and the timestamps ride along on both sides' objects, and
  // none of them is something a content write can change.
  const content = {
    invoiceNumber: source.invoiceNumber,
    date: source.date,
    dueDate: source.dueDate,
    templateId: source.templateId,
    customerName: source.customerName,
    customerPhone: source.customerPhone,
    customerEmail: source.customerEmail,
    items: source.items,
    details: source.details,
    discount: source.discount,
    tax: source.tax,
    sections: source.sections,
    notes: source.notes,
  };
  return JSON.stringify(canonicalize(content));
}

/** SHA-256 of {@link invoiceContentPayload}, hex-encoded. */
export async function invoiceContentFingerprint(source: InvoiceContentSource): Promise<string> {
  const bytes = new TextEncoder().encode(invoiceContentPayload(source));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
