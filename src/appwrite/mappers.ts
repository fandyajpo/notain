import type { Models } from 'appwrite';
import { invoiceItemShapeSchema } from '../core/invoice/schema';
import type {
  AdjustmentType,
  Invoice,
  InvoiceAdjustment,
  InvoiceDraft,
  InvoiceItem,
  InvoiceSections,
} from '../core/invoice/model';
import type { BusinessProfile } from '../core/profile/model';
import type { AuthoredTemplate, InvoiceTemplate } from '../core/template/model';
import { DEFAULT_THEME } from '../core/template/model';
import { invoiceTemplateShapeSchema } from '../core/template/schema';
import type { Customer } from '../core/customer/model';
import { customerShapeSchema } from '../core/customer/schema';

/** Row shape returned by the `invoices` table. */
export type InvoiceRow = Models.Row &
  Record<string, unknown> & {
    ownerId: string;
    invoiceNumber: string;
    date: string;
    dueDate: string | null;
    templateId?: string | null;
    customerName: string;
    customerPhone: string | null;
    items: string;
    discountType: AdjustmentType;
    discountValue: number;
    taxType: AdjustmentType;
    taxValue: number;
    notes: string | null;
    headerHtml: string | null;
    contentHtml: string | null;
    footerHtml: string | null;
  };

/** Row shape returned by the `profiles` table. */
export type ProfileRow = Models.Row &
  Record<string, unknown> & {
    name: string;
    phone: string;
    address: string | null;
    email: string | null;
    logoFileId: string | null;
  };

/** Row shape returned by the `templates` table. */
export type TemplateRow = Models.Row &
  Record<string, unknown> & {
    ownerId: string;
    name: string;
    layout: string;
    theme: string;
    headerHtml: string | null;
    contentHtml: string | null;
    footerHtml: string | null;
    notes: string | null;
  };

/** Row shape returned by the `customers` table. */
export type CustomerRow = Models.Row &
  Record<string, unknown> & {
    ownerId: string;
    name: string;
    phone: string | null;
    lastUsedAt: string | null;
  };

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * Parses the `items` JSON column. Malformed rows degrade to an empty list
 * rather than crashing the whole list view.
 *
 * Entries are checked against the *shape* schema, not `invoiceItemSchema`.
 * The stricter schema enforces business rules (non-empty name, quantity ≥ 1)
 * that are for the form to police; applying them on read would silently drop
 * an entry and make the displayed total disagree with what is stored. Shape
 * validation still rejects genuinely corrupt data — wrong types, negative
 * quantities, out-of-range values.
 */
export function parseInvoiceItems(raw: unknown): InvoiceItem[] {
  if (typeof raw !== 'string' || raw === '') return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      const result = invoiceItemShapeSchema.safeParse(entry);
      return result.success ? [result.data] : [];
    });
  } catch {
    return [];
  }
}

function toAdjustment(type: unknown, value: unknown): InvoiceAdjustment {
  return {
    type: type === 'percent' ? 'percent' : 'amount',
    value: typeof value === 'number' && Number.isFinite(value) ? value : 0,
  };
}

export function toSections(row: InvoiceRow): InvoiceSections {
  return {
    header: typeof row.headerHtml === 'string' ? row.headerHtml : '',
    content: typeof row.contentHtml === 'string' ? row.contentHtml : '',
    footer: typeof row.footerHtml === 'string' ? row.footerHtml : '',
  };
}

export function invoiceRowToDomain(row: InvoiceRow): Invoice {
  return {
    id: row.$id,
    ownerId: row.ownerId,
    invoiceNumber: row.invoiceNumber,
    date: row.date,
    dueDate: optionalString(row.dueDate),
    templateId: optionalString(row.templateId),
    customerName: row.customerName,
    customerPhone: optionalString(row.customerPhone),
    items: parseInvoiceItems(row.items),
    discount: toAdjustment(row.discountType, row.discountValue),
    tax: toAdjustment(row.taxType, row.taxValue),
    sections: toSections(row),
    notes: optionalString(row.notes),
    createdAt: row.$createdAt,
    updatedAt: row.$updatedAt,
  };
}

/** Serializes a draft into the flat column payload expected by the table. */
export function draftToRowData(draft: InvoiceDraft): Record<string, unknown> {
  return {
    invoiceNumber: draft.invoiceNumber,
    date: draft.date,
    dueDate: draft.dueDate ?? null,
    templateId: draft.templateId ?? null,
    customerName: draft.customerName,
    customerPhone: draft.customerPhone ?? null,
    items: JSON.stringify(draft.items),
    discountType: draft.discount.type,
    discountValue: draft.discount.value,
    taxType: draft.tax.type,
    taxValue: draft.tax.value,
    notes: draft.notes ?? null,
    headerHtml: draft.sections.header,
    contentHtml: draft.sections.content,
    footerHtml: draft.sections.footer,
  };
}

export function profileRowToDomain(row: ProfileRow): BusinessProfile {
  return {
    name: row.name,
    phone: row.phone,
    address: optionalString(row.address),
    email: optionalString(row.email),
    logoFileId: optionalString(row.logoFileId),
  };
}

export function profileToRowData(profile: BusinessProfile): Record<string, unknown> {
  return {
    name: profile.name,
    phone: profile.phone,
    address: profile.address ?? null,
    email: profile.email ?? null,
    logoFileId: profile.logoFileId ?? null,
  };
}

/**
 * Parses a JSON column, returning `undefined` so the shape schema can apply
 * its own fallback instead of the caller inventing one.
 */
function parseJsonColumn(raw: unknown): unknown {
  if (typeof raw !== 'string' || raw === '') return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function emptyTemplateShape() {
  return {
    name: 'Template',
    layout: [],
    theme: DEFAULT_THEME,
    defaults: { header: '', content: '', footer: '', notes: undefined },
  };
}

/**
 * Reads a template row back.
 *
 * Every field goes through the shape schema, whose `.catch()` fallbacks mean a
 * single corrupt column costs one theme or one block — not the whole row.
 * `builtin` is always false: a row cannot claim to be code-defined.
 */
export function templateRowToDomain(row: TemplateRow): InvoiceTemplate {
  const parsed = invoiceTemplateShapeSchema.safeParse({
    name: row.name,
    layout: parseJsonColumn(row.layout),
    theme: parseJsonColumn(row.theme),
    defaults: {
      header: row.headerHtml,
      content: row.contentHtml,
      footer: row.footerHtml,
      notes: row.notes,
    },
  });

  const shape = parsed.success ? parsed.data : emptyTemplateShape();

  return {
    id: row.$id,
    name: shape.name,
    layout: shape.layout,
    theme: shape.theme,
    // A text column that was never written comes back as `null`, and a single
    // `null` here used to trip `templateDefaultsSchema` — which then threw
    // away the whole `defaults` object, rich text and all. Coerce first, the
    // same way `toSections` does for invoices.
    defaults: {
      header: typeof row.headerHtml === 'string' ? row.headerHtml : '',
      content: typeof row.contentHtml === 'string' ? row.contentHtml : '',
      footer: typeof row.footerHtml === 'string' ? row.footerHtml : '',
      notes: optionalString(row.notes),
    },
    builtin: false,
  };
}

/** Serializes a template into the flat column payload expected by the table. */
export function templateToRowData(template: AuthoredTemplate): Record<string, unknown> {
  return {
    name: template.name,
    layout: JSON.stringify(template.layout),
    theme: JSON.stringify(template.theme),
    headerHtml: template.defaults.header,
    contentHtml: template.defaults.content,
    footerHtml: template.defaults.footer,
    notes: template.defaults.notes ?? null,
  };
}

/**
 * Reads a customer row back.
 *
 * A blank name is a row with nothing to label in the picker, so it is skipped
 * by the caller rather than surfaced as an empty entry.
 */
export function customerRowToDomain(row: CustomerRow): Customer {
  const parsed = customerShapeSchema.safeParse({
    name: row.name,
    phone: row.phone,
    lastUsedAt: row.lastUsedAt,
  });

  const shape = parsed.success ? parsed.data : { name: '', phone: '', lastUsedAt: '' };

  return {
    id: row.$id,
    name: shape.name,
    phone: shape.phone,
    lastUsedAt: shape.lastUsedAt,
  };
}

/** Serializes a customer into the flat column payload expected by the table. */
export function customerToRowData(
  customer: { name: string; phone: string },
  lastUsedAt: string,
): Record<string, unknown> {
  return {
    name: customer.name.trim(),
    phone: customer.phone.trim() || null,
    lastUsedAt,
  };
}
