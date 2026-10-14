import '../../core/zod-csp';
import { z } from 'zod';

/**
 * Contracts shared by the framework islands in the invoice builder.
 *
 * The React app owns the TanStack Form; the Svelte grid, Vue picker and Solid
 * inspector are custom elements that communicate through DOM CustomEvents.
 * Everything that crosses that boundary is validated here first.
 *
 * Payload rules:
 * - Structural only. Shapes, types and non-corrupt values — never business
 *   rules. Empty names, empty phone numbers and other intermediate typing
 *   states are legal; `invoiceDraftSchema` enforces the real rules at submit.
 * - Schemas are module-level constants so listeners can depend on them
 *   safely.
 */

/** Custom event names emitted by the non-React islands. */
export const CE_EVENTS = {
  /** Svelte grid → React: the full item list after any edit/add/remove/reorder. */
  itemsChange: 'itemschange',
  /** Vue picker → React: a customer or product was picked from history. */
  pick: 'pick',
} as const;

/** Whole numbers only; `z.int()` also rejects non-finite values. */
const structuralCount = z.int().min(0);
const structuralQuantity = z.int().min(1);

/** One row as it travels out of the item grid. `name` may still be empty. */
export const gridItemSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  quantity: structuralQuantity,
  unitPrice: structuralCount,
});

/** Emitted as `itemschange` with `{ items: InvoiceItem[] }`. */
export const itemsChangeEventSchema = z.object({
  items: z.array(gridItemSchema),
});

export type ItemsChangePayload = z.infer<typeof itemsChangeEventSchema>;

/**
 * Emitted as `pick`. Discriminated on `kind` so the React side can tell a
 * customer fill (name + phone) from a product append (name + qty + price).
 */
export const pickEventSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('customer'),
    name: z.string(),
    phone: z.string(),
  }),
  z.object({
    kind: z.literal('product'),
    name: z.string(),
    quantity: structuralQuantity,
    unitPrice: structuralCount,
  }),
]);

export type PickPayload = z.infer<typeof pickEventSchema>;

/**
 * Validates an incoming CustomEvent detail.
 *
 * Returns the parsed payload, or `null` when it does not match the contract
 * (logged in dev so a broken island shows up immediately instead of silently
 * corrupting the form).
 */
export function parseEvent<S extends z.ZodType>(
  schema: S,
  detail: unknown,
  label?: string,
): z.output<S> | null {
  const result = schema.safeParse(detail);
  if (result.success) return result.data;

  const env = (import.meta as { env?: { DEV?: boolean } }).env;
  if (env?.DEV) {
    console.warn(`[notain] dropped malformed "${label ?? 'custom event'}" payload`, result.error);
  }
  return null;
}
