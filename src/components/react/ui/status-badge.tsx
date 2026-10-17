import { invoiceStatusLabel, type InvoiceStatus } from '../../../core/invoice/model';
import { Badge } from './badge';

/** Badge tint per lifecycle state — shared by the read-only table cell. */
export const STATUS_BADGE_VARIANTS: Record<InvoiceStatus, 'neutral' | 'success' | 'danger'> = {
  sent: 'neutral',
  paid: 'success',
  void: 'danger',
};

/** Tint for the unset status: plain neutral, nothing implied yet. */
export function statusVariant(status: InvoiceStatus | null): 'neutral' | 'success' | 'danger' {
  return status === null ? 'neutral' : STATUS_BADGE_VARIANTS[status];
}

/**
 * Read-only invoice status. The list deliberately shows state without a
 * control: flipping a status happens on the invoice edit page, so a stray
 * click across a row can never mutate anything.
 *
 * `null` — an invoice not sent yet — renders as the neutral "Belum dikirim".
 */
export function StatusBadge({
  status,
  size = 'sm',
}: {
  status: InvoiceStatus | null;
  size?: 'sm' | 'md';
}) {
  return (
    <Badge variant={statusVariant(status)} size={size}>
      {invoiceStatusLabel(status)}
    </Badge>
  );
}
