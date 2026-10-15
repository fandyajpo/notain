import { INVOICE_STATUS_LABELS, type InvoiceStatus } from '../../../core/invoice/model';
import { Badge } from './badge';

/** Badge tint per lifecycle state — shared by the read-only table cell. */
export const STATUS_BADGE_VARIANTS: Record<InvoiceStatus, 'neutral' | 'success' | 'danger'> = {
  sent: 'neutral',
  paid: 'success',
  void: 'danger',
};

/**
 * Read-only invoice status. The list deliberately shows state without a
 * control: flipping a status happens on the invoice edit page, so a stray
 * click across a row can never mutate anything.
 */
export function StatusBadge({
  status,
  size = 'sm',
}: {
  status: InvoiceStatus;
  size?: 'sm' | 'md';
}) {
  return <Badge variant={STATUS_BADGE_VARIANTS[status]} size={size}>{INVOICE_STATUS_LABELS[status]}</Badge>;
}
