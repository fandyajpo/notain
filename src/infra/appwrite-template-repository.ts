import { ID, Query } from 'appwrite';
import type { AuthoredTemplate, InvoiceTemplate } from '../core/template/model';
import { APPWRITE } from '../appwrite/config';
import { getTables } from '../appwrite/client';
import { toAppError } from '../appwrite/errors';
import { ownerRowPermissions } from '../appwrite/permissions';
import { templateRowToDomain, templateToRowData, type TemplateRow } from '../appwrite/mappers';
import type { TemplateRepository } from '../ports/template-repository';

const PAGE_LIMIT = 100;

/**
 * Upper bound on pages walked when listing templates. It only exists so a bug
 * can never become an unbounded request loop; ten pages is ten thousand
 * templates, far past anything an invoice maker accumulates.
 */
const MAX_PAGES = 10;

export class AppwriteTemplateRepository implements TemplateRepository {
  async listByOwner(ownerId: string): Promise<InvoiceTemplate[]> {
    const templates: InvoiceTemplate[] = [];
    let cursorAfter: string | undefined;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const queries = [
        Query.equal('ownerId', ownerId),
        Query.limit(PAGE_LIMIT),
        ...(cursorAfter ? [Query.cursorAfter(cursorAfter)] : []),
      ];

      try {
        const response = await getTables().listRows<TemplateRow>({
          databaseId: APPWRITE.databaseId,
          tableId: APPWRITE.templatesTableId,
          queries,
        });

        templates.push(...response.rows.map(templateRowToDomain));

        const last = response.rows.at(-1);
        if (response.rows.length < PAGE_LIMIT || !last) break;
        cursorAfter = last.$id;
      } catch (error) {
        throw toAppError(error);
      }
    }

    // Sorted here rather than with `Query.orderAsc('name')`: ordering by a
    // column wants an index on it, and a few dozen templates are not worth
    // another index to maintain.
    return templates.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getById(id: string): Promise<InvoiceTemplate | null> {
    try {
      const row = await getTables().getRow<TemplateRow>({
        databaseId: APPWRITE.databaseId,
        tableId: APPWRITE.templatesTableId,
        rowId: id,
      });
      return templateRowToDomain(row);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw toAppError(error);
    }
  }

  async create(input: {
    id: string;
    ownerId: string;
    template: AuthoredTemplate;
  }): Promise<InvoiceTemplate> {
    try {
      const row = await getTables().createRow<TemplateRow>({
        databaseId: APPWRITE.databaseId,
        tableId: APPWRITE.templatesTableId,
        rowId: input.id || ID.unique(),
        data: { ownerId: input.ownerId, ...templateToRowData(input.template) },
        permissions: ownerRowPermissions(input.ownerId),
      });
      return templateRowToDomain(row);
    } catch (error) {
      throw toAppError(error);
    }
  }

  async update(input: { id: string; template: AuthoredTemplate }): Promise<InvoiceTemplate> {
    try {
      const row = await getTables().updateRow<TemplateRow>({
        databaseId: APPWRITE.databaseId,
        tableId: APPWRITE.templatesTableId,
        rowId: input.id,
        data: templateToRowData(input.template),
      });
      return templateRowToDomain(row);
    } catch (error) {
      throw toAppError(error);
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await getTables().deleteRow({
        databaseId: APPWRITE.databaseId,
        tableId: APPWRITE.templatesTableId,
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
