import type { CatalogDraft, CatalogItem } from '../core/catalog/model';

/**
 * Persistence port for the owner's product/service catalog.
 *
 * Invoices keep their own copy of each picked item and never read through
 * here, so deleting a catalog row cannot rewrite a document that has already
 * been issued. This table exists purely to pre-fill the invoice builder.
 */
export interface CatalogRepository {
  listByOwner(ownerId: string): Promise<CatalogItem[]>;
  /**
   * One page of the catalog, in storage order, for the `/catalog` page's
   * "Muat lebih banyak" list. `listByOwner` stays for callers that need the
   * whole set (the invoice picker, auto-save dedupe).
   */
  listPage(
    ownerId: string,
    options?: { cursorAfter?: string; limit?: number },
  ): Promise<{ rows: CatalogItem[]; nextCursor: string | null }>;
  /**
   * Total rows the owner has, without transferring them.
   *
   * Backed by the list response's `total` with a one-row limit — the same
   * trick as `CustomerRepository.countByOwner`.
   */
  countByOwner(ownerId: string): Promise<number>;
  /** All of the owner's rows whose name matches exactly, before key folding. */
  findByName(ownerId: string, name: string): Promise<CatalogItem[]>;
  create(input: {
    id?: string;
    ownerId: string;
    item: CatalogDraft;
    lastUsedAt: string;
  }): Promise<CatalogItem>;
  update(input: { id: string; item: CatalogDraft; lastUsedAt: string }): Promise<CatalogItem>;
  remove(id: string): Promise<void>;
}
