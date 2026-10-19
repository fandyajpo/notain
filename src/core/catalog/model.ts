/** Domain model for the owner's product/service catalog. Pure data. */

export const CATALOG_KINDS = ['barang', 'jasa'] as const;
export type CatalogKind = (typeof CATALOG_KINDS)[number];

/** Indonesian labels for each catalog kind, shown in the table and the picker. */
export const CATALOG_KIND_LABELS: Record<CatalogKind, string> = {
  barang: 'Barang',
  jasa: 'Jasa',
};

/** Column bounds on the Appwrite `catalog` table. */
export const CATALOG_LIMITS = {
  name: 200,
  unit: 16,
  kind: 16,
  maxPrice: 1_000_000_000_000,
  /** How many catalog rows one owner may hold; a guard, not a target. */
  maxItems: 5_000,
} as const;

/**
 * A saved product or service as the app knows it.
 *
 * This is the one place a catalog entry *exists*. An invoice copies the picked
 * name/unit/price into its own item lines and never reads these rows again, so
 * renaming or deleting a catalog entry can never rewrite an issued document.
 */
export type CatalogItem = {
  id: string;
  name: string;
  kind: CatalogKind;
  /** Unit the item is counted in ('pcs', 'kg', 'jam'). Empty means none. */
  unit: string;
  /** Suggested price in whole Rupiah. */
  unitPrice: number;
  /** ISO timestamp of the most recent invoice that used this entry. */
  lastUsedAt: string;
};

/** What the form and the invoice auto-save hold before it becomes a row. */
export type CatalogDraft = {
  name: string;
  kind: CatalogKind;
  unit: string;
  unitPrice: number;
};

/**
 * Folds a name into a comparable key.
 *
 * The catalog is a picker aid: "Nasi Goreng" and "nasi  goreng" are the same
 * product to a business owner, so the *key* collapses case and repeated
 * whitespace. The stored value keeps whatever the user typed.
 */
export function catalogKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Whether two entries stand for the same product or service. */
export function isSameCatalogItem(
  a: Pick<CatalogDraft, 'name'>,
  b: Pick<CatalogDraft, 'name'>,
): boolean {
  const keyA = catalogKey(a.name);
  return keyA !== '' && keyA === catalogKey(b.name);
}

/**
 * Merges an incoming draft into an existing entry.
 *
 * The stored name is kept (a manual rename is how you correct it), an incoming
 * unit/price refreshes because it is the freshest number the user just typed,
 * and an empty field never erases stored data. `kind` is always taken from the
 * existing row: an invoice item carries no kind, so auto-save must not silently
 * demote a saved service to a product.
 */
export function mergeCatalogItem(existing: CatalogDraft, incoming: CatalogDraft): CatalogDraft {
  return {
    name: existing.name.trim() || incoming.name.trim(),
    kind: existing.kind,
    unit: incoming.unit.trim() || existing.unit.trim(),
    unitPrice: incoming.unitPrice || existing.unitPrice,
  };
}
