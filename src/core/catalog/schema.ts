import '../zod-csp';
import { z } from 'zod';
import { CATALOG_KINDS, CATALOG_LIMITS } from './model';

/**
 * Business rules a catalog entry must satisfy before it is saved.
 *
 * A name is required because an unnamed row cannot be labelled in the picker.
 * The unit is optional (plenty of goods are priced per piece) and the price may
 * be zero for something quoted per job.
 */
export const catalogDraftSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Masukkan nama barang atau jasa.')
    .max(CATALOG_LIMITS.name, 'Nama terlalu panjang.'),
  kind: z.enum(CATALOG_KINDS).catch('barang'),
  unit: z.string().trim().max(CATALOG_LIMITS.unit, 'Satuan terlalu panjang.'),
  unitPrice: z
    .number({ error: 'Masukkan harga yang valid.' })
    .int('Harga harus berupa bilangan bulat rupiah.')
    .min(0, 'Harga tidak boleh negatif.')
    .max(CATALOG_LIMITS.maxPrice, 'Harga terlalu besar.'),
});

export type CatalogDraftInput = z.infer<typeof catalogDraftSchema>;

/**
 * Structural schema for a row read back from storage. Every field carries a
 * `.catch()` fallback so a single corrupt column costs one entry's field, not
 * the whole list — a blank name simply drops the row in the caller.
 */
export const catalogShapeSchema = z.object({
  name: z.string().trim().max(CATALOG_LIMITS.name).catch(''),
  kind: z.enum(CATALOG_KINDS).catch('barang'),
  unit: z.string().trim().max(CATALOG_LIMITS.unit).catch(''),
  unitPrice: z.number().min(0).max(CATALOG_LIMITS.maxPrice).catch(0),
  lastUsedAt: z.string().max(32).catch(''),
});

export type CatalogShapeInput = z.infer<typeof catalogShapeSchema>;
