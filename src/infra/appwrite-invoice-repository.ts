import type { Invoice, InvoiceDraft, InvoiceStatus } from '../core/invoice/model';
import { toAppError } from '../appwrite/errors';
import { AppError, ERROR_CODES } from '../core/shared/errors';
import { invoiceDocumentId, invoiceNumberPrefix } from '../core/invoice/numbering';
import {
  draftToRowData,
  draftToRowUpdateData,
  invoiceFinanceRowToEntry,
  invoiceHistoryRowToEntry,
  invoiceRowToDomain,
  type InvoiceRow,
} from '../appwrite/mappers';
import { getActiveOrgId } from '../app/active-org';
import {
  createData,
  deleteData,
  getRowData,
  listData,
  patchData,
  type ListParams,
} from '../app/data-api';
import type { InvoiceHistoryEntry } from '../core/invoice/model';
import type { InvoiceFinanceEntry } from '../core/stats/finance';
import type {
  InvoicePage,
  InvoiceRepository,
  ListInvoicesOptions,
} from '../ports/invoice-repository';

const DEFAULT_LIMIT = 100;

/**
 * Columns the dashboard's finance projection reads. Everything heavy — the
 * three rich-text sections, notes, details — is left behind server-side; the
 * `items` JSON and the adjustment columns are the price of computing totals,
 * which no server-side SUM can do here (totals are derived, not stored).
 */
const FINANCE_SELECT = [
  'invoiceNumber',
  'customerName',
  'customerPhone',
  'status',
  'date',
  'dueDate',
  'items',
  'discountType',
  'discountValue',
  'taxType',
  'taxValue',
  'paymentProofKey',
  'paymentProofUploadedAt',
];

/**
 * How many recent invoices the picker's history projection reads.
 *
 * The picker only ever offers `PICKER_OPTION_LIMIT` (20) suggestions per list,
 * and each invoice contributes several items, so one page is far more coverage
 * than the caps can use — but it is kept at a page rather than trimmed further
 * so an account whose early invoices share few products still fills the list.
 */
const HISTORY_LIMIT = 100;

/**
 * Appwrite's full-text search ignores input shorter than this. Below it the
 * query is filtered locally instead of sent to the server.
 */
const SEARCH_MIN_CHARS = 3;

/**
 * Upper bound on pages walked when collecting a year's invoice numbers. It only
 * exists so a bug can never turn into an unbounded request loop; at
 * `DEFAULT_LIMIT` per page it covers ten thousand invoices *in one year*, which
 * no account approaches.
 */
const MAX_NUMBER_PAGES = 100;

/**
 * Invoices for the ACTIVE organization.
 *
 * This used to talk to the Appwrite SDK with `ownerId` filters; since
 * multi-tenancy, every row comes from `GET /api/data/invoices`, which the
 * server scopes to an organization it has verified the caller belongs to.
 * The `ownerId` arguments stay in the interface as *createdBy* provenance —
 * scoping is `orgId`, stamped server-side from the session.
 */
export class AppwriteInvoiceRepository implements InvoiceRepository {
  private org(): string {
    const orgId = getActiveOrgId();
    if (!orgId) {
      throw new AppError(ERROR_CODES.FORBIDDEN, 'Pilih organisasi dulu.');
    }
    return orgId;
  }

  async listByOwner(ownerId: string, options: ListInvoicesOptions = {}): Promise<InvoicePage> {
    void ownerId; // provenance only — see class doc; the gate owns scoping.
    const limit = options.limit ?? DEFAULT_LIMIT;
    const search = options.search?.trim() ?? '';
    const serverSearch = search.length >= SEARCH_MIN_CHARS;

    try {
      const params: ListParams = {
        orgId: this.org(),
        limit,
        orderDesc: ['date', '$createdAt'],
        // `status` is tri-state: a value filters that lifecycle state, `null`
        // filters the unset state (stored as '') and `undefined` sends nothing.
        eq: {
          status: options.status !== undefined ? (options.status ?? '') : undefined,
          templateId: options.templateId,
        },
        ...(serverSearch ? { search } : {}),
        ...(options.cursorAfter ? { cursorAfter: options.cursorAfter } : {}),
      };
      const result = await listData<InvoiceRow>('invoices', params);

      // Narrow locally only when the server did not. Combining the two filters
      // would intersect them and hide rows that either one alone would match.
      const items = serverSearch
        ? result.rows.map(invoiceRowToDomain)
        : filterBySearch(result.rows.map(invoiceRowToDomain), search);

      const last = result.rows.at(-1);
      return {
        items,
        nextCursor: result.rows.length === limit && last ? last.$id : null,
        total: result.total,
      };
    } catch (error) {
      throw toAppError(error);
    }
  }

  async listFinanceEntries(
    ownerId: string,
    options: { from: string; to: string; limit?: number; cursorAfter?: string },
  ): Promise<InvoiceFinanceEntry[]> {
    void ownerId;
    try {
      const result = await listData<InvoiceRow>('invoices', {
        orgId: this.org(),
        limit: options.limit ?? DEFAULT_LIMIT,
        select: FINANCE_SELECT,
        // ISO dates compare lexicographically, so a string range *is* a date
        // range — and it rides the `org_date` index (equal orgId + range/sort
        // on date) instead of scanning.
        gte: { date: options.from },
        lte: { date: options.to },
        orderDesc: ['date', '$createdAt'],
        ...(options.cursorAfter ? { cursorAfter: options.cursorAfter } : {}),
      });
      return result.rows.map(invoiceFinanceRowToEntry);
    } catch (error) {
      throw toAppError(error);
    }
  }

  async listNumbersByYear(ownerId: string, year: number): Promise<string[]> {
    void ownerId;
    const numbers: string[] = [];
    let cursorAfter: string | undefined;
    // `INV-YYYY-` is exactly the prefix every number for this year carries, so
    // filtering on it in the database cuts the walk down to one year's rows.
    const prefix = invoiceNumberPrefix(year);

    for (let page = 0; page < MAX_NUMBER_PAGES; page += 1) {
      try {
        const result = await listData<InvoiceRow>('invoices', {
          orgId: this.org(),
          limit: DEFAULT_LIMIT,
          select: ['invoiceNumber'],
          startsWith: { invoiceNumber: prefix },
          orderDesc: ['date', '$createdAt'],
          ...(cursorAfter ? { cursorAfter } : {}),
        });

        numbers.push(...result.rows.map((row) => String(row.invoiceNumber ?? '')));

        const last = result.rows.at(-1);
        if (result.rows.length < DEFAULT_LIMIT || !last) break;
        cursorAfter = last.$id;
      } catch (error) {
        throw toAppError(error);
      }
    }

    return numbers;
  }

  async listHistoryByOwner(ownerId: string, limit = HISTORY_LIMIT): Promise<InvoiceHistoryEntry[]> {
    void ownerId;
    try {
      const result = await listData<InvoiceRow>('invoices', {
        orgId: this.org(),
        limit,
        // Project down to the columns the picker reads: the three rich-text
        // sections are the bulkiest columns in the table and the picker never
        // looks at them.
        select: ['customerName', 'customerPhone', 'customerEmail', 'items', 'date'],
        orderDesc: ['date', '$createdAt'],
      });
      return result.rows.map(invoiceHistoryRowToEntry);
    } catch (error) {
      throw toAppError(error);
    }
  }

  async getById(id: string): Promise<Invoice | null> {
    try {
      const row = await getRowData<InvoiceRow>('invoices', this.org(), id);
      return row ? invoiceRowToDomain(row) : null;
    } catch (error) {
      throw toAppError(error);
    }
  }

  async create(input: { id?: string; ownerId: string; draft: InvoiceDraft }): Promise<Invoice> {
    try {
      const orgId = this.org();
      // Derived from (org, number): the deterministic id plus the unique
      // (orgId, invoiceNumber) index behind it is what makes "one invoice per
      // number per organization" a database fact — a second create answers
      // 409 with the conflict copy and lands in the UI's conflict path.
      const rowId = input.id ?? (await invoiceDocumentId(orgId, input.draft.invoiceNumber));
      const row = await createData<InvoiceRow>(
        'invoices',
        orgId,
        draftToRowData(input.draft),
        rowId,
      );
      return invoiceRowToDomain(row);
    } catch (error) {
      // The server already maps a unique-id/index collision to 409 with the
      // "nomor dipakai" copy; anything else keeps the standard mapping.
      throw error instanceof AppError ? error : toAppError(error);
    }
  }

  async update(input: { id: string; draft: InvoiceDraft }): Promise<Invoice> {
    try {
      // `draftToRowUpdateData` omits `status` on purpose: a content save
      // writes every column *except* the lifecycle, which `updateStatus`
      // alone owns (see the mapper for the full rationale).
      const row = await patchData<InvoiceRow>(
        'invoices',
        this.org(),
        input.id,
        draftToRowUpdateData(input.draft),
      );
      return invoiceRowToDomain(row);
    } catch (error) {
      // With the unique (orgId, invoiceNumber) index in place, editing one
      // number onto another is refused server-side — 409 + the conflict copy.
      throw error instanceof AppError ? error : toAppError(error);
    }
  }

  async updateStatus(input: { id: string; status: InvoiceStatus }): Promise<Invoice> {
    try {
      // A partial update: only the keys present in `data` are written, so
      // every other column is left exactly as stored.
      const row = await patchData<InvoiceRow>('invoices', this.org(), input.id, {
        status: input.status,
      });
      return invoiceRowToDomain(row);
    } catch (error) {
      throw toAppError(error);
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await deleteData('invoices', this.org(), id);
    } catch (error) {
      throw toAppError(error);
    }
  }
}

/**
 * One server-side search covering every field the UI offers.
 *
 * The three branches are OR'd server-side (a single `Query.search` names one
 * attribute, and users do not care which field their term landed in). All
 * three columns carry a full-text index.
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
