import { INVOICE_LIMITS, type InvoiceItem } from '../../../core/invoice/model';
import '../../svelte/register';
import { CE_EVENTS, itemsChangeEventSchema } from '../../shared/contracts';
import { useCeProp, useCeRef } from '../../shared/use-ce-element';
import { useCeEvent } from '../../shared/use-ce-event';

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

  return <notain-items-grid ref={ref} />;
}
