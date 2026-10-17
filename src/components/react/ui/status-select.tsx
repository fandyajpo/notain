import {
  INVOICE_STATUS_LABELS,
  UNSET_STATUS_LABEL,
  type InvoiceStatus,
} from '../../../core/invoice/model';
import { nextStatuses } from '../../../core/invoice/status';
import { badgeClass } from './badge';
import { statusVariant } from './status-badge';
import { Select } from './select';

type Props = {
  value: InvoiceStatus | null;
  onChange: (status: InvoiceStatus) => void;
  disabled?: boolean;
  /** Accessible name — the invoice number, e.g. "INV-2026-001". */
  label: string;
  /**
   * Pill size. `sm` for dense table rows; `lg` for the invoice builder
   * header, where the status is a primary control and needs to read at a glance.
   */
  size?: 'sm' | 'lg';
};

/**
 * Flipping an invoice's status, as a badge-shaped dropdown.
 *
 * The menu only offers forward steps of the lifecycle (see
 * `core/invoice/status.ts`): an unset invoice can become Terkirim, a sent one
 * Lunas or Batal, and a terminal one is disabled outright. An unset status
 * shows as "Belum dikirim"; `null` is never an option the menu can pick — it
 * is where a fresh invoice already is, and cannot be returned to.
 *
 * It rides the shared custom `Select` (so the open menu is themed like the rest
 * of the app, unlike a native `<select>`) but passes `bare` so the trigger keeps
 * the pill look from `badgeClass` instead of the standard field surface. Callers
 * own the persistence (the table and the builder wire it to
 * `useUpdateInvoiceStatus`).
 */
export function StatusSelect({ value, onChange, disabled, label, size = 'sm' }: Props) {
  const padding = size === 'lg' ? 'pr-7 pl-2.5' : 'pr-6 pl-2';
  const forward = nextStatuses(value);
  const options =
    value === null
      ? [{ value: 'sent', label: INVOICE_STATUS_LABELS.sent }]
      : [
          { value, label: INVOICE_STATUS_LABELS[value] },
          ...forward.map((status) => ({
            value: status,
            label: INVOICE_STATUS_LABELS[status],
          })),
        ];
  // Terminal states have nowhere to go — grey out instead of offering a menu
  // whose every pick would be refused server-side.
  const locked = value !== null && forward.length === 0;
  return (
    <Select
      value={value ?? ''}
      bare
      disabled={disabled || locked}
      aria-label={`Status ${label}`}
      options={options}
      onChange={(next) => onChange(next as InvoiceStatus)}
      triggerClassName={`${badgeClass(statusVariant(value), size)} cursor-pointer ${padding} disabled:cursor-wait`}
      placeholder={value === null ? UNSET_STATUS_LABEL : undefined}
    />
  );
}
