/** Domain model for an invoice. Pure data — no framework or SDK types. */

import { addDaysIsoDate, diffDaysIsoDate } from '../shared/dates';

export const ADJUSTMENT_TYPES = ['amount', 'percent'] as const;
export type AdjustmentType = (typeof ADJUSTMENT_TYPES)[number];

/**
 * Lifecycle status of an invoice, set manually by the owner.
 *
 * There is no automatic transition: an invoice is issued as `sent`, and the
 * user flips it to `paid` once the money lands or to `void` when it is
 * cancelled. `draft` is deliberately absent — the builder's autosave is the
 * draft state, and a saved invoice is always something the user meant to issue.
 */
export const INVOICE_STATUSES = ['sent', 'paid', 'void'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** Indonesian labels for each status, shown in the table and the export. */
export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  sent: 'Terkirim',
  paid: 'Lunas',
  void: 'Batal',
};

/**
 * Hard limits shared by validation and persistence. The Appwrite columns are
 * sized from these numbers, so keep them in sync when either changes.
 */
export const INVOICE_LIMITS = {
  invoiceNumber: 32,
  customerName: 128,
  customerPhone: 32,
  itemName: 200,
  maxItems: 100,
  maxQuantity: 1_000_000,
  maxUnitPrice: 1_000_000_000_000,
  maxPercent: 100,
  richText: 20_000,
  notes: 5_000,
} as const;

export type InvoiceItem = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
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
  status: InvoiceStatus;
  customerName: string;
  customerPhone?: string;
  items: InvoiceItem[];
  discount: InvoiceAdjustment;
  tax: InvoiceAdjustment;
  sections: InvoiceSections;
  notes?: string;
};

export type Invoice = InvoiceDraft & {
  id: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
};

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
  'customerName' | 'customerPhone' | 'items' | 'date' | 'createdAt' | 'updatedAt'
>;

export const EMPTY_ADJUSTMENT: InvoiceAdjustment = { type: 'amount', value: 0 };

export const EMPTY_SECTIONS: InvoiceSections = { header: '', content: '', footer: '' };

export function createEmptyDraft(invoiceNumber: string, date: string): InvoiceDraft {
  return {
    invoiceNumber,
    date,
    status: 'sent',
    customerName: '',
    items: [],
    discount: { ...EMPTY_ADJUSTMENT },
    tax: { ...EMPTY_ADJUSTMENT },
    sections: { ...EMPTY_SECTIONS },
  };
}

export function createItem(id: string): InvoiceItem {
  return { id, name: '', quantity: 1, unitPrice: 0 };
}

/** A pre-filled row, as applied when a product is picked from invoice history. */
export function createPickedItem(
  id: string,
  pick: { name: string; quantity: number; unitPrice: number },
): InvoiceItem {
  return { id, name: pick.name, quantity: pick.quantity, unitPrice: pick.unitPrice };
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
    // A duplicate is a fresh invoice, so it restarts as `sent` regardless of
    // the source's status.
    status: 'sent',
    customerName: source.customerName,
    customerPhone: source.customerPhone,
    items: source.items.map((item) => ({ ...item, id: createItemId() })),
    discount: { ...source.discount },
    tax: { ...source.tax },
    sections: { ...source.sections },
    notes: source.notes,
  };
}
