import { INVOICE_STATUS_LABELS, type InvoiceStatus } from './model';

/**
 * The invoice lifecycle as a forward-only chain:
 *
 *   (belum ada status) → Terkirim → Lunas | Batal → status akhir
 *
 * Every rule in the app — the builder's select, the update API, anything
 * built later — reads from here, so the flow cannot drift between layers.
 * There is no path backwards: `Lunas` and `Batal` are terminal, and a status
 * can never be cleared once set.
 */
const NEXT: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  sent: ['paid', 'void'],
  paid: [],
  void: [],
};

/** The forward options from a status; a fresh invoice starts unset (`null`). */
export function nextStatuses(from: InvoiceStatus | null): readonly InvoiceStatus[] {
  if (from === null) return ['sent'];
  return NEXT[from];
}

/**
 * Whether the lifecycle may move `from → to`.
 *
 * A re-pick of the current status is a harmless no-op (idempotent writes are
 * allowed); everything else must be a forward step, and clearing a status
 * back to "unset" is never allowed.
 */
export function canChangeStatus(from: InvoiceStatus | null, to: InvoiceStatus | null): boolean {
  if (from === to) return true;
  if (to === null) return false;
  return nextStatuses(from).includes(to);
}

/** User-facing reason a transition was refused, in Indonesian. */
export function statusFlowMessage(from: InvoiceStatus | null, to: InvoiceStatus | null): string {
  if (to === null) return 'Status yang sudah diatur tidak bisa dikosongkan kembali.';
  if (from === 'paid' || from === 'void') {
    return `Status ${INVOICE_STATUS_LABELS[from]} adalah status akhir dan tidak bisa diubah lagi.`;
  }
  const allowed = nextStatuses(from)
    .map((status) => INVOICE_STATUS_LABELS[status])
    .join(' atau ');
  return `Setelah ${from === null ? 'invoice dibuat' : INVOICE_STATUS_LABELS[from]}, status hanya bisa menjadi ${allowed}.`;
}
