import { ID } from 'appwrite';
import type { Invoice, InvoiceDraft } from '../core/invoice/model';
import { invoiceDraftSchema } from '../core/invoice/schema';
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
 * Every invoice number, walking past the first page.
 *
 * Suggesting the next number from a single page would offer a number that
 * already exists once the account has more than one page of invoices.
 */
export async function listAllInvoiceNumbers(): Promise<string[]> {
  const user = await requireSession();
  return container.invoices.listAllNumbersByOwner(user.id);
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
  return container.invoices.update({ id, draft: parseDraft(draft) });
}

export async function deleteInvoice(id: string): Promise<void> {
  await requireSession();
  await container.invoices.remove(id);
}
