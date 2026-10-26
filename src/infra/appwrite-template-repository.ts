import type { AuthoredTemplate, InvoiceTemplate } from '../core/template/model';
import { AppError, ERROR_CODES } from '../core/shared/errors';
import { toAppError } from '../appwrite/errors';
import { templateRowToDomain, templateToRowData, type TemplateRow } from '../appwrite/mappers';
import { getActiveOrgId } from '../app/active-org';
import { createData, deleteData, getRowData, listData, patchData } from '../app/data-api';
import type { TemplateRepository } from '../ports/template-repository';

const PAGE_LIMIT = 50; // matches the server's templates maxLimit

/**
 * Upper bound on pages walked when listing templates. It only exists so a bug
 * can never become an unbounded request loop; twenty pages is a thousand
 * templates, far past anything an invoice maker accumulates.
 */
const MAX_PAGES = 20;

/**
 * The organization's saved templates.
 *
 * Since multi-tenancy every call goes through `/api/data/templates` behind
 * `requireOrg` — the `ownerId` arguments stay in the interface as
 * *createdBy* provenance, scoping is the gate-verified `orgId`.
 */
export class AppwriteTemplateRepository implements TemplateRepository {
  private org(): string {
    const orgId = getActiveOrgId();
    if (!orgId) {
      throw new AppError(ERROR_CODES.FORBIDDEN, 'Pilih organisasi dulu.');
    }
    return orgId;
  }

  async listByOwner(ownerId: string): Promise<InvoiceTemplate[]> {
    void ownerId;
    const templates: InvoiceTemplate[] = [];
    let cursorAfter: string | undefined;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      try {
        const result = await listData<TemplateRow>('templates', {
          orgId: this.org(),
          limit: PAGE_LIMIT,
          ...(cursorAfter ? { cursorAfter } : {}),
        });

        templates.push(...result.rows.map(templateRowToDomain));

        if (!result.nextCursor) break;
        cursorAfter = result.nextCursor;
      } catch (error) {
        throw toAppError(error);
      }
    }

    // Sorted here rather than ordering server-side: the mapper hands us
    // display names already, and a few dozen templates are not worth leaning
    // on an index order for the picker's list.
    return templates.sort((a, b) => a.name.localeCompare(b.name));
  }

  async countByOwner(ownerId: string): Promise<number> {
    void ownerId;
    try {
      // One row is enough: the response reports how many rows the query
      // matched in `total`, independent of `limit`, so counting never ships a
      // row.
      const result = await listData<TemplateRow>('templates', {
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
  ): Promise<{ rows: InvoiceTemplate[]; nextCursor: string | null }> {
    void ownerId;
    const limit = Math.min(Math.max(options.limit ?? 25, 1), 50);
    try {
      const result = await listData<TemplateRow>('templates', {
        orgId: this.org(),
        limit,
        ...(options.cursorAfter ? { cursorAfter: options.cursorAfter } : {}),
      });
      return { rows: result.rows.map(templateRowToDomain), nextCursor: result.nextCursor };
    } catch (error) {
      throw toAppError(error);
    }
  }

  async getById(id: string): Promise<InvoiceTemplate | null> {
    try {
      const row = await getRowData<TemplateRow>('templates', this.org(), id);
      return row ? templateRowToDomain(row) : null;
    } catch (error) {
      throw toAppError(error);
    }
  }

  async create(input: {
    id?: string;
    ownerId: string;
    template: AuthoredTemplate;
  }): Promise<InvoiceTemplate> {
    void input.ownerId; // stamped server-side from the session.
    try {
      const row = await createData<TemplateRow>(
        'templates',
        this.org(),
        templateToRowData(input.template),
        input.id,
      );
      return templateRowToDomain(row);
    } catch (error) {
      throw error instanceof AppError ? error : toAppError(error);
    }
  }

  async update(input: { id: string; template: AuthoredTemplate }): Promise<InvoiceTemplate> {
    try {
      const row = await patchData<TemplateRow>(
        'templates',
        this.org(),
        input.id,
        templateToRowData(input.template),
      );
      return templateRowToDomain(row);
    } catch (error) {
      throw toAppError(error);
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await deleteData('templates', this.org(), id);
    } catch (error) {
      throw toAppError(error);
    }
  }
}
