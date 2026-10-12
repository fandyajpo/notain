import type { InvoiceDraft } from '../invoice/model';
import type { InvoiceTemplate } from './model';

/**
 * Points `draft` at `template` and fills in the rich-text sections the author
 * has not written yet.
 *
 * Fills only what is still empty, so re-picking a template from inside the
 * builder never overwrites prose they already typed. The resulting
 * `templateId` is normalised to the resolved template's id, so a built-in
 * stored as `'classic'` stays `'classic'` and a saved row keeps its row id.
 */
export function applyTemplateDefaults(
  draft: InvoiceDraft,
  template: InvoiceTemplate,
): InvoiceDraft {
  return {
    ...draft,
    templateId: template.id,
    sections: {
      header: draft.sections.header || template.defaults.header,
      content: draft.sections.content || template.defaults.content,
      footer: draft.sections.footer || template.defaults.footer,
    },
    notes: draft.notes || template.defaults.notes,
  };
}
