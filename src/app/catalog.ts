import { ID } from 'appwrite';
import type { CatalogDraft, CatalogItem } from '../core/catalog/model';
import { catalogKey, isSameCatalogItem, mergeCatalogItem } from '../core/catalog/model';
import { catalogDraftSchema } from '../core/catalog/schema';
import { mapWithConcurrency } from '../core/shared/concurrency';
import { AppError, ERROR_CODES, flattenIssues } from '../core/shared/errors';
import { container } from '../infra/container';
import { requireSession } from './session';

/** Validates a catalog entry and returns the normalized value, or throws. */
function parseCatalog(draft: CatalogDraft): CatalogDraft {
  const result = catalogDraftSchema.safeParse(draft);
  if (!result.success) {
    throw new AppError(ERROR_CODES.VALIDATION, 'Periksa kembali data barang atau jasa kamu.', {
      fieldErrors: flattenIssues(result.error.issues),
    });
  }
  return result.data;
}

/**
 * How many catalog writes (bulk deletes, auto-save) are kept in flight at once.
 *
 * Same pacing as the customer import: enough concurrency to hide per-row
 * latency, low enough not to trip the Appwrite rate limiter.
 */
const WRITE_CONCURRENCY = 5;

/** How many saved barang/jasa the signed-in user has, without transferring them. */
export async function countCatalog(): Promise<number> {
  const user = await requireSession();
  return container.catalog.countByOwner(user.id);
}

/**
 * The owner's catalog for the signed-in user, most recently used first.
 *
 * An empty list is a normal answer, not an error — a new account has nothing
 * saved yet and the invoice picker simply has no suggestions to offer.
 */
export async function listCatalog(): Promise<CatalogItem[]> {
  const user = await requireSession();
  const items = await container.catalog.listByOwner(user.id);
  // A row with a blank name has nothing to label it with in the picker, so it
  // is skipped rather than surfacing as an empty entry.
  return items.filter((item) => item.name.trim() !== '');
}

/** One page of the catalog for the `/catalog` page's "Muat lebih banyak" list. */
export async function listCatalogPage(
  params: {
    cursorAfter?: string;
    limit?: number;
  } = {},
): Promise<{ rows: CatalogItem[]; total: number; nextCursor: string | null }> {
  const user = await requireSession();
  const [page, total] = await Promise.all([
    container.catalog.listPage(user.id, params),
    container.catalog.countByOwner(user.id),
  ]);
  return { ...page, total };
}

export async function createCatalogItem(draft: CatalogDraft): Promise<CatalogItem> {
  const user = await requireSession();
  const parsed = parseCatalog(draft);

  // Reject an exact duplicate: same name, case and spacing folded. The catalog
  // is a picker aid, so one name is one entry; editing the existing row is how
  // you correct its price or unit.
  const all = await container.catalog.listByOwner(user.id);
  if (all.some((row) => isSameCatalogItem(row, parsed))) {
    throw new AppError(ERROR_CODES.CONFLICT, 'Barang atau jasa dengan nama ini sudah ada.');
  }

  return container.catalog.create({
    id: ID.unique(),
    ownerId: user.id,
    item: parsed,
    lastUsedAt: new Date().toISOString(),
  });
}

export async function updateCatalogItem(id: string, draft: CatalogDraft): Promise<CatalogItem> {
  await requireSession();
  return container.catalog.update({
    id,
    item: parseCatalog(draft),
    lastUsedAt: new Date().toISOString(),
  });
}

export async function deleteCatalogItem(id: string): Promise<void> {
  await requireSession();
  await container.catalog.remove(id);
}

/**
 * Removes several entries in one call (the table's bulk action).
 *
 * A failure mid-batch leaves the already-deleted rows gone — the caller
 * invalidates and refetches, so the list settles on what actually survived.
 */
export async function deleteCatalogItems(ids: string[]): Promise<void> {
  await requireSession();
  await mapWithConcurrency(ids, WRITE_CONCURRENCY, async (id) => {
    await container.catalog.remove(id);
  });
}

/**
 * Files the items an invoice was saved with into the catalog.
 *
 * Called on every invoice save for the rows whose "Simpan ke katalog" box is
 * ticked. An entry is matched by its folded name: a match refreshes the stored
 * unit and price (the freshest numbers the user just typed) while keeping the
 * existing kind, and a miss creates a new row. Auto-save never overwrites a
 * saved entry's name or kind — renaming and re-typing are manual edits.
 *
 * Duplicates *within* one save collapse the same way, so a repeated line item
 * files a single entry.
 *
 * Built-in behaviour: this is non-fatal. A failed file-in must never fail the
 * invoice save, so the caller swallows the error and only warns.
 *
 * Returns how many entries were filed.
 */
export async function rememberCatalogItems(drafts: CatalogDraft[]): Promise<{ imported: number }> {
  const user = await requireSession();

  // Normalise, drop blanks, and collapse duplicates within the save.
  const deduped: CatalogDraft[] = [];
  for (const draft of drafts) {
    const name = draft.name.trim();
    if (!name) continue;
    const item = parseCatalog({
      name,
      kind: draft.kind,
      unit: draft.unit.trim(),
      unitPrice: draft.unitPrice,
    });
    const hit = deduped.find((row) => isSameCatalogItem(row, item));
    if (hit) {
      Object.assign(hit, mergeCatalogItem(hit, item));
    } else {
      deduped.push(item);
    }
  }
  if (deduped.length === 0) return { imported: 0 };

  // One directory read; each draft is matched against every stored row by its
  // folded name rather than a per-row server-side lookup.
  const existing = await container.catalog.listByOwner(user.id);

  const lastUsedAt = new Date().toISOString();
  let imported = 0;

  await mapWithConcurrency(deduped, WRITE_CONCURRENCY, async (item) => {
    const hit =
      existing.find((row) => isSameCatalogItem(row, item)) ??
      existing.find((row) => catalogKey(row.name) === catalogKey(item.name));
    if (hit) {
      const merged = mergeCatalogItem(hit, item);
      await container.catalog.update({ id: hit.id, item: merged, lastUsedAt });
    } else {
      await container.catalog.create({
        id: ID.unique(),
        ownerId: user.id,
        item,
        lastUsedAt,
      });
    }
    imported += 1;
  });

  return { imported };
}
