import {
  INVOICE_STATUSES,
  INVOICE_STATUS_LABELS,
  type InvoiceStatus,
} from '../../../core/invoice/model';
import { badgeClass } from './badge';
import { Select } from './select';

const VARIANTS: Record<InvoiceStatus, 'neutral' | 'success' | 'danger'> = {
  sent: 'neutral',
  paid: 'success',
  void: 'danger',
};

type Props = {
  value: InvoiceStatus;
  onChange: (status: InvoiceStatus) => void;
  disabled?: boolean;
  /** Accessible name — the invoice number, e.g. "INV-2026-001". */
  label: string;
};

/**
 * Flipping an invoice's status, as a badge-shaped dropdown.
 *
 * It rides the shared custom `Select` (so the open menu is themed like the rest
 * of the app, unlike a native `<select>`) but passes `bare` so the trigger keeps
 * the pill look from `badgeClass` instead of the standard field surface. Callers
 * own the persistence (the table and the builder wire it to
 * `useUpdateInvoiceStatus`).
 */
export function StatusSelect({ value, onChange, disabled, label }: Props) {
  return (
    <Select
      value={value}
      bare
      disabled={disabled}
      aria-label={`Status ${label}`}
      options={INVOICE_STATUSES.map((status) => ({
        value: status,
        label: INVOICE_STATUS_LABELS[status],
      }))}
      onChange={(next) => onChange(next as InvoiceStatus)}
      triggerClassName={`${badgeClass(VARIANTS[value], 'sm')} cursor-pointer pr-6 pl-2 disabled:cursor-wait`}
    />
  );
}
