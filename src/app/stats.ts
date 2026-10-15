import type { DashboardStats, StatsCounts } from '../core/stats/model';
import type { InvoiceStatus } from '../core/invoice/model';
import { container } from '../infra/container';
import { countCustomers } from './customers';
import { listInvoicesPage } from './invoices';
import { requireSession } from './session';

/**
 * The owner's cached dashboard counters, or null before the first refresh.
 *
 * Reading the cache is best-effort on purpose: the row only ever *speeds up*
 * the dashboard, so a missing `stats` table (fresh environment, or
 * `stats:ensure` not run yet) must degrade to "no cache" instead of an error
 * the UI would have to special-case.
 */
export async function getDashboardStats(): Promise<DashboardStats | null> {
  try {
    const user = await requireSession();
    return await container.stats.findByOwner(user.id);
  } catch {
    return null;
  }
}

async function countByStatus(status: InvoiceStatus): Promise<number> {
  // `limit: 1` — Appwrite reports the full `total` regardless of page size,
  // so counting a state never ships a single invoice row.
  const page = await listInvoicesPage({ status, limit: 1 });
  return page.total;
}

/**
 * Recomputes every counter from the source tables and writes the row back.
 *
 * This runs once per dashboard visit, which is what keeps the cached row
 * honest: invoices saved since the last visit are folded in immediately, and
 * any drift from a failed write or an out-of-band edit self-heals on the next
 * load. Persistence is best-effort — if the `stats` table is missing, the
 * fresh numbers are still returned, so the dashboard behaves exactly as it
 * did when every number was counted live.
 */
export async function refreshDashboardStats(): Promise<DashboardStats> {
  const user = await requireSession();

  const [totalInvoices, sentCount, paidCount, voidCount, totalCustomers, totalTemplates] =
    await Promise.all([
      listInvoicesPage({ limit: 1 }).then((page) => page.total),
      countByStatus('sent'),
      countByStatus('paid'),
      countByStatus('void'),
      countCustomers(),
      container.templates.countByOwner(user.id),
    ]);

  const counts: StatsCounts = {
    totalInvoices,
    sentCount,
    paidCount,
    voidCount,
    totalCustomers,
    totalTemplates,
  };
  const local: DashboardStats = {
    id: '',
    ownerId: user.id,
    ...counts,
    updatedAt: new Date().toISOString(),
  };

  try {
    const existing = await container.stats.findByOwner(user.id);
    return existing
      ? await container.stats.update({ id: existing.id, counts })
      : await container.stats.create({ ownerId: user.id, counts });
  } catch {
    return local;
  }
}
