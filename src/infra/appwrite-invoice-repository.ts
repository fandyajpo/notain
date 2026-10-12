import { ID, Query } from 'appwrite';
import type { Invoice, InvoiceDraft } from '../core/invoice/model';
import { APPWRITE } from '../appwrite/config';
import { getTables } from '../appwrite/client';
import { toAppError } from '../appwrite/errors';
import { ownerRowPermissions } from '../appwrite/permissions';
import { draftToRowData, invoiceRowToDomain, type InvoiceRow } from '../appwrite/mappers';
import type {
  InvoicePage,
  InvoiceRepository,
  ListInvoicesOptions,
} from '../ports/invoice-repository';

const DEFAULT_LIMIT = 100;

/**
 * Appwrite's full-text search ignores input shorter than this. Below it the
 * query is filtered locally instead of sent to the server.
 */
const SEARCH_MIN_CHARS = 3;

/**
 * Upper bound on pages walked when collecting every invoice number. It only
 * exists so a bug can never turn into an unbounded request loop; at
 * `DEFAULT_LIMIT` per page it covers ten thousand invoices.
 */
const MAX_NUMBER_PAGES = 100;

export class AppwriteInvoiceRepository implements InvoiceRepository {
  async listByOwner(ownerId: string, options: ListInvoicesOptions = {}): Promise<InvoicePage> {
    const limit = options.limit ?? DEFAULT_LIMIT;
    const search = options.search?.trim() ?? '';
    const serverSearch = search.length >= SEARCH_MIN_CHARS;

    const queries = [
      Query.equal('ownerId', ownerId),
      ...(serverSearch ? [serverSearchQuery(search)] : []),
      Query.orderDesc('date'),
      Query.orderDesc('$createdAt'),
      Query.limit(limit),
      ...(options.cursorAfter ? [Query.cursorAfter(options.cursorAfter)] : []),
    ];

    try {
      const response = await getTables().listRows<InvoiceRow>({
        databaseId: APPWRITE.databaseId,
        tableId: APPWRITE.invoicesTableId,
        queries,
      });

      const rows = response.rows;
      // Narrow locally only when the server did not. Combining the two filters
      // would intersect them and hide rows that either one alone would match.
      const items = serverSearch
        ? rows.map(invoiceRowToDomain)
        : filterBySearch(rows.map(invoiceRowToDomain), search);

      const last = rows.at(-1);
      return {
        items,
        nextCursor: rows.length === limit && last ? last.$id : null,
      };
    } catch (error) {
      throw toAppError(error);
    }
  }

  async listAllNumbersByOwner(ownerId: string): Promise<string[]> {
    const numbers: string[] = [];
    let cursorAfter: string | undefined;

    for (let page = 0; page < MAX_NUMBER_PAGES; page += 1) {
      const queries = [
        Query.equal('ownerId', ownerId),
        Query.orderDesc('date'),
        Query.orderDesc('$createdAt'),
        // Numbers only: the full row payload (items, rich-text sections) is
        // what makes walking every page expensive in the first place. The row
        // is typed as a full InvoiceRow for the generic's sake, but with this
        // select only `$id` and `invoiceNumber` actually come back.
        Query.select(['invoiceNumber']),
        Query.limit(DEFAULT_LIMIT),
        ...(cursorAfter ? [Query.cursorAfter(cursorAfter)] : []),
      ];

      try {
        const response = await getTables().listRows<InvoiceRow>({
          databaseId: APPWRITE.databaseId,
          tableId: APPWRITE.invoicesTableId,
          queries,
        });

        numbers.push(...response.rows.map((row) => row.invoiceNumber));

        const last = response.rows.at(-1);
        if (response.rows.length < DEFAULT_LIMIT || !last) break;
        cursorAfter = last.$id;
      } catch (error) {
        throw toAppError(error);
      }
    }

    return numbers;
  }

  async getById(id: string): Promise<Invoice | null> {
    try {
      const row = await getTables().getRow<InvoiceRow>({
        databaseId: APPWRITE.databaseId,
        tableId: APPWRITE.invoicesTableId,
        rowId: id,
      });
      return invoiceRowToDomain(row);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw toAppError(error);
    }
  }

  async create(input: { id: string; ownerId: string; draft: InvoiceDraft }): Promise<Invoice> {
    try {
      const row = await getTables().createRow<InvoiceRow>({
        databaseId: APPWRITE.databaseId,
        tableId: APPWRITE.invoicesTableId,
        rowId: input.id || ID.unique(),
        data: { ownerId: input.ownerId, ...draftToRowData(input.draft) },
        permissions: ownerRowPermissions(input.ownerId),
      });
      return invoiceRowToDomain(row);
    } catch (error) {
      throw toAppError(error);
    }
  }

  async update(input: { id: string; draft: InvoiceDraft }): Promise<Invoice> {
    try {
      const row = await getTables().updateRow<InvoiceRow>({
        databaseId: APPWRITE.databaseId,
        tableId: APPWRITE.invoicesTableId,
        rowId: input.id,
        data: draftToRowData(input.draft),
      });
      return invoiceRowToDomain(row);
    } catch (error) {
      throw toAppError(error);
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await getTables().deleteRow({
        databaseId: APPWRITE.databaseId,
        tableId: APPWRITE.invoicesTableId,
        rowId: id,
      });
    } catch (error) {
      if (isNotFound(error)) return;
      throw toAppError(error);
    }
  }
}

/**
 * One server-side search covering every field the UI offers.
 *
 * The three branches are OR'd because a single `Query.search` names one
 * attribute, and users do not care which field their term landed in. All three
 * columns carry a full-text index — without one Appwrite rejects the query.
 *
 * `items` is a JSON blob rather than a plain string, but the full-text index
 * tokenises it, so an item name is just another token and matches normally.
 */
function serverSearchQuery(needle: string): string {
  return Query.or([
    Query.search('invoiceNumber', needle),
    Query.search('customerName', needle),
    Query.search('items', needle),
  ]);
}

/**
 * Fallback filter for input too short to search on the server.
 *
 * Appwrite full-text search only accepts three characters or more, so one- and
 * two-character queries are narrowed here over the rows already loaded.
 */
function filterBySearch(invoices: Invoice[], search: string): Invoice[] {
  const needle = search.trim().toLowerCase();
  if (needle === '') return invoices;

  return invoices.filter((invoice) => {
    if (invoice.invoiceNumber.toLowerCase().includes(needle)) return true;
    if (invoice.customerName.toLowerCase().includes(needle)) return true;
    return invoice.items.some((item) => item.name.toLowerCase().includes(needle));
  });
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 404
  );
}
