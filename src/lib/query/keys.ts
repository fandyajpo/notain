import type { InvoiceStatus } from '../../core/invoice/model';

/** Centralised query-key factory so invalidation stays consistent. */
export const queryKeys = {
  session: ['session'] as const,
  profile: ['profile'] as const,
  /**
   * The invoice list. `limit`, `status` and `templateId` are part of the key so
   * the dashboard's small "recent" page and the `/invoices` table's full page
   * do not collide, and a filtered list is cached separately from the
   * unfiltered one — they are different queries even when the search matches.
   */
  invoices: (
    search = '',
    limit?: number,
    status?: InvoiceStatus | null,
    templateId?: string,
  ): readonly unknown[] => {
    const key: unknown[] = ['invoices', search];
    if (limit !== undefined) key.push(limit);
    // `null` (the "Belum dikirim" filter) is pushed as-is: it is a real
    // bucket, not an absence, so it must land in a cache entry of its own.
    if (status !== undefined) key.push(status);
    if (templateId !== undefined) key.push(templateId);
    return key;
  },
  invoice: (id: string) => ['invoice', id] as const,
  invoiceNumbers: ['invoice-numbers'] as const,
  /** Projected recent-invoice slice the picker derives its suggestions from. */
  pickerHistory: ['picker-history'] as const,
  templates: ['templates'] as const,
  /** Paginated `/templates` grid — separate from the full `templates` list the picker uses. */
  templatesPage: ['templates-page'] as const,
  template: (id: string) => ['templates', id] as const,
  customers: ['customers'] as const,
  /** Paginated `/customers` list — separate from the full `customers` list the picker uses. */
  customersPage: ['customers-page'] as const,
  customerCount: ['customer-count'] as const,
  customer: (id: string) => ['customers', id] as const,
  /** The owner's product/service catalog, read whole by the invoice picker. */
  catalog: ['catalog'] as const,
  /** Paginated `/catalog` list — separate from the full `catalog` list the picker uses. */
  catalogPage: ['catalog-page'] as const,
  catalogCount: ['catalog-count'] as const,
  catalogItem: (id: string) => ['catalog', id] as const,
  /** Cached dashboard counters — one row per owner (the `stats` table). */
  stats: ['dashboard-stats'] as const,
  /**
   * Dashboard finance metrics (cards + chart + attention + activity), keyed
   * by the resolved period window so each period is cached separately while
   * switching back to a seen one is instant.
   */
  dashboardFinance: (from: string, to: string) => ['dashboard-finance', from, to] as const,
  /** Prefix for invalidating *every* cached period after an invoice change. */
  dashboardFinanceAll: ['dashboard-finance'] as const,
  /** Admin panel user list. Only fetched by members of the `admins` team. */
  adminUsers: ['admin-users'] as const,
  /** Admin action log (`/admin` → Log aktivitas tab). */
  adminAudit: ['admin-audit'] as const,
  /** Read-only drill-down into one admin user's data. */
  adminUserDrilldown: (userId: string): readonly unknown[] => ['admin-user-drilldown', userId],
  /** Prefix for invalidating *every* user's drill-down cache after a mutation. */
  adminUserDrilldownAll: ['admin-user-drilldown'] as const,
  /** Whether the current user belongs to the `admins` team (gates the nav link). */
  adminMembership: ['admin-membership'] as const,
  /** One paid-checkout order's status, polled by `/payment/result` while DOKU settles. */
  paymentStatus: (invoice: string) => ['payment-status', invoice] as const,
  /** The billing portal read: current subscription + the caller's payment history. */
  portalSession: ['portal-session'] as const,
};
