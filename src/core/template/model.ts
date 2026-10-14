/** Domain model for an invoice template. Pure data — no framework or SDK types. */

/**
 * Hard limits shared by validation and persistence. The Appwrite columns are
 * sized from these numbers, so keep them in sync when either changes.
 *
 * The rich-text sizes mirror `INVOICE_LIMITS` so a template default can hold
 * exactly what the invoice field it seeds can hold.
 */
export const TEMPLATE_LIMITS = {
  name: 128,
  maxBlocks: 40,
  richText: 20_000,
  notes: 5_000,
} as const;

export const BLOCK_TYPES = [
  'letterhead',
  'richHeader',
  'customer',
  'items',
  'richContent',
  'totals',
  'notes',
  'richFooter',
  'divider',
  'spacer',
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

/** Indonesian labels shown by the template editor's block list and palette. */
export const BLOCK_LABELS: Record<BlockType, string> = {
  letterhead: 'Kop & info invoice',
  richHeader: 'Teks pembuka',
  customer: 'Kotak customer',
  items: 'Daftar barang',
  richContent: 'Teks di tengah',
  totals: 'Ringkasan total',
  notes: 'Kotak catatan',
  richFooter: 'Teks penutup',
  divider: 'Garis pemisah',
  spacer: 'Spasi kosong',
};

export const BLOCK_ALIGNS = ['left', 'center', 'right'] as const;
export type BlockAlign = (typeof BLOCK_ALIGNS)[number];

/**
 * How much of the page width a block may occupy. `align` then decides which
 * side the narrower block hugs, so "narrow + right" reads as a totals column
 * tucked into the corner without a free-positioning canvas.
 */
export const BLOCK_WIDTHS = ['full', 'wide', 'narrow'] as const;
export type BlockWidth = (typeof BLOCK_WIDTHS)[number];

/**
 * Blocks an invoice cannot be rendered without. A layout that drops or hides
 * one of these would produce a document with no letterhead, no line items or
 * no grand total, so validation rejects it outright.
 */
export const REQUIRED_BLOCK_TYPES = ['letterhead', 'items', 'totals'] as const;

export type TemplateBlock = {
  id: string;
  type: BlockType;
  visible: boolean;
  align: BlockAlign;
  width: BlockWidth;
};

/**
 * Page background treatment. Kept to two gradients-plus-flat shapes on purpose:
 * anything richer belongs to a design tool, not to an invoice that has to
 * still print legibly on an office printer.
 */
export type TemplateWallpaper =
  | { kind: 'none' }
  | { kind: 'solid'; color: string }
  | { kind: 'gradient'; from: string; to: string; angle: number };

/**
 * Every colour the preview reads. They are applied as CSS custom properties on
 * the invoice root, so a template restyles the whole document without the
 * renderer knowing any hex values.
 */
export type TemplateTheme = {
  /** Page behind the invoice card. */
  background: string;
  /** Fill for the customer box, notes box and other wells. */
  surface: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  accentForeground: string;
  /** Tint behind emphasised rows (the modern variant's soft blue). */
  accentSoft: string;
  /** Corner radius of the invoice card, in pixels. */
  radius: number;
  /** Draws a rule in the accent colour across the top of the document. */
  accentBar: boolean;
  wallpaper: TemplateWallpaper;
};

/**
 * Rich-text a template pre-fills. Selecting a template seeds the invoice form
 * with these — the user still owns the result, and can edit or clear any of it.
 */
export type TemplateDefaults = {
  header: string;
  content: string;
  footer: string;
  notes?: string;
};

export type InvoiceTemplate = {
  id: string;
  name: string;
  layout: TemplateBlock[];
  theme: TemplateTheme;
  defaults: TemplateDefaults;
  /**
   * Built-in templates are defined in code and never persisted, so they are
   * always selectable even when the `templates` table is empty or a row was
   * deleted. Everything else is a saved copy belonging to the user.
   */
  builtin: boolean;
};

/**
 * What a user authors: everything except the row's id and the built-in flag.
 * `id` comes from Appwrite and `builtin` is asserted from the code-defined
 * set, so neither may be supplied by the caller.
 */
export type AuthoredTemplate = Omit<InvoiceTemplate, 'id' | 'builtin'>;

/** The app's design tokens, so a template with no overrides looks native. */
export const DEFAULT_THEME: TemplateTheme = {
  background: '#f8f8f6',
  surface: '#ffffff',
  text: '#171717',
  muted: '#737373',
  border: '#e5e5e5',
  accent: '#2563eb',
  accentForeground: '#ffffff',
  accentSoft: '#eff6ff',
  radius: 12,
  accentBar: false,
  wallpaper: { kind: 'none' },
};

export function createBlockId(): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `block-${Date.now()}-${random}`;
}

export function createBlock(
  type: BlockType,
  id: string = createBlockId(),
  align: BlockAlign = 'left',
  width: BlockWidth = 'full',
): TemplateBlock {
  return { id, type, visible: true, align, width };
}

/** The blocks actually rendered, in order. */
export function visibleBlocks(layout: readonly TemplateBlock[]): TemplateBlock[] {
  return layout.filter((block) => block.visible);
}

export function hasRequiredBlocks(layout: readonly TemplateBlock[]): boolean {
  const present = new Set(layout.filter((block) => block.visible).map((block) => block.type));
  return REQUIRED_BLOCK_TYPES.every((type) => present.has(type));
}

/** Seeds a blank template with the full default block stack. */
export function createDefaultLayout(): TemplateBlock[] {
  return [
    createBlock('letterhead', 'letterhead'),
    createBlock('richHeader', 'rich-header'),
    createBlock('customer', 'customer'),
    createBlock('items', 'items'),
    createBlock('richContent', 'rich-content'),
    // The totals column sits against the right edge of the page, as it has
    // since the first release — `align` only changes if the user moves it.
    createBlock('totals', 'totals', 'right'),
    createBlock('notes', 'notes'),
    createBlock('richFooter', 'rich-footer'),
  ];
}
