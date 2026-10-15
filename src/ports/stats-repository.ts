import type { DashboardStats, StatsCounts } from '../core/stats/model';

/**
 * Persistence port for the dashboard's cached summary counters.
 *
 * Exactly one row is expected per owner (looked up through the `owner`
 * index on `ownerId`); `create`/`update` are driven by the app layer's
 * read-or-recompute upsert.
 */
export interface StatsRepository {
  /** The owner's stats row, or null before the first successful refresh. */
  findByOwner(ownerId: string): Promise<DashboardStats | null>;
  create(input: { ownerId: string; counts: StatsCounts }): Promise<DashboardStats>;
  update(input: { id: string; counts: StatsCounts }): Promise<DashboardStats>;
}
