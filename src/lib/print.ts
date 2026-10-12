import type { InvoiceDraft } from '../core/invoice/model';
import { invoiceDraftShapeSchema } from '../core/invoice/schema';

/** Where the print view lives. */
export const PRINT_PATH = '/invoice/print';

/** `sessionStorage` key carrying the invoice handed to the print view. */
const PAYLOAD_KEY = 'notain:print';

/**
 * Sends the current draft to the print view in a new tab.
 *
 * The draft travels through `sessionStorage` rather than the query string:
 * three rich-text zones plus a hundred line items will not fit in a URL, and
 * the print view has to show the invoice exactly as the builder does — unsaved
 * edits included. Browsers clone `sessionStorage` into a new same-origin tab
 * opened with `window.open`, so the payload is already waiting when it loads.
 *
 * Returns whether a new tab was opened. A blocked popup falls back to the
 * current tab, which reads the same storage, so the invoice still prints.
 */
export function openPrintView(invoice: InvoiceDraft): boolean {
  try {
    sessionStorage.setItem(PAYLOAD_KEY, JSON.stringify(invoice));
  } catch {
    // Storage can be unavailable (private mode, quota). The print view reads
    // the payload itself and reports the problem rather than printing blanks.
  }

  // No `noopener`: the handle is how a blocked popup is detected, and this
  // only ever opens our own origin.
  const opened = window.open(`${PRINT_PATH}?auto=1`, '_blank');
  if (opened) {
    opened.focus();
    return true;
  }

  window.location.assign(PRINT_PATH);
  return false;
}

/** The invoice the print view should render, or `null` when there is none. */
export function readPrintPayload(): InvoiceDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PAYLOAD_KEY);
    if (!raw) return null;
    // Structural check only — the same reasoning as `invoiceDraftShapeSchema`
    // for autosaved drafts: a work-in-progress invoice must survive.
    const result = invoiceDraftShapeSchema.safeParse(JSON.parse(raw));
    return result.success ? (result.data as InvoiceDraft) : null;
  } catch {
    return null;
  }
}
