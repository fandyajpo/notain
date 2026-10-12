import type { InvoiceTotals } from '../../../core/invoice/calculator';
import '../../solid/register';
import { useCeProp, useCeRef } from '../../shared/use-ce-element';

type Props = {
  totals: InvoiceTotals;
};

/**
 * React side of the read-only Solid totals inspector. It renders what
 * `core/invoice/calculator` produced and never does arithmetic of its own, so
 * the numbers cannot drift from the form.
 */
export function CalcInspector({ totals }: Props) {
  const [ref, element] = useCeRef();
  useCeProp(element, 'totals', totals);
  return <notain-calc-inspector ref={ref} />;
}
