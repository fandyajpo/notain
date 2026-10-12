import type { Invoice } from '../../core/invoice/model';
import type { Customer } from '../../core/customer/model';
import { customerKey } from '../../core/customer/model';

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
 * - Customers are keyed by trimmed name + phone (same name, different number
 *   stays two entries).
 * - Products are keyed by trimmed name + unit price (a price change is a new
 *   suggestion rather than a silent overwrite).
 * - Entries with a blank name are skipped — there is nothing to label.
 * - Each list is capped at `limit`, newest first.
 */
export function derivePickerOptions(
  invoices: ReadonlyArray<Invoice> | null | undefined,
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
    customers: topByRecency(customers, limit),
    products: topByRecency(products, limit),
  };
}

/** Recency stamp: updated, then created, then the invoice date. */
function stampOf(invoice: Invoice): number {
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
  map: Map<string, T>,
  limit: number,
): T[] {
  return [...map.values()]
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
  const seen = new Set(stored.map((customer) => customerKey(customer)));

  const filed = stored
    .filter((customer) => customer.name.trim() !== '')
    .map<CustomerOption>((customer) => ({
      kind: 'customer',
      label: customer.name,
      name: customer.name,
      phone: customer.phone,
      lastUsedAt: customer.lastUsedAt,
      invoiceCount: 0,
    }));

  const missing = derived.filter((option) => !seen.has(customerKey(option)));

  // Disjoint by construction — `missing` already excludes every stored key —
  // so a Map here is only for `topByRecency`, not for de-duplication.
  const byKey = new Map<string, CustomerOption>(
    [...filed, ...missing].map((option) => [customerKey(option), option]),
  );

  return topByRecency(byKey, PICKER_OPTION_LIMIT);
}
