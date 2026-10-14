import type { InvoiceHistoryEntry } from '../../core/invoice/model';
import type { Customer } from '../../core/customer/model';
import { isSameCustomer } from '../../core/customer/model';

/**
 * Derives picker suggestions from invoice history instead of a dedicated
 * customer/product table (MVP: no Customer or Product entities exist —
 * invoices embed customerName/customerPhone and their items).
 */

export type CustomerOption = {
  kind: 'customer';
  /** Display label, always the trimmed name. */
  label: string;
  name: string;
  /** Empty string when the customer never gave an email. */
  email: string;
  /** Empty string when the customer never had a WhatsApp number. */
  phone: string;
  /** ISO timestamp of the most recent invoice that used this customer. */
  lastUsedAt: string;
  /** Number of distinct invoices that used this customer. */
  invoiceCount: number;
};

export type ProductOption = {
  kind: 'product';
  label: string;
  name: string;
  unitPrice: number;
  lastUsedAt: string;
  invoiceCount: number;
};

export type PickerOptions = {
  customers: CustomerOption[];
  products: ProductOption[];
};

/** How many suggestions each list keeps before older entries are dropped. */
export const PICKER_OPTION_LIMIT = 20;

const EMPTY: PickerOptions = { customers: [], products: [] };

/**
 * Folds invoice history into deduplicated, recency-sorted picker options.
 *
 * Accepts the narrow `InvoiceHistoryEntry` slice (customer, items and the
 * timestamps the sort reads) rather than a full `Invoice`, matching what the
 * picker's projected query actually fetches — the rich-text sections it never
 * looks at are never transferred.
 *
 * - Customers are keyed by trimmed name + phone (same name, different number
 *   stays two entries).
 * - Products are keyed by trimmed name + unit price (a price change is a new
 *   suggestion rather than a silent overwrite).
 * - Entries with a blank name are skipped — there is nothing to label.
 * - Each list is capped at `limit`, newest first.
 */
export function derivePickerOptions(
  invoices: ReadonlyArray<InvoiceHistoryEntry> | null | undefined,
  limit: number = PICKER_OPTION_LIMIT,
): PickerOptions {
  if (!invoices || invoices.length === 0 || limit <= 0) return EMPTY;

  const customers = new Map<string, CustomerOption>();
  const products = new Map<string, ProductOption>();

  // Oldest first, so the newest invoice wins every recency/count merge.
  const ordered = [...invoices].sort((a, b) => stampOf(a) - stampOf(b));

  for (const invoice of ordered) {
    const usedAt = isoOf(stampOf(invoice));

    const name = invoice.customerName.trim();
    if (name) {
      const phone = (invoice.customerPhone ?? '').trim();
      const key = name.toLowerCase() + ' ' + phone;
      const existing = customers.get(key);
      if (existing) {
        existing.invoiceCount += 1;
        existing.lastUsedAt = usedAt;
      } else {
        customers.set(key, {
          kind: 'customer',
          label: name,
          name,
          email: '',
          phone,
          lastUsedAt: usedAt,
          invoiceCount: 1,
        });
      }
    }

    const seenInInvoice = new Set<string>();
    for (const item of invoice.items) {
      const itemName = item.name.trim();
      if (!itemName) continue;
      const key = itemName.toLowerCase() + ' ' + item.unitPrice;
      if (seenInInvoice.has(key)) continue;
      seenInInvoice.add(key);

      const existing = products.get(key);
      if (existing) {
        existing.invoiceCount += 1;
        existing.lastUsedAt = usedAt;
      } else {
        products.set(key, {
          kind: 'product',
          label: itemName,
          name: itemName,
          unitPrice: item.unitPrice,
          lastUsedAt: usedAt,
          invoiceCount: 1,
        });
      }
    }
  }

  return {
    customers: topByRecency([...customers.values()], limit),
    products: topByRecency([...products.values()], limit),
  };
}

/** Recency stamp: updated, then created, then the invoice date. */
function stampOf(invoice: InvoiceHistoryEntry): number {
  const value = invoice.updatedAt || invoice.createdAt || invoice.date;
  return parseStamp(value);
}

function parseStamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isoOf(stamp: number): string {
  return new Date(stamp).toISOString();
}

function topByRecency<T extends { lastUsedAt: string; label: string; invoiceCount: number }>(
  items: readonly T[],
  limit: number,
): T[] {
  return [...items]
    .sort((a, b) => {
      const byRecency = parseStamp(b.lastUsedAt) - parseStamp(a.lastUsedAt);
      if (byRecency !== 0) return byRecency;
      if (b.invoiceCount !== a.invoiceCount) return b.invoiceCount - a.invoiceCount;
      return a.label.localeCompare(b.label);
    })
    .slice(0, limit);
}

/**
 * Folds the saved-customer directory into the suggestions.
 *
 * The directory is the source of truth for who exists, but it only starts
 * filling up from the moment it shipped — an account with a year of invoices
 * and no rows would show an empty picker. So stored customers lead, and any
 * customer that appears in history but was never filed is appended after them
 * rather than dropped.
 *
 * `derived` is expected to already be sorted newest-first, which is what
 * `derivePickerOptions` returns.
 */
export function mergeCustomerOptions(
  stored: readonly Customer[],
  derived: readonly CustomerOption[],
): CustomerOption[] {
  const filed = stored
    .filter((customer) => customer.name.trim() !== '')
    .map<CustomerOption>((customer) => ({
      kind: 'customer',
      label: customer.name,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      lastUsedAt: customer.lastUsedAt,
      invoiceCount: 0,
    }));

  // A derived option that shares an email or phone with a stored customer is
  // the same person and is skipped — the stored row already represents them.
  const missing = derived.filter(
    (option) => !filed.some((f) => isSameCustomer(f, option)),
  );

  // Deduplicate the combined list by email-or-phone identity. The first
  // occurrence wins; `filed` comes first so a stored row beats a derived one.
  const combined: CustomerOption[] = [];
  for (const option of [...filed, ...missing]) {
    if (!combined.some((row) => isSameCustomer(row, option))) {
      combined.push(option);
    }
  }

  return topByRecency(combined, PICKER_OPTION_LIMIT);
}
