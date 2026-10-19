import { ID, Query } from 'appwrite';
import type { CatalogDraft, CatalogItem } from '../core/catalog/model';
import { APPWRITE } from '../appwrite/config';
import { getTables } from '../appwrite/client';
import { toAppError } from '../appwrite/errors';
import { ownerRowPermissions } from '../appwrite/permissions';
import { catalogRowToDomain, catalogToRowData, type CatalogRow } from '../appwrite/mappers';
import type { CatalogRepository } from '../ports/catalog-repository';

const PAGE_LIMIT = 100;

/** Same bound as the customer repository — a ceiling, not a paging strategy. */
const MAX_PAGES = 10;

export class AppwriteCatalogRepository implements CatalogRepository {
  async listByOwner(ownerId: string): Promise<CatalogItem[]> {
    const items: CatalogItem[] = [];
    let cursorAfter: string | undefined;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const queries = [
        Query.equal('ownerId', ownerId),
        Query.limit(PAGE_LIMIT),
        ...(cursorAfter ? [Query.cursorAfter(cursorAfter)] : []),
      ];

      try {
        const response = await getTables().listRows<CatalogRow>({
          databaseId: APPWRITE.databaseId,
          tableId: APPWRITE.catalogTableId,
          queries,
        });

        items.push(...response.rows.map(catalogRowToDomain));

        const last = response.rows.at(-1);
        if (response.rows.length < PAGE_LIMIT || !last) break;
        cursorAfter = last.$id;
      } catch (error) {
        throw toAppError(error);
      }
    }

    // Sorted here rather than with `Query.orderAsc('name')`: ordering by a
    // column wants an index on it, and a few dozen products are not worth
    // another index to maintain.
    return items.sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
  }

  async countByOwner(ownerId: string): Promise<number> {
    try {
      const response = await getTables().listRows<CatalogRow>({
        databaseId: APPWRITE.databaseId,
        tableId: APPWRITE.catalogTableId,
        queries: [Query.equal('ownerId', ownerId), Query.limit(1)],
      });
      return response.total;
    } catch (error) {
      throw toAppError(error);
    }
  }

  async listPage(
    ownerId: string,
    options: { cursorAfter?: string; limit?: number } = {},
  ): Promise<{ rows: CatalogItem[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(options.limit ?? 25, 1), 50);
    try {
      const response = await getTables().listRows<CatalogRow>({
        databaseId: APPWRITE.databaseId,
        tableId: APPWRITE.catalogTableId,
        queries: [
          Query.equal('ownerId', ownerId),
          Query.limit(limit),
          ...(options.cursorAfter ? [Query.cursorAfter(options.cursorAfter)] : []),
        ],
      });
      const rows = response.rows.map(catalogRowToDomain).filter((item) => item.name.trim() !== '');
      const last = response.rows.at(-1);
      return {
        rows,
        nextCursor: response.rows.length === limit && last ? last.$id : null,
      };
    } catch (error) {
      throw toAppError(error);
    }
  }

  async findByName(ownerId: string, name: string): Promise<CatalogItem[]> {
    try {
      const response = await getTables().listRows<CatalogRow>({
        databaseId: APPWRITE.databaseId,
        tableId: APPWRITE.catalogTableId,
        queries: [
          Query.equal('ownerId', ownerId),
          Query.equal('name', name),
          Query.limit(PAGE_LIMIT),
        ],
      });
      return response.rows.map(catalogRowToDomain);
    } catch (error) {
      throw toAppError(error);
    }
  }

  async create(input: {
    id: string;
    ownerId: string;
    item: CatalogDraft;
    lastUsedAt: string;
  }): Promise<CatalogItem> {
    try {
      const row = await getTables().createRow<CatalogRow>({
        databaseId: APPWRITE.databaseId,
        tableId: APPWRITE.catalogTableId,
        rowId: input.id || ID.unique(),
        data: {
          ownerId: input.ownerId,
          ...catalogToRowData(input.item, input.lastUsedAt),
        },
        permissions: ownerRowPermissions(input.ownerId),
      });
      return catalogRowToDomain(row);
    } catch (error) {
      throw toAppError(error);
    }
  }

  async update(input: {
    id: string;
    item: CatalogDraft;
    lastUsedAt: string;
  }): Promise<CatalogItem> {
    try {
      const row = await getTables().updateRow<CatalogRow>({
        databaseId: APPWRITE.databaseId,
        tableId: APPWRITE.catalogTableId,
        rowId: input.id,
        data: catalogToRowData(input.item, input.lastUsedAt),
      });
      return catalogRowToDomain(row);
    } catch (error) {
      throw toAppError(error);
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await getTables().deleteRow({
        databaseId: APPWRITE.databaseId,
        tableId: APPWRITE.catalogTableId,
        rowId: id,
      });
    } catch (error) {
      if (isNotFound(error)) return;
      throw toAppError(error);
    }
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 404
  );
}
