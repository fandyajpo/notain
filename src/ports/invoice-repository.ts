import type {
  Invoice,
  InvoiceDraft,
  InvoiceHistoryEntry,
  InvoiceStatus,
} from '../core/invoice/model';

export type ListInvoicesOptions = {
  /**
   * Free-text filter. Matched server-side against invoice number, customer name
   * and item names, so it reaches rows beyond the first page.
   *
   * Appwrite's full-text search needs at least 3 characters; shorter input is
   * filtered client-side over the current page instead.
   */
  search?: string;
  /**
   * Lifecycle filter. Matched server-side so it reaches rows beyond the first
   * page — a client-side filter would only narrow the pages already loaded.
   *
   * Tri-state: a value selects that lifecycle state, `null` selects the unset
   * state ("Belum dikirim", stored as the empty string) and `undefined` sends
   * no filter at all. The distinction matters because `null` is a real,
   * filterable bucket — it must not be mistaken for "no filter".
   */
  status?: InvoiceStatus | null;
  /**
   * Template filter: only invoices dressed in this template. Matched
   * server-side for the same reason as `status` — it must reach rows beyond
   * the first page.
   */
  templateId?: string;
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
  /**
   * Total rows the server matched for this query, ignoring `limit`/cursor.
   *
   * Appwrite reports this on every list response, so a caller that only needs a
   * count (the dashboard's "Total invoice" stat) can read it off a single small
   * page instead of walking the whole set. It reflects a *server-side* filter:
   * the short-input local narrowing applied in `listByOwner` is not counted,
   * which is fine because no count consumer uses a search string.
   */
  total: number;
};

/** Persistence port for invoices. Implementations must be owner-scoped. */
export interface InvoiceRepository {
  listByOwner(ownerId: string, options?: ListInvoicesOptions): Promise<InvoicePage>;
  /**
   * Every invoice number owned by the user that belongs to `year`, oldest to
   * newest.
   *
   * Scoped to one year because that is all the next-number suggestion needs:
   * sequences restart each calendar year, so numbers from earlier years can
   * never collide with the one being offered. Paging through the *year's* set
   * still matters — the suggestion has to see invoices beyond the first page,
   * otherwise it hands out a number that is already taken.
   */
  listNumbersByYear(ownerId: string, year: number): Promise<string[]>;
  /**
   * The most recent invoices narrowed to the columns the picker derives its
   * suggestions from.
   *
   * A projected read: the rich-text sections (the bulkiest columns) and the
   * adjustments are left behind server-side, so the picker's history fetch is a
   * fraction of the full-row payload the table needs.
   */
  listHistoryByOwner(ownerId: string, limit?: number): Promise<InvoiceHistoryEntry[]>;
  getById(id: string): Promise<Invoice | null>;
  create(input: { id: string; ownerId: string; draft: InvoiceDraft }): Promise<Invoice>;
  update(input: { id: string; draft: InvoiceDraft }): Promise<Invoice>;
  /**
   * Flips only the lifecycle status, leaving every other column untouched.
   *
   * A targeted write rather than a full `update`: flipping a status changes
   * one field, and round-tripping the whole draft (rich-text sections
   * included) to change a single enum would be both wasteful and a way to
   * accidentally clobber a concurrent edit. This is the *only* method that
   * writes the `status` column — `update` deliberately omits it.
   */
  updateStatus(input: { id: string; status: InvoiceStatus }): Promise<Invoice>;
  remove(id: string): Promise<void>;
}
