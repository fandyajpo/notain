import { ID } from 'appwrite';
import type {
  Invoice,
  InvoiceDraft,
  InvoiceHistoryEntry,
  InvoiceStatus,
} from '../core/invoice/model';
import { INVOICE_STATUSES } from '../core/invoice/model';
import { invoiceDraftSchema } from '../core/invoice/schema';
import { canChangeStatus, statusFlowMessage } from '../core/invoice/status';
import { AppError, ERROR_CODES, flattenIssues } from '../core/shared/errors';
import { container } from '../infra/container';
import { requireSession } from './session';
import type { InvoicePage, ListInvoicesOptions } from '../ports/invoice-repository';

/** Validates a draft and returns the normalized value, or throws a field-mapped error. */
function parseDraft(draft: InvoiceDraft): InvoiceDraft {
  const result = invoiceDraftSchema.safeParse(draft);
  if (!result.success) {
    throw new AppError(ERROR_CODES.VALIDATION, 'Periksa kembali isian invoice kamu.', {
      fieldErrors: flattenIssues(result.error.issues),
    });
  }
  return result.data;
}

/** One page of invoices, already narrowed by `options.search` when it is long enough. */
export async function listInvoicesPage(options?: ListInvoicesOptions): Promise<InvoicePage> {
  const user = await requireSession();
  return container.invoices.listByOwner(user.id, options);
}

/**
 * Invoice numbers for the current year, walking past the first page.
 *
 * Scoped to the current year because that is all the next-number suggestion
 * needs: sequences restart each calendar year, so earlier years can never
 * collide with the number being offered. Suggesting from a single page would
 * still offer a number that already exists once the year has more than one
 * page of invoices, hence the walk.
 */
export async function listAllInvoiceNumbers(): Promise<string[]> {
  const user = await requireSession();
  return container.invoices.listNumbersByYear(user.id, new Date().getFullYear());
}

/**
 * Recent invoices narrowed to the columns the picker derives suggestions from.
 *
 * A projected read: the rich-text sections the picker never looks at are left
 * behind server-side, so opening the picker does not ship every invoice's HTML.
 */
export async function listPickerHistory(limit?: number): Promise<InvoiceHistoryEntry[]> {
  const user = await requireSession();
  return container.invoices.listHistoryByOwner(user.id, limit);
}

/**
 * Every invoice, walking past the first page.
 *
 * The dashboard list is deliberately paginated so a large account never ships
 * every row on load, but an explicit "export all" is the one moment the whole
 * set is what the user asked for — so it walks the cursor here instead.
 */
export async function listAllInvoices(): Promise<Invoice[]> {
  const user = await requireSession();
  const all: Invoice[] = [];
  let cursorAfter: string | undefined;

  for (;;) {
    const page: InvoicePage = await container.invoices.listByOwner(user.id, { cursorAfter });
    all.push(...page.items);
    if (!page.nextCursor) break;
    cursorAfter = page.nextCursor;
  }

  return all;
}

export async function getInvoice(id: string): Promise<Invoice> {
  await requireSession();
  const invoice = await container.invoices.getById(id);
  if (!invoice) {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'Invoice tidak ditemukan.');
  }
  return invoice;
}

export async function createInvoice(draft: InvoiceDraft): Promise<Invoice> {
  const user = await requireSession();
  return container.invoices.create({
    id: ID.unique(),
    ownerId: user.id,
    draft: parseDraft(draft),
  });
}

export async function updateInvoice(id: string, draft: InvoiceDraft): Promise<Invoice> {
  await requireSession();
  const parsed = parseDraft(draft);
  const current = await container.invoices.getById(id);
  if (!current) {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'Invoice tidak ditemukan.');
  }
  // A full-draft update carries a status too, so it must obey the same
  // lifecycle as the one-field write below — otherwise editing a terminal
  // invoice's contents would be a backdoor to rewinding its status.
  if (!canChangeStatus(current.status, parsed.status)) {
    throw new AppError(ERROR_CODES.VALIDATION, statusFlowMessage(current.status, parsed.status), {
      fieldErrors: { status: statusFlowMessage(current.status, parsed.status) },
    });
  }
  return container.invoices.update({ id, draft: parsed });
}

/**
 * Flips an invoice's lifecycle status along the forward-only chain:
 * `null → sent → paid | void`. `paid` and `void` are terminal, and a status
 * can never be cleared back to unset.
 *
 * A one-field write from the status cell in the table. The target is checked
 * against the stored row (not just the enum) so a stale tab, a replayed
 * request or a corrupted caller cannot move an invoice backwards.
 */
export async function updateInvoiceStatus(id: string, status: InvoiceStatus): Promise<Invoice> {
  await requireSession();
  if (!(INVOICE_STATUSES as readonly string[]).includes(status)) {
    throw new AppError(ERROR_CODES.VALIDATION, 'Status invoice tidak valid.');
  }
  const current = await container.invoices.getById(id);
  if (!current) {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'Invoice tidak ditemukan.');
  }
  if (!canChangeStatus(current.status, status)) {
    const message = statusFlowMessage(current.status, status);
    throw new AppError(ERROR_CODES.VALIDATION, message, {
      fieldErrors: { status: message },
    });
  }
  return container.invoices.updateStatus({ id, status });
}

export async function deleteInvoice(id: string): Promise<void> {
  await requireSession();
  await container.invoices.remove(id);
}
