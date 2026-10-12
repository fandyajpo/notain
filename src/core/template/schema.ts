import { z } from 'zod';
import {
  BLOCK_ALIGNS,
  BLOCK_TYPES,
  BLOCK_WIDTHS,
  DEFAULT_THEME,
  REQUIRED_BLOCK_TYPES,
  TEMPLATE_LIMITS,
} from './model';

/** `#rrggbb`. Hex only — the preview hands these straight to CSS. */
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Masukkan warna hex yang valid.');

export const templateBlockSchema = z.object({
  id: z.string().min(1, 'Blok tidak valid.').max(64, 'Blok tidak valid.'),
  type: z.enum(BLOCK_TYPES),
  visible: z.boolean(),
  align: z.enum(BLOCK_ALIGNS),
  // Written before the field existed, so a stored layout without one is a
  // full-width block rather than a validation failure. `.catch` (not
  // `.default`) keeps the *input* type non-optional, which the form validates
  // against `TemplateBlock`.
  width: z.enum(BLOCK_WIDTHS).catch('full'),
});

export const templateWallpaperSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('solid'), color: hexColor }),
  z.object({
    kind: z.literal('gradient'),
    from: hexColor,
    to: hexColor,
    angle: z.number().min(0).max(360),
  }),
]);

export const templateThemeSchema = z.object({
  background: hexColor,
  surface: hexColor,
  text: hexColor,
  muted: hexColor,
  border: hexColor,
  accent: hexColor,
  accentForeground: hexColor,
  accentSoft: hexColor,
  radius: z.number().min(0, 'Radius tidak valid.').max(32, 'Radius tidak valid.'),
  accentBar: z.boolean(),
  wallpaper: templateWallpaperSchema,
});

export const templateDefaultsSchema = z.object({
  header: z.string().max(TEMPLATE_LIMITS.richText, 'Bagian atas terlalu panjang.'),
  content: z.string().max(TEMPLATE_LIMITS.richText, 'Bagian isi terlalu panjang.'),
  footer: z.string().max(TEMPLATE_LIMITS.richText, 'Bagian bawah terlalu panjang.'),
  notes: z
    .string()
    .max(TEMPLATE_LIMITS.notes, 'Catatan terlalu panjang.')
    .optional()
    .transform((value) => value || undefined),
});

/**
 * Business rules a template must satisfy before it can be saved or applied.
 * `id` and `builtin` are metadata owned by the row and the code respectively,
 * so they are deliberately not part of this schema.
 */
export const invoiceTemplateSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Masukkan nama template.')
      .max(TEMPLATE_LIMITS.name, 'Nama template terlalu panjang.'),
    layout: z
      .array(templateBlockSchema)
      .min(1, 'Template minimal punya satu blok.')
      .max(TEMPLATE_LIMITS.maxBlocks, 'Terlalu banyak blok dalam template.'),
    theme: templateThemeSchema,
    defaults: templateDefaultsSchema,
  })
  .superRefine((template, ctx) => {
    const seen = new Set<string>();
    template.layout.forEach((block, index) => {
      if (seen.has(block.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['layout', index, 'id'],
          message: 'ID blok duplikat.',
        });
      }
      seen.add(block.id);
    });

    const present = new Set(
      template.layout.filter((block) => block.visible).map((block) => block.type),
    );
    if (!REQUIRED_BLOCK_TYPES.every((type) => present.has(type))) {
      ctx.addIssue({
        code: 'custom',
        path: ['layout'],
        message: 'Template harus tetap memuat blok kop, daftar barang, dan total.',
      });
    }
  });

export type InvoiceTemplateInput = z.infer<typeof invoiceTemplateSchema>;

/**
 * Structural schema for a template read back from storage.
 *
 * Same split as the invoice pair: this one checks types and sane bounds only,
 * and every field degrades rather than throwing, because a single corrupt
 * column should cost the user one theme override — not the whole template.
 * A layout that collapses to nothing is caught by the mapper, which falls back
 * to a built-in instead of rendering a blank invoice.
 */
export const templateBlockShapeSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(BLOCK_TYPES),
  visible: z.boolean().catch(true),
  align: z.enum(BLOCK_ALIGNS).catch('left'),
  width: z.enum(BLOCK_WIDTHS).catch('full'),
});

export const invoiceTemplateShapeSchema = z.object({
  name: z.string().max(TEMPLATE_LIMITS.name).catch('Template'),
  layout: z.array(templateBlockShapeSchema).max(TEMPLATE_LIMITS.maxBlocks).catch([]),
  theme: templateThemeSchema.catch(DEFAULT_THEME),
  defaults: templateDefaultsSchema.catch({ header: '', content: '', footer: '', notes: undefined }),
});

export type InvoiceTemplateShapeInput = z.infer<typeof invoiceTemplateShapeSchema>;
