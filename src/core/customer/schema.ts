import '../zod-csp';
import { z } from 'zod';
import { CUSTOMER_LIMITS } from './model';

/**
 * Business rules a customer must satisfy before it is saved.
 *
 * Only the name carries a rule: a customer with no name cannot be labelled in
 * the picker, and the invoice form already requires one before it will submit.
 * The phone is deliberately optional — plenty of walk-up customers never give
 * a number.
 */
export const customerDraftSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Masukkan nama customer.')
    .max(CUSTOMER_LIMITS.name, 'Nama customer terlalu panjang.'),
  phone: z.string().trim().max(CUSTOMER_LIMITS.phone, 'Nomor terlalu panjang.'),
});

export type CustomerDraftInput = z.infer<typeof customerDraftSchema>;

/**
 * Structural schema for a row read back from storage, mirroring the
 * `invoiceRowToDraft` split. A single corrupt column costs one directory
 * entry, never the whole list — a blank name simply drops the row, because
 * there is nothing to label it with.
 */
export const customerShapeSchema = z.object({
  name: z.string().trim().max(CUSTOMER_LIMITS.name).catch(''),
  phone: z.string().trim().max(CUSTOMER_LIMITS.phone).catch(''),
  lastUsedAt: z.string().max(32).catch(''),
});

export type CustomerShapeInput = z.infer<typeof customerShapeSchema>;
