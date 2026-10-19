import type { Customer, CustomerDraft } from '../core/customer/model';
import type { CustomerCreation } from '../core/stats/finance';

/**
 * Persistence port for the saved-customer directory.
 *
 * Invoices keep their own `customerName`/`customerPhone` columns and never
 * read through here, so a deleted customer cannot rewrite a document that has
 * already been sent. This row exists purely to pre-fill the picker.
 */
export interface CustomerRepository {
  listByOwner(ownerId: string): Promise<Customer[]>;
  /**
   * One page of the directory, in storage order, for the `/customers` page's
   * "Muat lebih banyak" list. `listByOwner` stays for callers that need the
   * whole directory (the picker, duplicate checks, merge).
   */
  listPage(
    ownerId: string,
    options?: { cursorAfter?: string; limit?: number },
  ): Promise<{ rows: Customer[]; nextCursor: string | null }>;
  /**
   * Total rows the owner has, without transferring them.
   *
   * Backed by the list response's `total` with a one-row limit, so a "how many
   * customers do I have" stat costs a single tiny request instead of walking
   * (and mapping) the whole directory.
   */
  countByOwner(ownerId: string): Promise<number>;
  /**
   * The most recent customer creations (name + creation stamp only) — the
   * dashboard's activity feed. A projected read like the picker's history:
   * the feed needs two fields per row, not the whole directory.
   */
  listRecentCreations(ownerId: string, limit?: number): Promise<CustomerCreation[]>;
  /** All of the owner's rows whose name matches exactly, before phone folding. */
  findByName(ownerId: string, name: string): Promise<Customer[]>;
  create(input: {
    id: string;
    ownerId: string;
    customer: CustomerDraft;
    lastUsedAt: string;
  }): Promise<Customer>;
  update(input: { id: string; customer: CustomerDraft; lastUsedAt: string }): Promise<Customer>;
  remove(id: string): Promise<void>;
}
