import { ID, Query } from 'appwrite';
import type { DashboardStats, StatsCounts } from '../core/stats/model';
import { APPWRITE } from '../appwrite/config';
import { getTables } from '../appwrite/client';
import { toAppError } from '../appwrite/errors';
import { ownerRowPermissions } from '../appwrite/permissions';
import { statsRowToDomain, statsToRowData, type StatsRow } from '../appwrite/mappers';
import type { StatsRepository } from '../ports/stats-repository';

/**
 * Cached dashboard counters, one row per owner.
 *
 * The read is a single-row lookup through the `owner` index; `create` and
 * `update` are interchangeable upsert halves — whichever the app layer picks
 * is a race with nobody (only the dashboard itself writes this row).
 */
export class AppwriteStatsRepository implements StatsRepository {
  async findByOwner(ownerId: string): Promise<DashboardStats | null> {
    try {
      const response = await getTables().listRows<StatsRow>({
        databaseId: APPWRITE.databaseId,
        tableId: APPWRITE.statsTableId,
        queries: [Query.equal('ownerId', ownerId), Query.limit(1)],
      });
      const row = response.rows[0];
      return row ? statsRowToDomain(row) : null;
    } catch (error) {
      throw toAppError(error);
    }
  }

  async create(input: { ownerId: string; counts: StatsCounts }): Promise<DashboardStats> {
    try {
      const row = await getTables().createRow<StatsRow>({
        databaseId: APPWRITE.databaseId,
        tableId: APPWRITE.statsTableId,
        rowId: ID.unique(),
        data: { ownerId: input.ownerId, ...statsToRowData(input.counts) },
        permissions: ownerRowPermissions(input.ownerId),
      });
      return statsRowToDomain(row);
    } catch (error) {
      throw toAppError(error);
    }
  }

  async update(input: { id: string; counts: StatsCounts }): Promise<DashboardStats> {
    try {
      const row = await getTables().updateRow<StatsRow>({
        databaseId: APPWRITE.databaseId,
        tableId: APPWRITE.statsTableId,
        rowId: input.id,
        data: statsToRowData(input.counts),
      });
      return statsRowToDomain(row);
    } catch (error) {
      throw toAppError(error);
    }
  }
}
