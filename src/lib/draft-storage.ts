import type { InvoiceDraft } from '../core/invoice/model';
import { invoiceDraftShapeSchema } from '../core/invoice/schema';

/**
 * Draft autosave. The builder keeps a local copy of the in-progress invoice so
 * an accidental reload does not lose work.
 *
 * Drafts are scoped to the signed-in account as well as the invoice id. Query
 * keys are cleared on every account switch, but `localStorage` outlives the
 * page — without the owner in the key, one account's in-progress invoice
 * (customer name, items, prices) would be restored into another account's
 * builder on the same browser.
 *
 * An empty scope disables drafts entirely rather than falling back to a shared
 * key, so an unauthenticated caller can never read or write a scoped entry.
 */

const PREFIX = 'notain:draft:';

function scopedKey(ownerId: string, invoiceId: string | undefined): string | null {
  if (!ownerId) return null;
  return `${PREFIX}${ownerId}:${invoiceId ?? 'new'}`;
}

export function draftStorageKey(ownerId: string, invoiceId: string | undefined): string | null {
  return scopedKey(ownerId, invoiceId);
}

export function readDraft(ownerId: string, invoiceId: string | undefined): InvoiceDraft | null {
  if (typeof window === 'undefined') return null;
  const key = scopedKey(ownerId, invoiceId);
  if (!key) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    // Structural check only — see `invoiceDraftShapeSchema`. The business
    // schema would reject every work-in-progress draft, silently dropping the
    // very work autosave is there to protect.
    const result = invoiceDraftShapeSchema.safeParse(parsed);
    return result.success ? (result.data as InvoiceDraft) : null;
  } catch {
    return null;
  }
}

export function writeDraft(
  ownerId: string,
  invoiceId: string | undefined,
  draft: InvoiceDraft,
): void {
  if (typeof window === 'undefined') return;
  const key = scopedKey(ownerId, invoiceId);
  if (!key) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Quota or private-mode failures must never break the builder.
  }
}

export function clearDraft(ownerId: string, invoiceId: string | undefined): void {
  if (typeof window === 'undefined') return;
  const key = scopedKey(ownerId, invoiceId);
  if (!key) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
