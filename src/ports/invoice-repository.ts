import type { Invoice, InvoiceDraft } from '../core/invoice/model';

export type ListInvoicesOptions = {
  /**
   * Free-text filter. Matched server-side against invoice number, customer name
   * and item names, so it reaches rows beyond the first page.
   *
   * Appwrite's full-text search needs at least 3 characters; shorter input is
   * filtered client-side over the current page instead.
   */
  search?: string;
  limit?: number;
  /** Opaque cursor from a previous page's `nextCursor`. */
  cursorAfter?: string;
};

export type InvoicePage = {
  items: Invoice[];
  /**
   * Cursor to pass back as `cursorAfter` for the next page, or `null` when the
   * result set is exhausted.
   */
  nextCursor: string | null;
};

/** Persistence port for invoices. Implementations must be owner-scoped. */
export interface InvoiceRepository {
  listByOwner(ownerId: string, options?: ListInvoicesOptions): Promise<InvoicePage>;
  /**
   * Every invoice number owned by the user, oldest to newest.
   *
   * Paging through the whole set matters: the next-number suggestion has to see
   * invoices beyond the first page, otherwise it hands out a number that is
   * already taken.
   */
  listAllNumbersByOwner(ownerId: string): Promise<string[]>;
  getById(id: string): Promise<Invoice | null>;
  create(input: { id: string; ownerId: string; draft: InvoiceDraft }): Promise<Invoice>;
  update(input: { id: string; draft: InvoiceDraft }): Promise<Invoice>;
  remove(id: string): Promise<void>;
}
