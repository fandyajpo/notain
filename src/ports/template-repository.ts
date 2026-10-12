import type { AuthoredTemplate, InvoiceTemplate } from '../core/template/model';

/**
 * Persistence port for a user's saved invoice templates.
 *
 * The three built-ins are never written to storage — they live in code so
 * every account has something to pick before it has saved anything, and so a
 * deleted row can never leave an invoice with no template at all.
 */
export interface TemplateRepository {
  listByOwner(ownerId: string): Promise<InvoiceTemplate[]>;
  getById(id: string): Promise<InvoiceTemplate | null>;
  create(input: {
    id: string;
    ownerId: string;
    template: AuthoredTemplate;
  }): Promise<InvoiceTemplate>;
  update(input: { id: string; template: AuthoredTemplate }): Promise<InvoiceTemplate>;
  remove(id: string): Promise<void>;
}
