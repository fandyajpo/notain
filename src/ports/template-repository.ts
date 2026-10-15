import type { AuthoredTemplate, InvoiceTemplate } from '../core/template/model';

/**
 * Persistence port for a user's saved invoice templates.
 *
 * The three built-ins are never written to storage — they live in code so
 * every account has something to pick before it has saved anything, and so a
 * deleted row can never leave an invoice with no template at all.
 */
export interface TemplateRepository {
  listByOwner(ownerId: string): Promise<InvoiceTemplate[]>;
  /**
   * One page of the owner's templates, in storage order, for the `/templates`
   * page's "Muat lebih banyak" grid. `listByOwner` stays for callers that need
   * the whole set (the invoice builder's picker).
   */
  listPage(
    ownerId: string,
    options?: { cursorAfter?: string; limit?: number },
  ): Promise<{ rows: InvoiceTemplate[]; nextCursor: string | null }>;
  /**
   * Total saved templates the owner has, without transferring them.
   *
   * Backed by the list response's `total` with a one-row limit — the same
   * trick as `CustomerRepository.countByOwner`.
   */
  countByOwner(ownerId: string): Promise<number>;
  getById(id: string): Promise<InvoiceTemplate | null>;
  create(input: {
    id: string;
    ownerId: string;
    template: AuthoredTemplate;
  }): Promise<InvoiceTemplate>;
  update(input: { id: string; template: AuthoredTemplate }): Promise<InvoiceTemplate>;
  remove(id: string): Promise<void>;
}
