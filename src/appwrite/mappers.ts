import type { Models } from 'appwrite';
import { invoiceDetailShapeSchema, invoiceItemShapeSchema } from '../core/invoice/schema';
import type {
  AdjustmentType,
  Invoice,
  InvoiceAdjustment,
  InvoiceDraft,
  InvoiceHistoryEntry,
  InvoiceItem,
  InvoiceSections,
  InvoiceStatus,
} from '../core/invoice/model';
import { INVOICE_STATUSES } from '../core/invoice/model';
import type { BusinessProfile, Plan } from '../core/profile/model';
import { isBusinessSubtypeSlug } from '../core/business/taxonomy';
import type { AuthoredTemplate, InvoiceTemplate } from '../core/template/model';
import { DEFAULT_THEME } from '../core/template/model';
import { invoiceTemplateShapeSchema } from '../core/template/schema';
import type { Customer } from '../core/customer/model';
import type { InvoiceFinanceEntry } from '../core/stats/finance';
import { customerShapeSchema } from '../core/customer/schema';
import type { CatalogItem } from '../core/catalog/model';
import { catalogShapeSchema } from '../core/catalog/schema';
import { toCounts, type DashboardStats, type StatsCounts } from '../core/stats/model';

/** Row shape returned by the `invoices` table. */
export type InvoiceRow = Models.Row &
  Record<string, unknown> & {
    ownerId: string;
    invoiceNumber: string;
    date: string;
    dueDate: string | null;
    templateId?: string | null;
    status: string;
    customerName: string;
    customerPhone: string | null;
    customerEmail: string | null;
    items: string;
    /** Business detail JSON (`{ "nomor-polisi": "B 1234 XY" }`); null when empty. */
    details?: string | null;
    discountType: AdjustmentType;
    discountValue: number;
    taxType: AdjustmentType;
    taxValue: number;
    notes: string | null;
    headerHtml: string | null;
    contentHtml: string | null;
    footerHtml: string | null;
    /** R2 key of the customer's uploaded payment proof; null when none. */
    paymentProofKey?: string | null;
    /** ISO timestamp of the payment-proof upload; null when none. */
    paymentProofUploadedAt?: string | null;
  };

/** Row shape returned by the `profiles` table. */
export type ProfileRow = Models.Row &
  Record<string, unknown> & {
    name: string;
    businessName: string | null;
    phone: string;
    address: string | null;
    email: string | null;
    logoFileId: string | null;
    /** Business-type slug; absent on rows written before the column existed. */
    businessType?: string | null;
    plan: string;
    planExpiresAt: string | null;
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
    /** Business-type slug; absent on rows written before the column existed. */
    businessType?: string | null;
  };

/** Row shape returned by the `customers` table. */
export type CustomerRow = Models.Row &
  Record<string, unknown> & {
    ownerId: string;
    name: string;
    email: string | null;
    phone: string | null;
    lastUsedAt: string | null;
  };

/** Row shape returned by the `catalog` table. */
export type CatalogRow = Models.Row &
  Record<string, unknown> & {
    ownerId: string;
    name: string;
    kind: string | null;
    unit: string | null;
    unitPrice: number | null;
    lastUsedAt: string | null;
  };

/** Row shape returned by the `stats` table (dashboard counters cache). */
export type StatsRow = Models.Row &
  Record<string, unknown> & {
    ownerId: string;
    totalInvoices: number | null;
    sentCount: number | null;
    paidCount: number | null;
    voidCount: number | null;
    totalCustomers: number | null;
    totalTemplates: number | null;
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

/**
 * Parses the `details` JSON column — the business-specific key-value facts
 * (plate number, weight…) authored per invoice. Rows written before the column
 * existed, or rows whose JSON is corrupt, degrade to an empty record: the
 * invoice simply shows nothing extra rather than failing to load.
 */
export function parseInvoiceDetails(raw: unknown): Record<string, string> {
  if (typeof raw !== 'string' || raw === '') return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    const result = invoiceDetailShapeSchema.safeParse(parsed);
    return result.success ? result.data : {};
  } catch {
    return {};
  }
}

function toAdjustment(type: unknown, value: unknown): InvoiceAdjustment {
  return {
    type: type === 'percent' ? 'percent' : 'amount',
    value: typeof value === 'number' && Number.isFinite(value) ? value : 0,
  };
}

/**
 * A stored status that is unset (empty), missing or corrupt reads back as
 * `null` — "Belum dikirim" — never crashes and never pretends to be sent.
 */
function parseInvoiceStatus(raw: unknown): InvoiceStatus | null {
  return typeof raw === 'string' && (INVOICE_STATUSES as readonly string[]).includes(raw)
    ? (raw as InvoiceStatus)
    : null;
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
    status: parseInvoiceStatus(row.status),
    customerName: row.customerName,
    customerPhone: optionalString(row.customerPhone),
    customerEmail: optionalString(row.customerEmail),
    items: parseInvoiceItems(row.items),
    details: parseInvoiceDetails(row.details),
    discount: toAdjustment(row.discountType, row.discountValue),
    tax: toAdjustment(row.taxType, row.taxValue),
    sections: toSections(row),
    notes: optionalString(row.notes),
    // A half-written pair (key without timestamp, or vice versa) still reads
    // as a proof: the key is what loads the image, the timestamp is display.
    paymentProof: optionalString(row.paymentProofKey)
      ? {
          key: optionalString(row.paymentProofKey) ?? '',
          uploadedAt: optionalString(row.paymentProofUploadedAt) ?? row.$updatedAt,
        }
      : null,
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
    // The column is a plain non-required string (default 'sent' only applies
    // when the key is omitted), so unset is stored as '' — the round trip
    // `parseInvoiceStatus('')` → `null` reads it back as "Belum dikirim".
    status: draft.status ?? '',
    customerName: draft.customerName,
    customerPhone: draft.customerPhone ?? null,
    customerEmail: draft.customerEmail ?? null,
    items: JSON.stringify(draft.items),
    details: Object.keys(draft.details).length > 0 ? JSON.stringify(draft.details) : null,
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

/**
 * The same payload as `draftToRowData`, minus the lifecycle `status` column.
 *
 * Appwrite's `updateRow` writes only the keys present in `data`, so leaving
 * `status` out is what makes a full-content save *structurally* unable to
 * touch the lifecycle — a stale form (or a second tab) can overwrite contents
 * but never rewind a status. `updateStatus` is the only writer of that column.
 *
 * Used by `update` alone: `create` still goes through `draftToRowData` so a
 * new row always stores an explicit status key from its first write.
 */
export function draftToRowUpdateData(draft: InvoiceDraft): Record<string, unknown> {
  const data = draftToRowData(draft);
  delete data.status;
  return data;
}

export function profileRowToDomain(row: ProfileRow): BusinessProfile {
  return {
    name: row.name,
    businessName: optionalString(row.businessName) ?? '',
    phone: row.phone,
    address: optionalString(row.address),
    email: optionalString(row.email),
    logoFileId: optionalString(row.logoFileId),
    // A slug the taxonomy no longer knows reads as "no type" rather than
    // poisoning every form that loads this profile.
    businessType:
      typeof row.businessType === 'string' && isBusinessSubtypeSlug(row.businessType)
        ? row.businessType
        : null,
    plan: (row.plan as Plan) ?? 'free',
    planExpiresAt: optionalString(row.planExpiresAt) ?? null,
  };
}

export function profileToRowData(profile: BusinessProfile): Record<string, unknown> {
  return {
    name: profile.name,
    businessName: profile.businessName || null,
    phone: profile.phone,
    address: profile.address ?? null,
    email: profile.email ?? null,
    logoFileId: profile.logoFileId ?? null,
    businessType: profile.businessType ?? null,
    plan: profile.plan,
    planExpiresAt: profile.planExpiresAt ?? null,
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
    businessType: null,
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
    businessType: row.businessType ?? null,
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
    businessType: shape.businessType,
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
    businessType: template.businessType ?? null,
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
    email: row.email,
    phone: row.phone,
    lastUsedAt: row.lastUsedAt,
  });

  const shape = parsed.success ? parsed.data : { name: '', email: '', phone: '', lastUsedAt: '' };

  return {
    id: row.$id,
    name: shape.name,
    email: shape.email,
    phone: shape.phone,
    lastUsedAt: shape.lastUsedAt,
  };
}

/** Serializes a customer into the flat column payload expected by the table. */
export function customerToRowData(
  customer: { name: string; email: string; phone: string },
  lastUsedAt: string,
): Record<string, unknown> {
  return {
    name: customer.name.trim(),
    email: customer.email.trim() || null,
    phone: customer.phone.trim() || null,
    lastUsedAt,
  };
}

/**
 * Reads a catalog row back.
 *
 * A blank name is a row with nothing to label in the picker, so the caller
 * skips it rather than surfacing an empty entry.
 */
export function catalogRowToDomain(row: CatalogRow): CatalogItem {
  const parsed = catalogShapeSchema.safeParse({
    name: row.name,
    kind: row.kind,
    unit: row.unit,
    unitPrice: row.unitPrice,
    lastUsedAt: row.lastUsedAt,
  });

  const shape = parsed.success
    ? parsed.data
    : { name: '', kind: 'barang' as const, unit: '', unitPrice: 0, lastUsedAt: '' };

  return {
    id: row.$id,
    name: shape.name,
    kind: shape.kind,
    unit: shape.unit,
    unitPrice: shape.unitPrice,
    lastUsedAt: shape.lastUsedAt,
  };
}

/** Serializes a catalog entry into the flat column payload expected by the table. */
export function catalogToRowData(
  item: { name: string; kind: string; unit: string; unitPrice: number },
  lastUsedAt: string,
): Record<string, unknown> {
  return {
    name: item.name.trim(),
    kind: item.kind,
    unit: item.unit.trim() || null,
    unitPrice: item.unitPrice,
    lastUsedAt,
  };
}

/**
 * Maps a *projected* invoice row (see `listHistoryByOwner`) back to the narrow
 * slice the picker reads.
 *
 * The row was fetched with `Query.select`, so the rich-text sections and
 * adjustments are absent by design — only the customer columns, the item lines
 * and the timestamps the recency sort uses are carried across.
 */
/**
 * Maps a *projected* finance row (see `listFinanceEntries`) back to the
 * narrow slice the dashboard's money math reads. The rich-text columns were
 * left behind server-side, so only the selected attributes — plus the system
 * stamps Appwrite always returns — are carried across.
 */
export function invoiceFinanceRowToEntry(row: InvoiceRow): InvoiceFinanceEntry {
  return {
    id: row.$id,
    invoiceNumber: typeof row.invoiceNumber === 'string' ? row.invoiceNumber : '',
    customerName: typeof row.customerName === 'string' ? row.customerName : '',
    customerPhone: optionalString(row.customerPhone),
    status: parseInvoiceStatus(row.status),
    date: typeof row.date === 'string' ? row.date : '',
    dueDate: optionalString(row.dueDate),
    items: parseInvoiceItems(row.items),
    discount: toAdjustment(row.discountType, row.discountValue),
    tax: toAdjustment(row.taxType, row.taxValue),
    createdAt: row.$createdAt,
    paymentProof: optionalString(row.paymentProofKey)
      ? {
          key: optionalString(row.paymentProofKey) ?? '',
          uploadedAt: optionalString(row.paymentProofUploadedAt) ?? row.$updatedAt,
        }
      : null,
  };
}

export function invoiceHistoryRowToEntry(row: InvoiceRow): InvoiceHistoryEntry {
  return {
    customerName: typeof row.customerName === 'string' ? row.customerName : '',
    customerPhone: optionalString(row.customerPhone),
    customerEmail: optionalString(row.customerEmail),
    items: parseInvoiceItems(row.items),
    date: typeof row.date === 'string' ? row.date : '',
    createdAt: row.$createdAt,
    updatedAt: row.$updatedAt,
  };
}

/**
 * Reads a `stats` row back. A missing or corrupt counter degrades to 0 —
 * the row is a cache, and the next refresh recomputes the real number.
 */
export function statsRowToDomain(row: StatsRow): DashboardStats {
  return {
    id: row.$id,
    ownerId: typeof row.ownerId === 'string' ? row.ownerId : '',
    ...toCounts(row),
    updatedAt: typeof row.$updatedAt === 'string' ? row.$updatedAt : '',
  };
}

/** Serializes the counters into the flat column payload expected by the table. */
export function statsToRowData(counts: StatsCounts): Record<string, number> {
  return {
    totalInvoices: counts.totalInvoices,
    sentCount: counts.sentCount,
    paidCount: counts.paidCount,
    voidCount: counts.voidCount,
    totalCustomers: counts.totalCustomers,
    totalTemplates: counts.totalTemplates,
  };
}
