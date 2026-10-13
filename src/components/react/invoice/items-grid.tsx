import { INVOICE_LIMITS, type InvoiceItem } from '../../../core/invoice/model';
import { CE_EVENTS, itemsChangeEventSchema } from '../../shared/contracts';
import { useCeDefined, useCeProp, useCeRef } from '../../shared/use-ce-element';
import { useCeEvent } from '../../shared/use-ce-event';

/** Module scope keeps the effect from re-subscribing on every render. */
const loadSvelteRegister = () => import('../../svelte/register');

type Props = {
  items: InvoiceItem[];
  onChange: (items: InvoiceItem[]) => void;
  errors?: Record<string, string> | undefined;
};

/**
 * React side of the Svelte item grid. The grid is fully controlled: React
 * owns the TanStack Form, the island only mirrors `items` and reports the
 * whole list back through a validated `itemschange` event.
 */
export function ItemsGrid({ items, onChange, errors }: Props) {
  const [ref, element] = useCeRef();

  useCeProp(element, 'items', items);
  useCeProp(element, 'maxItems', INVOICE_LIMITS.maxItems);
  useCeProp(element, 'errorMessage', errors?.items ?? '');

  useCeEvent(element, CE_EVENTS.itemsChange, itemsChangeEventSchema, (payload) =>
    onChange(payload.items),
  );

  const registered = useCeDefined('notain-items-grid', loadSvelteRegister);
  if (!registered) {
    return (
      <div
        aria-busy="true"
        aria-label="Memuat tabel barang"
        className="min-h-40 rounded-card border border-border bg-card/40"
      />
    );
  }

  return <notain-items-grid ref={ref} />;
}
