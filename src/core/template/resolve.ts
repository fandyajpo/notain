import type { InvoiceTemplate } from './model';
import { hasRequiredBlocks } from './model';
import { BUILTIN_TEMPLATES, FALLBACK_TEMPLATE, getBuiltinTemplate } from './builtins';
import type { BusinessSubtypeSlug } from '../business/taxonomy';

/**
 * Resolves the template an invoice should render with.
 *
 * An invoice stores only a `templateId`, so this lookup has to survive three
 * kinds of decay: the id pointing at a saved template that has since been
 * edited (render it as it is now — the point of referencing instead of
 * snapshotting), the id pointing at something that no longer exists, and the
 * row having rotted into a layout that dropped its item table or its totals.
 * The last two fall back to a builtin rather than render a blank page.
 */
export function resolveTemplate(
  id: string | null | undefined,
  saved: readonly InvoiceTemplate[] = [],
): InvoiceTemplate {
  if (id) {
    const match = saved.find((template) => template.id === id);
    if (match && hasRequiredBlocks(match.layout)) return match;

    const builtin = getBuiltinTemplate(id);
    if (builtin) return builtin;
  }

  return FALLBACK_TEMPLATE;
}

/**
 * Everything the picker offers: the builtins first, then the saved copies that
 * are still usable. A row whose layout rotted is hidden rather than offered,
 * because picking it would produce an invoice with no line items.
 */
export function listSelectableTemplates(saved: readonly InvoiceTemplate[]): InvoiceTemplate[] {
  return [...BUILTIN_TEMPLATES, ...saved.filter((template) => hasRequiredBlocks(template.layout))];
}

/**
 * Splits the picker's list into templates authored for the viewer's business
 * type and everything else. Grouping must never *hide*: a builtin (always
 * `businessType: null`) or a template for another trade stays one section away,
 * and with no chosen type the caller gets the list back untouched as `others`.
 */
export function groupTemplatesForBusiness(
  templates: readonly InvoiceTemplate[],
  businessType: BusinessSubtypeSlug | null | undefined,
): { matching: readonly InvoiceTemplate[]; others: readonly InvoiceTemplate[] } {
  if (!businessType) return { matching: [], others: templates };
  return {
    matching: templates.filter((template) => template.businessType === businessType),
    others: templates.filter((template) => template.businessType !== businessType),
  };
}
