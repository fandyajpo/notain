import '../zod-csp';
import { z } from 'zod';
import { isIsoDate } from '../shared/dates';
import { ADJUSTMENT_TYPES, INVOICE_LIMITS } from './model';
import { calculateItemSubtotal } from './calculator';

/** Indonesian mobile numbers, local or international format. */
const phonePattern = /^(?:\+?62|0)8\d{7,12}$/;

const isoDate = z.string().trim().refine(isIsoDate, { message: 'Masukkan tanggal yang valid.' });

export const invoiceItemSchema = z.object({
  id: z.string().min(1, 'Item tidak valid.'),
  name: z
    .string()
    .trim()
    .min(1, 'Nama barang belum diisi.')
    .max(INVOICE_LIMITS.itemName, 'Nama barang terlalu panjang.'),
  quantity: z
    .number({ error: 'Masukkan jumlah yang valid.' })
    .int('Jumlah harus berupa bilangan bulat.')
    .min(1, 'Jumlah minimal 1.')
    .max(INVOICE_LIMITS.maxQuantity, 'Jumlah terlalu besar.'),
  unitPrice: z
    .number({ error: 'Masukkan harga yang valid.' })
    .int('Harga harus berupa bilangan bulat rupiah.')
    .min(0, 'Harga tidak boleh negatif.')
    .max(INVOICE_LIMITS.maxUnitPrice, 'Harga terlalu besar.'),
});

export type InvoiceItemInput = z.infer<typeof invoiceItemSchema>;

export const invoiceAdjustmentSchema = z
  .object({
    type: z.enum(ADJUSTMENT_TYPES),
    value: z.number({ error: 'Masukkan angka yang valid.' }).min(0, 'Nilai tidak boleh negatif.'),
  })
  .superRefine((adjustment, ctx) => {
    if (adjustment.type === 'percent' && adjustment.value > INVOICE_LIMITS.maxPercent) {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'Persentase maksimal 100%.',
      });
    }
    if (adjustment.type === 'amount' && !Number.isInteger(adjustment.value)) {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'Nominal harus berupa bilangan bulat rupiah.',
      });
    }
  });

export type InvoiceAdjustmentInput = z.infer<typeof invoiceAdjustmentSchema>;

/**
 * Line-item shape for draft restore: types and sane bounds only.
 * The name may be empty and the quantity may still be zero — both are the
 * normal state of a row the user just added. `invoiceItemSchema` enforces the
 * real rules on change and on submit.
 *
 * Also used when reading persisted rows back: a row that fails a *business*
 * rule must not be dropped, or the displayed total would silently disagree
 * with the stored one.
 */
export const invoiceItemShapeSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(INVOICE_LIMITS.itemName),
  quantity: z.number().min(0).max(INVOICE_LIMITS.maxQuantity),
  unitPrice: z.number().min(0).max(INVOICE_LIMITS.maxUnitPrice),
});

export const invoiceSectionsSchema = z.object({
  header: z.string().max(INVOICE_LIMITS.richText, 'Bagian atas terlalu panjang.'),
  content: z.string().max(INVOICE_LIMITS.richText, 'Bagian isi terlalu panjang.'),
  footer: z.string().max(INVOICE_LIMITS.richText, 'Bagian bawah terlalu panjang.'),
});

export const invoiceDraftSchema = z
  .object({
    invoiceNumber: z
      .string()
      .trim()
      .min(1, 'Masukkan nomor invoice.')
      .max(INVOICE_LIMITS.invoiceNumber, 'Nomor invoice terlalu panjang.')
      .regex(/^INV-\d{4}-\d{3,9}$/, 'Format nomor invoice: INV-2026-001.'),
    date: isoDate,
    dueDate: z
      .string()
      .trim()
      .optional()
      .refine((value) => !value || isIsoDate(value), {
        message: 'Masukkan jatuh tempo yang valid.',
      })
      .transform((value) => value || undefined),
    templateId: z
      .string()
      .trim()
      .max(64, 'Template tidak valid.')
      .optional()
      .transform((value) => value || undefined),
    customerName: z
      .string()
      .trim()
      .min(1, 'Masukkan nama customer terlebih dahulu.')
      .max(INVOICE_LIMITS.customerName, 'Nama customer terlalu panjang.'),
    customerPhone: z
      .string()
      .trim()
      .optional()
      .refine((value) => !value || phonePattern.test(value), {
        message: 'Masukkan nomor WhatsApp customer yang valid.',
      })
      .transform((value) => value || undefined),
    discount: invoiceAdjustmentSchema,
    tax: invoiceAdjustmentSchema,
    items: z
      .array(invoiceItemSchema)
      .min(1, 'Tambahkan minimal satu item ke invoice.')
      .max(INVOICE_LIMITS.maxItems, 'Jumlah item terlalu banyak.'),
    sections: invoiceSectionsSchema,
    notes: z
      .string()
      .trim()
      .max(INVOICE_LIMITS.notes, 'Catatan terlalu panjang.')
      .optional()
      .transform((value) => value || undefined),
  })
  .superRefine((draft, ctx) => {
    if (draft.dueDate && draft.dueDate < draft.date) {
      ctx.addIssue({
        code: 'custom',
        path: ['dueDate'],
        message: 'Jatuh tempo tidak boleh sebelum tanggal invoice.',
      });
    }

    const subtotal = draft.items.reduce((total, item) => total + calculateItemSubtotal(item), 0);

    if (draft.discount.type === 'amount' && draft.discount.value > subtotal) {
      ctx.addIssue({
        code: 'custom',
        path: ['discount', 'value'],
        message: 'Diskon melebihi total barang.',
      });
    }
  });

export type InvoiceDraftInput = z.infer<typeof invoiceDraftSchema>;

/**
 * Structural schema for a *persisted draft*, used only when restoring
 * autosaved work from `localStorage`.
 *
 * A draft is work in progress, so an empty customer name, an unnamed line item
 * and zero items are all normal states that must survive a reload. Those are
 * business rules and stay in `invoiceDraftSchema`, which the form enforces on
 * change and on submit. Validating a restored draft against the business
 * schema would silently throw away every incomplete draft — which is exactly
 * the situation autosave exists for.
 *
 * This shape schema checks types and sane bounds only, so corrupt content is
 * still rejected while work-in-progress is kept.
 */
export const invoiceDraftShapeSchema = z.object({
  invoiceNumber: z.string().max(INVOICE_LIMITS.invoiceNumber),
  date: z.string().max(32),
  // Any string is accepted here: a malformed value surfaces as a normal field
  // error in the form rather than discarding the whole draft.
  dueDate: z.string().max(32).optional().catch(undefined),
  templateId: z.string().max(64).optional().catch(undefined),
  customerName: z.string().max(INVOICE_LIMITS.customerName),
  customerPhone: z.string().max(INVOICE_LIMITS.customerPhone).optional().catch(undefined),
  discount: invoiceAdjustmentSchema,
  tax: invoiceAdjustmentSchema,
  items: z.array(invoiceItemShapeSchema).max(INVOICE_LIMITS.maxItems),
  sections: invoiceSectionsSchema,
  notes: z.string().max(INVOICE_LIMITS.notes).optional().catch(undefined),
});

export type InvoiceDraftShapeInput = z.infer<typeof invoiceDraftShapeSchema>;
