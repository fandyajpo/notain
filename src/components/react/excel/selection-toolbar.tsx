import type { ReactNode } from 'react';
import { Merge } from 'lucide-react';
import { CARD_ROW } from '../ui/card';
import { Button } from '../ui/button';
import { ExportButtons } from './export-buttons';
import type { SheetRow } from '../../../core/excel';

type Props = {
  /**
   * Exact global selection size. `null` means an all-scope is still
   * resolving — the toolbar shows an ellipsis rather than a wrong number.
   */
  count: number | null;
  /** Entity noun for the count line: `pelanggan`, `invoice`, `entri`. */
  noun: string;
  /** Deselect everything — the toolbar disappears as a result. */
  onClear: () => void;
  clearDisabled?: boolean;
  /** Export of the *complete* selection (CSV / XLSX / PDF). */
  exportOptions: {
    filename: string;
    sheetName: string;
    getRows: () => SheetRow[] | Promise<SheetRow[]>;
    pdfTitle?: string;
  };
  /**
   * Customer merge — passed only by the Customer page, so the button can
   * never appear anywhere else (the brief's customer-only rule, enforced by
   * the caller's type rather than a page check scattered through the UI).
   */
  merge?: {
    onClick: () => void;
    disabled?: boolean;
    loading?: boolean;
  };
  /** Page-specific extras (the bulk delete, …). */
  actions?: ReactNode;
};

/**
 * Whether the toolbar should render for a count. `null` (an all-scope still
 * resolving) counts as visible: the selection exists, only its size is
 * pending, and hiding the bar for that half-second would make it flicker.
 */
export function hasSelection(count: number | null): boolean {
  return count === null || count > 0;
}

/**
 * The one selection action bar: count, then Merge / CSV / XLSX / PDF, then
 * the page's own actions, then the way out.
 *
 * Pages render it only when {@link hasSelection} holds, so nothing here
 * decides its own visibility — the buttons are guaranteed to act on at least
 * one record. `CARD_ROW` is the same surface the three pages used before, so
 * the bar sits in the identical slot in every layout and wraps the same way
 * on a narrow screen.
 */
export function SelectionToolbar({
  count,
  noun,
  onClear,
  clearDisabled = false,
  exportOptions,
  merge,
  actions,
}: Props) {
  return (
    <div className={CARD_ROW}>
      <p className="text-sm text-muted" aria-live="polite">
        <span className="font-medium text-foreground">{count ?? '…'}</span> {noun} dipilih
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {merge && (
          <Button
            variant="secondary"
            size="sm"
            onClick={merge.onClick}
            disabled={merge.disabled}
            loading={merge.loading}
          >
            <Merge size={15} aria-hidden="true" />
            Gabung
          </Button>
        )}
        <ExportButtons
          filename={exportOptions.filename}
          sheetName={exportOptions.sheetName}
          getRows={exportOptions.getRows}
          pdfTitle={exportOptions.pdfTitle}
        />
        {actions}
        <Button variant="ghost" size="sm" onClick={onClear} disabled={clearDisabled}>
          Batalkan pilihan
        </Button>
      </div>
    </div>
  );
}
