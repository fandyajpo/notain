import { useMemo } from 'react';
import { useInvoices } from '../../../lib/query/hooks/use-invoices';
import { useCustomers } from '../../../lib/query/hooks/use-customers';
import { derivePickerOptions, mergeCustomerOptions } from '../../shared/picker-options';
import { CE_EVENTS, pickEventSchema, type PickPayload } from '../../shared/contracts';
import { useCeDefined, useCeProp, useCeRef } from '../../shared/use-ce-element';
import { useCeEvent } from '../../shared/use-ce-event';

/** Module scope keeps the effect from re-subscribing on every render. */
const loadVueRegister = () => import('../../vue/register');

type Props = {
  /** `customer` fills name + phone; `product` appends a row to the items grid. */
  mode: 'customer' | 'product';
  label: string;
  placeholder?: string;
  onPick: (pick: PickPayload) => void;
};

/**
 * React side of the Vue picker.
 *
 * Customers come from the `customers` directory, which is written to every
 * time an invoice is saved. History still contributes: an account that predates
 * the directory would otherwise show an empty picker, so anything that appears
 * in an invoice but was never filed is offered after the saved rows.
 * Products have no directory of their own and stay derived from history.
 */
export function Picker({ mode, label, placeholder, onPick }: Props) {
  // Suggestions are capped at the 20 most recent anyway, so the loaded pages
  // are plenty — the picker never needs to page through the whole history.
  const history = useInvoices('');
  const invoices = useMemo(
    () => history.data?.pages.flatMap((page) => page.items) ?? [],
    [history.data],
  );
  const derived = useMemo(() => derivePickerOptions(invoices), [invoices]);
  const saved = useCustomers();
  const options = useMemo(
    () => ({
      ...derived,
      customers:
        mode === 'customer'
          ? mergeCustomerOptions(saved.data ?? [], derived.customers)
          : derived.customers,
    }),
    [derived, mode, saved.data],
  );

  const [ref, element] = useCeRef();
  useCeProp(element, 'mode', mode);
  useCeProp(element, 'label', label);
  useCeProp(element, 'customers', options.customers);
  useCeProp(element, 'products', options.products);
  useCeProp(element, 'placeholder', placeholder);

  useCeEvent(element, CE_EVENTS.pick, pickEventSchema, onPick);

  const registered = useCeDefined('notain-picker', loadVueRegister);
  if (!registered) {
    return (
      <div
        aria-busy="true"
        aria-label={label}
        className="h-10 rounded-control border border-border bg-card/40"
      />
    );
  }

  return <notain-picker ref={ref} />;
}
