import type { CatalogDraft, CatalogItem } from '../core/catalog/model';
import { AppError, ERROR_CODES } from '../core/shared/errors';
import { toAppError } from '../appwrite/errors';
import { catalogRowToDomain, catalogToRowData, type CatalogRow } from '../appwrite/mappers';
import { getActiveOrgId } from '../app/active-org';
import { createData, deleteData, listData, patchData } from '../app/data-api';
import type { CatalogRepository } from '../ports/catalog-repository';

const PAGE_LIMIT = 100; // matches the server's catalog maxLimit

/** Same bound as the customer repository — a ceiling, not a paging strategy. */
const MAX_PAGES = 10;

/**
 * The organization's product/service catalog.
 *
 * Since multi-tenancy every call goes through `/api/data/catalog` behind
 * `requireOrg` — the `ownerId` arguments stay in the interface as
 * *createdBy* provenance, scoping is the gate-verified `orgId`.
 */
export class AppwriteCatalogRepository implements CatalogRepository {
  private org(): string {
    const orgId = getActiveOrgId();
    if (!orgId) {
      throw new AppError(ERROR_CODES.FORBIDDEN, 'Pilih organisasi dulu.');
    }
    return orgId;
  }

  async listByOwner(ownerId: string): Promise<CatalogItem[]> {
    void ownerId;
    const items: CatalogItem[] = [];
    let cursorAfter: string | undefined;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      try {
        const result = await listData<CatalogRow>('catalog', {
          orgId: this.org(),
          limit: PAGE_LIMIT,
          ...(cursorAfter ? { cursorAfter } : {}),
        });

        items.push(...result.rows.map(catalogRowToDomain));

        if (!result.nextCursor) break;
        cursorAfter = result.nextCursor;
      } catch (error) {
        throw toAppError(error);
      }
    }

    // Sorted here rather than ordering server-side: the mapper hands us
    // display rows already, and a few dozen products are not worth leaning
    // on an index order for the picker's list.
    return items.sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
  }

  async countByOwner(ownerId: string): Promise<number> {
    void ownerId;
    try {
      // One row is enough: the response reports how many rows the query
      // matched in `total`, independent of `limit`, so we never pull the
      // catalog itself.
      const result = await listData<CatalogRow>('catalog', {
        orgId: this.org(),
        limit: 1,
      });
      return result.total;
    } catch (error) {
      throw toAppError(error);
    }
  }

  async listPage(
    ownerId: string,
    options: { cursorAfter?: string; limit?: number } = {},
  ): Promise<{ rows: CatalogItem[]; nextCursor: string | null }> {
    void ownerId;
    const limit = Math.min(Math.max(options.limit ?? 25, 1), 50);
    try {
      const result = await listData<CatalogRow>('catalog', {
        orgId: this.org(),
        limit,
        ...(options.cursorAfter ? { cursorAfter: options.cursorAfter } : {}),
      });
      const rows = result.rows.map(catalogRowToDomain).filter((item) => item.name.trim() !== '');
      return { rows, nextCursor: result.nextCursor };
    } catch (error) {
      throw toAppError(error);
    }
  }

  async findByName(ownerId: string, name: string): Promise<CatalogItem[]> {
    void ownerId;
    try {
      const result = await listData<CatalogRow>('catalog', {
        orgId: this.org(),
        eq: { name },
        limit: PAGE_LIMIT,
      });
      return result.rows.map(catalogRowToDomain);
    } catch (error) {
      throw toAppError(error);
    }
  }

  async create(input: {
    id?: string;
    ownerId: string;
    item: CatalogDraft;
    lastUsedAt: string;
  }): Promise<CatalogItem> {
    void input.ownerId; // stamped server-side from the session.
    try {
      const row = await createData<CatalogRow>(
        'catalog',
        this.org(),
        catalogToRowData(input.item, input.lastUsedAt),
        input.id,
      );
      return catalogRowToDomain(row);
    } catch (error) {
      throw error instanceof AppError ? error : toAppError(error);
    }
  }

  async update(input: {
    id: string;
    item: CatalogDraft;
    lastUsedAt: string;
  }): Promise<CatalogItem> {
    try {
      const row = await patchData<CatalogRow>(
        'catalog',
        this.org(),
        input.id,
        catalogToRowData(input.item, input.lastUsedAt),
      );
      return catalogRowToDomain(row);
    } catch (error) {
      throw toAppError(error);
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await deleteData('catalog', this.org(), id);
    } catch (error) {
      throw toAppError(error);
    }
  }
}
