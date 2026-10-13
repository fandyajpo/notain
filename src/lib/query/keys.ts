/** Centralised query-key factory so invalidation stays consistent. */
export const queryKeys = {
  session: ['session'] as const,
  profile: ['profile'] as const,
  /**
   * The invoice list. `limit` is part of the key so the dashboard's small
   * "recent" page and the `/invoices` table's full page do not collide in the
   * cache — they are different queries even when the search string matches.
   */
  invoices: (search = '', limit?: number) =>
    limit === undefined ? (['invoices', search] as const) : (['invoices', search, limit] as const),
  invoice: (id: string) => ['invoice', id] as const,
  invoiceNumbers: ['invoice-numbers'] as const,
  /** Projected recent-invoice slice the picker derives its suggestions from. */
  pickerHistory: ['picker-history'] as const,
  templates: ['templates'] as const,
  template: (id: string) => ['templates', id] as const,
  customers: ['customers'] as const,
  customerCount: ['customer-count'] as const,
  customer: (id: string) => ['customers', id] as const,
};
