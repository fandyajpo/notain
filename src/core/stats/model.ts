/** Domain model for the dashboard's cached summary counters. Pure data. */

/**
 * One row per account holding the aggregated numbers the dashboard shows, so
 * the screen paints from a single small read instead of five live counts.
 *
 * The row is a *cache*, not a source of truth: `refreshDashboardStats`
 * recomputes it from the invoices/customers/templates tables on every
 * dashboard visit and writes it back, which self-heals any drift between
 * visits (a failed write, an edit made from the Appwrite console, …).
 */
export type DashboardStats = {
  /** Row id, empty when the row has not been persisted yet. */
  id: string;
  ownerId: string;
  totalInvoices: number;
  sentCount: number;
  paidCount: number;
  voidCount: number;
  totalCustomers: number;
  totalTemplates: number;
  /** ISO timestamp the row was last written (`$updatedAt`). */
  updatedAt: string;
};

/** The six counters, without row identity — what a recompute produces. */
export type StatsCounts = Omit<DashboardStats, 'id' | 'ownerId' | 'updatedAt'>;

/** Counter values degrade to zero rather than NaN/undefined on a bad read. */
export function toCounts(value: Record<string, unknown>): StatsCounts {
  const count = (key: string): number => {
    const raw = value[key];
    return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0;
  };
  return {
    totalInvoices: count('totalInvoices'),
    sentCount: count('sentCount'),
    paidCount: count('paidCount'),
    voidCount: count('voidCount'),
    totalCustomers: count('totalCustomers'),
    totalTemplates: count('totalTemplates'),
  };
}
