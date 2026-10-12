/** Centralised query-key factory so invalidation stays consistent. */
export const queryKeys = {
  session: ['session'] as const,
  profile: ['profile'] as const,
  invoices: (search = '') => ['invoices', search] as const,
  invoice: (id: string) => ['invoice', id] as const,
  invoiceNumbers: ['invoice-numbers'] as const,
  templates: ['templates'] as const,
  template: (id: string) => ['templates', id] as const,
  customers: ['customers'] as const,
  customer: (id: string) => ['customers', id] as const,
};
