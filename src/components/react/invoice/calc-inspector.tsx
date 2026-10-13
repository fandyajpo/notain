import type { InvoiceTotals } from '../../../core/invoice/calculator';
import { useCeDefined, useCeProp, useCeRef } from '../../shared/use-ce-element';

/** Module scope keeps the effect from re-subscribing on every render. */
const loadSolidRegister = () => import('../../solid/register');

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

  const registered = useCeDefined('notain-calc-inspector', loadSolidRegister);
  if (!registered) {
    return (
      <div
        aria-busy="true"
        aria-label="Memuat rincian total"
        className="min-h-28 rounded-card border border-border bg-card/40"
      />
    );
  }

  return <notain-calc-inspector ref={ref} />;
}
