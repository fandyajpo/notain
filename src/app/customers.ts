import { ID } from 'appwrite';
import type { Customer, CustomerDraft } from '../core/customer/model';
import { isSameCustomer, mergeCustomer } from '../core/customer/model';
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
 * How many customer writes are kept in flight during an import.
 *
 * The batch runs writes concurrently so a large file does not take one
 * round-trip per row, but a browser firing hundreds of parallel requests at
 * Appwrite will get throttled. Five is a deliberate middle ground: enough to
 * hide per-row latency, low enough to stay under the rate limiter.
 */
const IMPORT_CONCURRENCY = 5;

/**
 * Runs `task` over `items` with at most `limit` in flight at once.
 *
 * A tiny inline pool rather than a dependency: the whole app is one small
 * static bundle, and this is all an import needs.
 */
async function mapWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      await task(items[index] as T);
    }
  });
  await Promise.all(workers);
}

/**
 * How many customers the signed-in user has, without transferring them.
 *
 * The dashboard stat only needs the number; walking (and mapping) the whole
 * directory for it is the single most wasteful read the app used to do.
 */
export async function countCustomers(): Promise<number> {
  const user = await requireSession();
  return container.customers.countByOwner(user.id);
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
 * Called on every invoice save. Identity is email OR phone (folded), so
 * `0812…` and `+62812…` are one entry, and a contact that shares an email
 * with an existing row is the same person even under a different name.
 *
 * When a match is found the two are merged: empty fields on the existing row
 * are filled from the incoming draft, and fields it already has are kept.
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
  const customer = parseCustomer({
    name,
    email: draft.email.trim(),
    phone: draft.phone.trim(),
  });

  // One directory read instead of per-field server-side lookups. A signed-in
  // account has at most a few hundred customers, so the transfer is cheap and
  // the identity check stays in one place.
  const all = await container.customers.listByOwner(user.id);
  const existing = all.find((row) => isSameCustomer(row, customer));

  if (existing) {
    const merged = mergeCustomer(existing, customer);
    return container.customers.update({ id: existing.id, customer: merged, lastUsedAt });
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
 * Identity is email OR phone: a draft that shares either with an existing
 * row is the same person, and the two are merged (empty fields on the
 * existing row are filled from the draft). Duplicates *within* the file
 * collapse the same way, so `imported` reports how many customers were
 * actually filed.
 *
 * The rows are assumed to be pre-validated (see `parseCustomerImportRows`),
 * so a throw here is a genuine storage failure, not a bad row.
 *
 * Returns how many rows were filed.
 */
export async function importCustomers(drafts: CustomerDraft[]): Promise<{ imported: number }> {
  const user = await requireSession();

  // Normalise, drop blanks, and collapse duplicates within the file. A later
  // draft for the same identity merges into the earlier one, filling only
  // fields the earlier draft left empty.
  const deduped: CustomerDraft[] = [];
  for (const draft of drafts) {
    const name = draft.name.trim();
    if (!name) continue;
    const customer = parseCustomer({
      name,
      email: draft.email.trim(),
      phone: draft.phone.trim(),
    });
    const hit = deduped.find((row) => isSameCustomer(row, customer));
    if (hit) {
      Object.assign(hit, mergeCustomer(hit, customer));
    } else {
      deduped.push(customer);
    }
  }
  if (deduped.length === 0) return { imported: 0 };

  // One directory read; each draft is matched against every stored row by
  // email or phone rather than a per-row server-side search.
  const existing = await container.customers.listByOwner(user.id);

  const lastUsedAt = new Date().toISOString();
  let imported = 0;

  await mapWithConcurrency(deduped, IMPORT_CONCURRENCY, async (customer) => {
    const hit = existing.find((row) => isSameCustomer(row, customer));
    if (hit) {
      const merged = mergeCustomer(hit, customer);
      await container.customers.update({ id: hit.id, customer: merged, lastUsedAt });
    } else {
      await container.customers.create({
        id: ID.unique(),
        ownerId: user.id,
        customer,
        lastUsedAt,
      });
    }
    imported += 1;
  });

  return { imported };
}
