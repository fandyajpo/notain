import { isIsoDate } from '../shared/dates';
import {
  ADJUSTMENT_TYPES,
  INVOICE_LIMITS,
  type InvoiceAdjustment,
  type InvoiceDraft,
  type InvoiceItem,
} from './model';
import { PHONE_PATTERN } from './schema';

/**
 * Bringing a stored invoice back to something `invoiceDraftSchema` accepts.
 *
 * Rows written before a rule existed — a free-text WhatsApp number, a date in
 * another format, a negative discount — load into the admin edit dialog
 * perfectly well and then refuse to save, one zod message at a time, with no
 * way to tell *which* stale value is at fault. Repairing at seed time flips
 * that: the coerced values are what the form shows, so the admin sees every
 * change before saving, and the dialog says up front that something was
 * touched. Nothing is invented — a value that cannot be coerced is left alone
 * so the normal field error still names it.
 *
 * Generic over the draft shape so the edit form's own state type (which keeps
 * `dueDate` and `notes` non-optional) round-trips without a cast.
 */
export type InvoiceRepairResult<T> = { draft: T; repaired: string[] };

/** `inv/2026/001`, `inv-2026-001`, `INV 2026 001` → `INV-2026-001`. */
const LOOSE_INVOICE_NUMBER = /^inv[-/\s]?(\d{4})[-/\s]?(\d{3,9})$/i;

export function repairInvoiceContent<T extends InvoiceDraft>(draft: T): InvoiceRepairResult<T> {
  const repaired: string[] = [];
  const next: T = { ...draft };

  const phone = normalizePhone(next.customerPhone);
  if (phone !== next.customerPhone) {
    next.customerPhone = phone;
    repaired.push('Nomor WhatsApp dirapikan.');
  }

  if (next.date && !isIsoDate(next.date)) {
    next.date = '';
    repaired.push('Tanggal invoice tidak valid dan dikosongkan.');
  }
  if (next.dueDate && !isIsoDate(next.dueDate)) {
    next.dueDate = '';
    repaired.push('Jatuh tempo tidak valid dan dikosongkan.');
  }
  if (next.dueDate && next.date && next.dueDate < next.date) {
    next.dueDate = '';
    repaired.push('Jatuh tempo sebelum tanggal invoice dan dikosongkan.');
  }

  next.discount = repairAdjustment(next.discount, 'amount', 'Diskon dirapikan.', repaired);
  next.tax = repairAdjustment(next.tax, 'percent', 'Pajak dirapikan.', repaired);
  next.items = repairItems(next.items, repaired);

  const details = Object.fromEntries(
    Object.entries(next.details).slice(0, INVOICE_LIMITS.maxDetails),
  );
  if (Object.keys(details).length !== Object.keys(next.details).length) {
    repaired.push('Detail bisnis melebihi batas dan dipotong.');
  }
  next.details = details;

  next.invoiceNumber = clampOrNormalize(
    next.invoiceNumber.trim(),
    INVOICE_LIMITS.invoiceNumber,
    LOOSE_INVOICE_NUMBER,
    'Nomor invoice dirapikan.',
    repaired,
  );
  next.customerName = clamp(
    next.customerName,
    INVOICE_LIMITS.customerName,
    'Nama pelanggan dipotong.',
    repaired,
  );
  next.customerEmail =
    next.customerEmail === undefined
      ? undefined
      : clamp(
          next.customerEmail,
          INVOICE_LIMITS.customerEmail,
          'Email pelanggan dipotong.',
          repaired,
        );
  next.notes =
    next.notes === undefined
      ? undefined
      : clamp(next.notes, INVOICE_LIMITS.notes, 'Catatan dipotong.', repaired);
  next.sections = {
    header: clamp(next.sections.header, INVOICE_LIMITS.richText, 'Teks kop dipotong.', repaired),
    content: clamp(next.sections.content, INVOICE_LIMITS.richText, 'Teks isi dipotong.', repaired),
    footer: clamp(next.sections.footer, INVOICE_LIMITS.richText, 'Teks footer dipotong.', repaired),
  };
  if (next.templateId && next.templateId.length > 64) {
    next.templateId = '';
    repaired.push('ID template tidak valid dan dikosongkan.');
  }

  return { draft: next, repaired };
}

/**
 * Recovers the digits people scatter through a stored number — separators,
 * a trailing "(WA)" label — and forgives a `62…` written without the plus.
 * Only the digit payload decides: if what remains passes `PHONE_PATTERN` it
 * replaces the value, and if there is nothing numeric to recover (`'telepon
 * rumah'`) the original is returned untouched — that is a genuine typo, and
 * the field error should say so.
 */
function normalizePhone(value: string | undefined): string | undefined {
  if (!value) return value;
  const digits = value.replace(/\D/g, '');
  if (!digits) return value;
  const normalized = digits.startsWith('628') ? `+${digits}` : digits;
  return PHONE_PATTERN.test(normalized) ? normalized : value;
}

function repairAdjustment(
  adjustment: InvoiceAdjustment,
  fallbackType: InvoiceAdjustment['type'],
  label: string,
  repaired: string[],
): InvoiceAdjustment {
  const type = (ADJUSTMENT_TYPES as readonly string[]).includes(adjustment.type)
    ? adjustment.type
    : fallbackType;
  let value = Number.isFinite(adjustment.value) ? adjustment.value : 0;
  if (value < 0) value = 0;
  if (type === 'percent') {
    value = Math.min(value, INVOICE_LIMITS.maxPercent);
  } else {
    value = Math.round(value);
  }
  if (type !== adjustment.type || value !== adjustment.value) repaired.push(label);
  return { type, value };
}

function repairItems(items: InvoiceItem[], repaired: string[]): InvoiceItem[] {
  const capped = items.slice(0, INVOICE_LIMITS.maxItems);
  if (capped.length !== items.length) repaired.push('Baris barang melebihi batas dan dipotong.');

  const kept: InvoiceItem[] = [];
  capped.forEach((item, index) => {
    // An unnamed row is a placeholder someone saved by accident; the grid
    // allows one while editing, but it can never be part of a real invoice.
    if (!item.name.trim()) {
      repaired.push('Baris barang tanpa nama dihapus.');
      return;
    }
    const id = item.id.trim() ? item.id : `item-${index + 1}`;
    const name = item.name.slice(0, INVOICE_LIMITS.itemName);
    const quantity = clampInt(item.quantity, 1, INVOICE_LIMITS.maxQuantity, 1);
    const unitPrice = clampInt(item.unitPrice, 0, INVOICE_LIMITS.maxUnitPrice, 0);
    const unit = item.unit ? item.unit.slice(0, INVOICE_LIMITS.unit) : item.unit;
    if (
      id !== item.id ||
      name !== item.name ||
      quantity !== item.quantity ||
      unitPrice !== item.unitPrice ||
      unit !== item.unit
    ) {
      repaired.push('Baris barang dirapikan.');
    }
    kept.push({ ...item, id, name, quantity, unitPrice, unit });
  });
  return kept;
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  const rounded = Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(Math.max(rounded, min), max);
}

function clamp(value: string, max: number, label: string, repaired: string[]): string {
  if (value.length <= max) return value;
  repaired.push(label);
  return value.slice(0, max);
}

/**
 * `clamp` plus one forgives: an `inv/2026/001` a user typed by hand is the
 * same number, not a different one.
 */
function clampOrNormalize(
  value: string,
  max: number,
  pattern: RegExp,
  label: string,
  repaired: string[],
): string {
  const loose = pattern.exec(value);
  const normalized = loose ? `INV-${loose[1]}-${loose[2]}` : value;
  const result = clamp(normalized, max, label, repaired);
  if (result !== value && !repaired.includes(label)) repaired.push(label);
  return result;
}
