import type { InvoiceStatus } from '../../core/invoice/model';

/** Centralised query-key factory so invalidation stays consistent. */
export const queryKeys = {
  session: ['session'] as const,
  profile: ['profile'] as const,
  /**
   * The invoice list. `limit` and `status` are part of the key so the
   * dashboard's small "recent" page and the `/invoices` table's full page do
   * not collide, and a status-filtered list is cached separately from the
   * unfiltered one — they are different queries even when the search matches.
   */
  invoices: (search = '', limit?: number, status?: InvoiceStatus): readonly unknown[] => {
    const key: unknown[] = ['invoices', search];
    if (limit !== undefined) key.push(limit);
    if (status !== undefined) key.push(status);
    return key;
  },
  invoice: (id: string) => ['invoice', id] as const,
  invoiceNumbers: ['invoice-numbers'] as const,
  /**
   * Count of invoices in one lifecycle state (a `limit: 1` read of the
   * response's `total`). Keyed apart from `invoices(...)` so a count never
   * shares — or evicts — a list cache entry.
   */
  invoiceStatusCount: (status: InvoiceStatus): readonly unknown[] => [
    'invoice-status-count',
    status,
  ],
  /** Projected recent-invoice slice the picker derives its suggestions from. */
  pickerHistory: ['picker-history'] as const,
  templates: ['templates'] as const,
  template: (id: string) => ['templates', id] as const,
  customers: ['customers'] as const,
  customerCount: ['customer-count'] as const,
  customer: (id: string) => ['customers', id] as const,
  /** Cached dashboard counters — one row per owner (the `stats` table). */
  stats: ['dashboard-stats'] as const,
  /** Admin panel user list. Only fetched by members of the `admins` team. */
  adminUsers: ['admin-users'] as const,
  /** Whether the current user belongs to the `admins` team (gates the nav link). */
  adminMembership: ['admin-membership'] as const,
};
