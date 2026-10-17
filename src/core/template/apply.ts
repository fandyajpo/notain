import { getBusinessPreset } from '../business/presets';
import type { BusinessSubtypeSlug } from '../business/taxonomy';
import type { InvoiceDraft } from '../invoice/model';
import { createItemId } from '../invoice/model';
import type { InvoiceTemplate } from './model';

/**
 * Points `draft` at `template` and fills in what the author has not written
 * yet: the rich-text sections, and — on a draft with no line items — a few
 * sample rows that read like an invoice from the template's business.
 *
 * Fills only what is still empty, so re-picking a template from inside the
 * builder never overwrites prose they already typed or items they entered.
 * The resulting `templateId` is normalised to the resolved template's id, so a
 * built-in stored as `'classic'` stays `'classic'` and a saved row keeps its
 * row id.
 *
 * `fallbackBusinessType` is the viewer's own type: it picks the sample items
 * when the template itself carries no type (every builtin, and every template
 * saved before types existed), so an account that chose a business still gets
 * sample rows in its own trade rather than the generic ones.
 */
export function applyTemplateDefaults(
  draft: InvoiceDraft,
  template: InvoiceTemplate,
  fallbackBusinessType: BusinessSubtypeSlug | null = null,
): InvoiceDraft {
  const preset = getBusinessPreset(template.businessType ?? fallbackBusinessType);
  const items =
    draft.items.length === 0
      ? preset.sampleItems.map((sample) => ({ id: createItemId(), ...sample }))
      : draft.items;

  return {
    ...draft,
    templateId: template.id,
    items,
    sections: {
      header: draft.sections.header || template.defaults.header,
      content: draft.sections.content || template.defaults.content,
      footer: draft.sections.footer || template.defaults.footer,
    },
    notes: draft.notes || template.defaults.notes,
  };
}
