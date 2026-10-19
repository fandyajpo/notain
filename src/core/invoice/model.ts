/** Domain model for an invoice. Pure data — no framework or SDK types. */

import { addDaysIsoDate, diffDaysIsoDate } from '../shared/dates';

export const ADJUSTMENT_TYPES = ['amount', 'percent'] as const;
export type AdjustmentType = (typeof ADJUSTMENT_TYPES)[number];

/**
 * Lifecycle status of an invoice, set manually by the owner.
 *
 * A fresh invoice is *unset* (`null` — "Belum dikirim") and moves forward only:
 * `null → sent → paid | void`, with `paid` and `void` terminal. The rules live
 * in `core/invoice/status.ts`; this module only names the states. `draft` is
 * deliberately absent — the builder's autosave is the draft state, and a saved
 * invoice is always something the user meant to issue.
 */
export const INVOICE_STATUSES = ['sent', 'paid', 'void'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** Indonesian labels for each set status, shown in the table and the export. */
export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  sent: 'Terkirim',
  paid: 'Lunas',
  void: 'Batal',
};

/** Label for the unset (`null`) status — an invoice not sent yet. */
export const UNSET_STATUS_LABEL = 'Belum dikirim';

/** Display label for any status, unset included. */
export function invoiceStatusLabel(status: InvoiceStatus | null): string {
  return status === null ? UNSET_STATUS_LABEL : INVOICE_STATUS_LABELS[status];
}

/**
 * Hard limits shared by validation and persistence. The Appwrite columns are
 * sized from these numbers, so keep them in sync when either changes.
 */
export const INVOICE_LIMITS = {
  invoiceNumber: 32,
  customerName: 128,
  customerPhone: 32,
  customerEmail: 255,
  itemName: 200,
  /** Unit label per item ('pcs', 'liter', 'sesi'…). Empty means "no unit". */
  unit: 16,
  maxItems: 100,
  maxQuantity: 1_000_000,
  maxUnitPrice: 1_000_000_000_000,
  maxPercent: 100,
  richText: 20_000,
  notes: 5_000,
  /** Max characters per business detail value ('Avanza', '3', '2026-10-01'). */
  detailValue: 128,
  /** Max entries in the `details` record — a bound, not a requirement. */
  maxDetails: 16,
} as const;

export type InvoiceItem = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  /**
   * Optional unit the quantity is counted in. Absent for the vast majority of
   * rows written before this field existed, and for goods priced per piece —
   * the item table only shows its "Satuan" column once one item uses it.
   */
  unit?: string;
  /**
   * Whether this row should also be filed into the owner's catalog when the
   * invoice is saved. Transient UI state: absent means "yes" (the box ships
   * ticked), and it is deliberately stripped before the invoice is stored — see
   * `invoiceItemSchema`, whose output drops the key.
   */
  saveToCatalog?: boolean;
};

/**
 * A discount or tax. When `type` is `amount` the value is Rupiah, when it is
 * `percent` the value is a percentage of the preceding amount.
 */
export type InvoiceAdjustment = {
  type: AdjustmentType;
  value: number;
};

/**
 * The three rich-text zones a user can freely edit on an invoice.
 * `header` sits under the letterhead, `content` sits between the item table
 * and the totals, `footer` sits at the very bottom.
 */
export type InvoiceSections = {
  header: string;
  content: string;
  footer: string;
};

/** Everything a user authors before it is persisted. */
export type InvoiceDraft = {
  invoiceNumber: string;
  date: string;
  dueDate?: string;
  /**
   * The template this invoice is dressed in. Stored by reference, so editing a
   * template changes how the invoices pointing at it render — there is no
   * snapshot copy to drift out of sync. Resolving an id that no longer exists
   * falls back to a built-in; see `core/template/resolve`.
   */
  templateId?: string;
  /**
   * `null` until the owner sends the invoice — "Belum dikirim". Once set it
   * only moves forward (see `core/invoice/status.ts`), never back to `null`.
   */
  status: InvoiceStatus | null;
  customerName: string;
  customerPhone?: string;
  /** Optional contact carried from the customer directory; never required. */
  customerEmail?: string;
  items: InvoiceItem[];
  discount: InvoiceAdjustment;
  tax: InvoiceAdjustment;
  sections: InvoiceSections;
  notes?: string;
  /**
   * Business-specific facts keyed by their catalogue key (see
   * core/business/detail-fields): a bengkel's vehicle name and plate, a
   * laundry's weight. Values are raw strings as typed — dates in ISO form,
   * numbers as plain digits. Keys outside the current type's catalogue are
   * kept, not purged: switching a template must not destroy typed values.
   */
  details: Record<string, string>;
};

/**
 * A payment proof the customer uploaded through the public print page.
 *
 * Stored as two columns on the invoice row (`paymentProofKey`,
 * `paymentProofUploadedAt`) rather than its own table: one proof per invoice,
 * uploaded at most once until the owner deletes it — a key and a timestamp is
 * all that state needs. The image itself lives in R2 under `key`; the print
 * page and the owner's views load it through `GET /api/proof/:key`.
 */
export type InvoicePaymentProof = {
  /** R2 object key (`proofs_<invoiceId>_<hex>.<ext>`). */
  key: string;
  /** ISO timestamp of the upload. */
  uploadedAt: string;
};

export type Invoice = InvoiceDraft & {
  id: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  /**
   * The customer's uploaded payment proof, or `null` when none has arrived.
   * Set only by the public upload endpoint — a draft save never writes it.
   */
  paymentProof?: InvoicePaymentProof | null;
};

/**
 * Whether the owner still has to check a payment: a proof arrived but the
 * invoice is not (yet) marked Lunas. Clearing the proof, flipping the status
 * to `paid`, or cancelling the invoice (`void` — nothing is owed anymore)
 * all drop the flag — the badge is a to-do, not a record.
 */
export function needsPaymentCheck(
  invoice: Pick<Invoice, 'status' | 'paymentProof'>,
): boolean {
  return invoice.paymentProof != null && invoice.status !== 'paid' && invoice.status !== 'void';
}

/**
 * The slice of an invoice the picker derives its customer/product suggestions
 * from — the full invoice minus the rich-text sections, adjustments and notes it
 * never reads.
 *
 * Fetched through a projected query (`Query.select`) so opening the picker does
 * not ship every invoice's HTML. `Invoice` satisfies it structurally, so a full
 * invoice can still be handed to `derivePickerOptions` directly.
 */
export type InvoiceHistoryEntry = Pick<
  Invoice,
  'customerName' | 'customerPhone' | 'customerEmail' | 'items' | 'date' | 'createdAt' | 'updatedAt'
>;

export const EMPTY_ADJUSTMENT: InvoiceAdjustment = { type: 'amount', value: 0 };

export const EMPTY_SECTIONS: InvoiceSections = { header: '', content: '', footer: '' };

export function createEmptyDraft(invoiceNumber: string, date: string): InvoiceDraft {
  return {
    invoiceNumber,
    date,
    status: null,
    customerName: '',
    items: [],
    discount: { ...EMPTY_ADJUSTMENT },
    tax: { ...EMPTY_ADJUSTMENT },
    sections: { ...EMPTY_SECTIONS },
    details: {},
  };
}

export function createItem(id: string): InvoiceItem {
  // No unit on a blank row: the grid's unit column stays hidden until the
  // user actually types one (or a seeded sample item brings its own).
  return { id, name: '', quantity: 1, unitPrice: 0, saveToCatalog: true };
}

/** A pre-filled row, as applied when a product is picked from invoice history. */
export function createPickedItem(
  id: string,
  pick: { name: string; quantity: number; unitPrice: number; unit?: string },
): InvoiceItem {
  return {
    id,
    name: pick.name,
    quantity: pick.quantity,
    unitPrice: pick.unitPrice,
    ...(pick.unit ? { unit: pick.unit } : {}),
    saveToCatalog: true,
  };
}

/**
 * Fresh id for a new row. The grid and the React builder both add items, and
 * they live in separate bundles, so the id must not depend on a shared
 * counter — timestamp plus a random tail is enough.
 */
export function createItemId(): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `item-${Date.now()}-${random}`;
}

/**
 * A copy of `source` dressed as a brand-new invoice.
 *
 * Duplicating exists so a recurring customer does not have to be re-typed, so
 * everything the user authored — customer, items, discount, tax, prose, notes,
 * template — is carried over verbatim. What has to change is the identity: a
 * fresh number and date, plus new item ids so the grid never shares a React
 * key with the invoice it came from.
 *
 * The due date keeps its original offset from the invoice date rather than the
 * old calendar day, so "net 14" stays "net 14" however far apart the two
 * invoices are.
 */
export function duplicateDraft(
  source: InvoiceDraft,
  invoiceNumber: string,
  date: string,
): InvoiceDraft {
  const dueDate =
    source.dueDate !== undefined
      ? addDaysIsoDate(date, diffDaysIsoDate(source.date, source.dueDate))
      : undefined;

  return {
    invoiceNumber,
    date,
    dueDate,
    templateId: source.templateId,
    // A duplicate is a fresh invoice, so it restarts unset ("Belum dikirim")
    // regardless of the source's status.
    status: null,
    customerName: source.customerName,
    customerPhone: source.customerPhone,
    customerEmail: source.customerEmail,
    items: source.items.map((item) => ({ ...item, id: createItemId() })),
    discount: { ...source.discount },
    tax: { ...source.tax },
    sections: { ...source.sections },
    notes: source.notes,
    details: { ...source.details },
  };
}
