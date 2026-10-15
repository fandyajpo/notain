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
  const parsed = parseCustomer(draft);

  // Reject an exact duplicate: same email AND same phone. Same email with a
  // different phone (or vice versa) is a different person and is allowed.
  const all = await container.customers.listByOwner(user.id);
  if (all.some((row) => isSameCustomer(row, parsed))) {
    throw new AppError(
      ERROR_CODES.CONFLICT,
      'Customer dengan email dan nomor WhatsApp yang sama sudah ada.',
    );
  }

  return container.customers.create({
    id: ID.unique(),
    ownerId: user.id,
    customer: parsed,
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
 * Collapses several customer rows into one.
 *
 * The user picks which value survives for each field; `draft` carries that
 * choice. The target row is updated in place and every source row is deleted,
 * so the directory ends with a single entry and no dangling references (invoices
 * embed their own copy of the customer name/phone and never read these rows).
 *
 * The target keeps its `lastUsedAt` so recency ordering is not disturbed by a
 * bookkeeping merge.
 */
export async function mergeCustomers(input: {
  targetId: string;
  sourceIds: string[];
  draft: CustomerDraft;
}): Promise<Customer> {
  await requireSession();
  const parsed = parseCustomer(input.draft);
  const lastUsedAt = new Date().toISOString();

  const updated = await container.customers.update({
    id: input.targetId,
    customer: parsed,
    lastUsedAt,
  });

  // Delete the sources after the target is safely updated, so a failure here
  // leaves a duplicate rather than losing data.
  await Promise.all(input.sourceIds.map((id) => container.customers.remove(id)));

  return updated;
}

/**
 * Records the customer an invoice was issued to, reusing the row that already
 * stands for the same person.
 *
 * Called on every invoice save. A row is matched in two steps:
 *
 * 1. Exact identity — same folded email AND phone (so `0812…` and `+62812…`
 *    are one entry), which also catches a renamed spelling of the same person.
 * 2. Same name, case-insensitive — "Budi" with a new phone number updates the
 *    row that already represents Budi instead of filing a second one. The
 *    directory is a picker aid: one name is one person there.
 *
 * On a match, a non-empty field in the draft overwrites the stored value (the
 * number the user just typed is the freshest one); an empty field never erases
 * stored data. `lastUsedAt` is stamped from the invoice's own timestamp.
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
  // Sorted newest-first by `lastUsedAt`, so among several same-name rows the
  // most recently used one absorbs the update.
  const existing =
    all.find((row) => isSameCustomer(row, customer)) ??
    all.find((row) => row.name.trim().toLowerCase() === customer.name.toLowerCase());

  if (existing) {
    const merged: CustomerDraft = {
      name: existing.name.trim() || customer.name,
      email: customer.email || existing.email,
      phone: customer.phone || existing.phone,
    };
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
