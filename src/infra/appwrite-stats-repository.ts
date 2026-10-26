import type { DashboardStats, StatsCounts } from '../core/stats/model';
import { AppError, ERROR_CODES } from '../core/shared/errors';
import { toAppError } from '../appwrite/errors';
import { statsRowToDomain, statsToRowData, type StatsRow } from '../appwrite/mappers';
import { getActiveOrgId } from '../app/active-org';
import { getRowData, createData, patchData } from '../app/data-api';
import type { StatsRepository } from '../ports/stats-repository';

/**
 * Cached dashboard counters, **one row per organization** (its `$id` IS the
 * orgId — the server's `fixedId` rule, so lookup is a keyed read with no
 * filter scan, and "one row per tenant" is structural rather than a race).
 *
 * Since multi-tenancy every read/write goes through
 * `GET|POST|PATCH /api/data/stats` behind `requireOrg`; `ownerId` survives
 * only as *createdBy* provenance stamped from the verified session
 * server-side. `create`/`update` remain interchangeable upsert halves —
 * whichever the app layer picks is a race with nobody (only the dashboard
 * itself writes this row).
 */
export class AppwriteStatsRepository implements StatsRepository {
  private org(): string {
    const orgId = getActiveOrgId();
    if (!orgId) {
      throw new AppError(ERROR_CODES.FORBIDDEN, 'Pilih organisasi dulu.');
    }
    return orgId;
  }

  async findByOwner(ownerId: string): Promise<DashboardStats | null> {
    void ownerId; // provenance only — scoping is orgId; see class doc.
    try {
      const row = await getRowData<StatsRow>('stats', this.org(), this.org());
      return row ? statsRowToDomain(row) : null;
    } catch (error) {
      throw toAppError(error);
    }
  }

  async create(input: { ownerId: string; counts: StatsCounts }): Promise<DashboardStats> {
    void input.ownerId; // stamped server-side from the session.
    try {
      // No rowId: the server's fixedId rule makes `$id = orgId` — the same
      // id the lookup uses. A duplicate create (double refresh racing) lands
      // on the existing row and answers 409, which `refreshDashboardStats`
      // already treats as "someone else won the upsert".
      const row = await createData<StatsRow>('stats', this.org(), statsToRowData(input.counts));
      return statsRowToDomain(row);
    } catch (error) {
      throw toAppError(error);
    }
  }

  async update(input: { id: string; counts: StatsCounts }): Promise<DashboardStats> {
    try {
      const row = await patchData<StatsRow>(
        'stats',
        this.org(),
        input.id,
        statsToRowData(input.counts),
      );
      return statsRowToDomain(row);
    } catch (error) {
      throw toAppError(error);
    }
  }
}
