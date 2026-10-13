import { R2AssetRepository } from './r2-asset-repository';
import { AppwriteAuthRepository } from './appwrite-auth-repository';
import { AppwriteCustomerRepository } from './appwrite-customer-repository';
import { AppwriteInvoiceRepository } from './appwrite-invoice-repository';
import { AppwriteProfileRepository } from './appwrite-profile-repository';
import { AppwriteTemplateRepository } from './appwrite-template-repository';
import type { AssetRepository } from '../ports/asset-repository';
import type { AuthRepository } from '../ports/auth-repository';
import type { CustomerRepository } from '../ports/customer-repository';
import type { InvoiceRepository } from '../ports/invoice-repository';
import type { ProfileRepository } from '../ports/profile-repository';
import type { TemplateRepository } from '../ports/template-repository';

/**
 * Composition root. Application services depend on the ports; this module is
 * the only place that knows which concrete implementations are wired up.
 */
export const container = {
  auth: new AppwriteAuthRepository(),
  invoices: new AppwriteInvoiceRepository(),
  profiles: new AppwriteProfileRepository(),
  templates: new AppwriteTemplateRepository(),
  customers: new AppwriteCustomerRepository(),
  assets: new R2AssetRepository(),
} satisfies {
  auth: AuthRepository;
  invoices: InvoiceRepository;
  profiles: ProfileRepository;
  templates: TemplateRepository;
  customers: CustomerRepository;
  assets: AssetRepository;
};

export type Container = typeof container;
