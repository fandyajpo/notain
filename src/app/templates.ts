import { ID } from 'appwrite';
import type { AuthoredTemplate, InvoiceTemplate } from '../core/template/model';
import { invoiceTemplateSchema } from '../core/template/schema';
import { AppError, ERROR_CODES, flattenIssues } from '../core/shared/errors';
import { container } from '../infra/container';
import { requireSession } from './session';

/** Validates a template and returns the normalized value, or throws a field-mapped error. */
function parseTemplate(template: AuthoredTemplate): AuthoredTemplate {
  const result = invoiceTemplateSchema.safeParse(template);
  if (!result.success) {
    throw new AppError(ERROR_CODES.VALIDATION, 'Periksa kembali pengaturan template kamu.', {
      fieldErrors: flattenIssues(result.error.issues),
    });
  }
  return result.data;
}

/**
 * Saved templates for the signed-in user, sorted by name.
 *
 * Built-ins are deliberately not mixed in here — `listSelectableTemplates`
 * adds them, so a caller that only wants the user's own copies is not handed
 * three rows it cannot delete.
 */
export async function listTemplates(): Promise<InvoiceTemplate[]> {
  const user = await requireSession();
  return container.templates.listByOwner(user.id);
}

export async function getTemplate(id: string): Promise<InvoiceTemplate> {
  await requireSession();
  const template = await container.templates.getById(id);
  if (!template) {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'Template tidak ditemukan.');
  }
  return template;
}

export async function createTemplate(input: AuthoredTemplate): Promise<InvoiceTemplate> {
  const user = await requireSession();
  return container.templates.create({
    id: ID.unique(),
    ownerId: user.id,
    template: parseTemplate(input),
  });
}

export async function updateTemplate(
  id: string,
  input: AuthoredTemplate,
): Promise<InvoiceTemplate> {
  await requireSession();
  return container.templates.update({ id, template: parseTemplate(input) });
}

export async function deleteTemplate(id: string): Promise<void> {
  await requireSession();
  await container.templates.remove(id);
}
