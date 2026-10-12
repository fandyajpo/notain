import {
  DEFAULT_THEME,
  createDefaultLayout,
  type InvoiceTemplate,
  type TemplateBlock,
  type TemplateTheme,
} from './model';

const EMPTY_DEFAULTS = { header: '', content: '', footer: '' };

function cloneLayout(): TemplateBlock[] {
  return createDefaultLayout().map((block) => ({ ...block }));
}

function cloneTheme(overrides: Partial<TemplateTheme>): TemplateTheme {
  return { ...DEFAULT_THEME, ...overrides, wallpaper: { ...DEFAULT_THEME.wallpaper } };
}

export const BUILTIN_TEMPLATE_IDS = ['classic', 'minimal', 'modern'] as const;
export type BuiltinTemplateId = (typeof BUILTIN_TEMPLATE_IDS)[number];

/**
 * The three templates every account starts with. They live in code, not in the
 * `templates` table, so they render even before the user has saved anything and
 * stay available as a fallback when a saved template is deleted underneath an
 * invoice that still references it.
 */
export const BUILTIN_TEMPLATES: readonly InvoiceTemplate[] = [
  {
    id: 'classic',
    name: 'Klasik',
    layout: cloneLayout(),
    theme: cloneTheme({}),
    defaults: { ...EMPTY_DEFAULTS },
    builtin: true,
  },
  {
    id: 'minimal',
    name: 'Minimal',
    layout: cloneLayout(),
    theme: cloneTheme({
      accent: '#171717',
      accentSoft: '#f5f5f5',
      radius: 6,
    }),
    defaults: { ...EMPTY_DEFAULTS },
    builtin: true,
  },
  {
    id: 'modern',
    name: 'Modern',
    layout: cloneLayout(),
    theme: cloneTheme({
      radius: 4,
      accentBar: true,
    }),
    defaults: { ...EMPTY_DEFAULTS },
    builtin: true,
  },
];

export function isBuiltinTemplateId(id: string): id is BuiltinTemplateId {
  return (BUILTIN_TEMPLATE_IDS as readonly string[]).includes(id);
}

export function getBuiltinTemplate(id: string): InvoiceTemplate | undefined {
  return BUILTIN_TEMPLATES.find((template) => template.id === id);
}

/** Builtin to hand out when nothing else resolves — the safest default. */
export const FALLBACK_TEMPLATE = BUILTIN_TEMPLATES[0];
