import type { CatalogItem } from '../catalog/model';
import { CATALOG_KIND_LABELS } from '../catalog/model';
import type { SheetRow } from './csv';

/** Header row written by export. */
export const CATALOG_COLUMNS = ['Nama', 'Jenis', 'Satuan', 'Harga'] as const;

/** One spreadsheet row per catalog entry — what export writes. */
export function toCatalogRow(item: CatalogItem): SheetRow {
  return [item.name, CATALOG_KIND_LABELS[item.kind], item.unit, item.unitPrice];
}

/** Full sheet: header first, then one row per entry, most recently used first. */
export function toCatalogRows(items: CatalogItem[]): SheetRow[] {
  return [[...CATALOG_COLUMNS], ...items.map(toCatalogRow)];
}
