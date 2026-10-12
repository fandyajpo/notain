import { ID } from 'appwrite';
import type { Customer, CustomerDraft } from '../core/customer/model';
import { customerKey } from '../core/customer/model';
import { customerDraftSchema } from '../core/customer/schema';
import { AppError, ERROR_CODES, flattenIssues } from '../core/shared/errors';
import { container } from '../infra/container';
import { requireSession } from './session';

/** Validates a customer and returns the normalized value, or throws. */
function parseCustomer(draft: CustomerDraft): CustomerDraft {
  const result = customerDraftSchema.safeParse(draft);
  if (!result.success) {
    throw new AppError(ERROR_CODES.VALIDATION, 'Periksa kembali data customer kamu.', {
      fieldErrors: flattenIssues(result.error.issues),
    });
  }
  return result.data;
}

/**
 * The saved-customer directory for the signed-in user, newest first.
 *
 * Built-in behaviour: an empty list is a normal answer, not an error — a new
 * account has no history yet, and the picker falls back to what the user types.
 */
export async function listCustomers(): Promise<Customer[]> {
  const user = await requireSession();
  const customers = await container.customers.listByOwner(user.id);
  // A row with a blank name has nothing to label it with in the picker, so it
  // is skipped rather than surfacing as an empty entry.
  return customers.filter((customer) => customer.name.trim() !== '');
}

export async function createCustomer(draft: CustomerDraft): Promise<Customer> {
  const user = await requireSession();
  return container.customers.create({
    id: ID.unique(),
    ownerId: user.id,
    customer: parseCustomer(draft),
    lastUsedAt: new Date().toISOString(),
  });
}

export async function updateCustomer(id: string, draft: CustomerDraft): Promise<Customer> {
  await requireSession();
  return container.customers.update({
    id,
    customer: parseCustomer(draft),
    lastUsedAt: new Date().toISOString(),
  });
}

export async function deleteCustomer(id: string): Promise<void> {
  await requireSession();
  await container.customers.remove(id);
}

/**
 * Records the customer an invoice was issued to, reusing the row that already
 * stands for the same person.
 *
 * Called on every invoice save. A customer is identified by name + phone
 * (phone folded, so `0812…` and `+62812…` are one entry), which is why this
 * looks the name up rather than blindly inserting — otherwise every invoice
 * would add a duplicate row.
 *
 * Returns `null` when there is nothing worth recording, so a draft with no
 * customer name yet never creates an unlabelled row.
 */
export async function rememberCustomer(
  draft: CustomerDraft,
  lastUsedAt: string = new Date().toISOString(),
): Promise<Customer | null> {
  const name = draft.name.trim();
  if (!name) return null;

  const user = await requireSession();
  const customer = parseCustomer({ name, phone: draft.phone.trim() });

  const matches = await container.customers.findByName(user.id, customer.name);
  const existing = matches.find((row) => customerKey(row) === customerKey(customer));

  if (existing) {
    return container.customers.update({ id: existing.id, customer, lastUsedAt });
  }

  return container.customers.create({
    id: ID.unique(),
    ownerId: user.id,
    customer,
    lastUsedAt,
  });
}

/**
 * Files a batch of imported drafts into the directory.
 *
 * Each row goes through `rememberCustomer`, so a name that already exists is
 * updated rather than duplicated — importing a list that overlaps the current
 * directory must not create a second entry for the same person. The rows are
 * assumed to be pre-validated (see `parseCustomerImportRows`), so a throw here
 * is a genuine storage failure, not a bad row.
 *
 * Returns how many rows were filed.
 */
export async function importCustomers(drafts: CustomerDraft[]): Promise<{ imported: number }> {
  let imported = 0;
  for (const draft of drafts) {
    const row = await rememberCustomer(draft);
    if (row) imported += 1;
  }
  return { imported };
}
