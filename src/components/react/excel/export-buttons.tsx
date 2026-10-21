import { FileDown, FileSpreadsheet } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../ui/button';
import { downloadCsv, downloadXlsx } from '../../../lib/excel';
import { toAppError } from '../../../app/errors';
import { toast } from '../../../lib/ui/toast';
import type { SheetRow } from '../../../core/excel';

type Props = {
  /** Base filename, without extension — both formats append their own. */
  filename: string;
  /** Sheet tab name for the `.xlsx` workbook. */
  sheetName: string;
  /**
   * Produces the sheet rows at the moment a format is chosen. Kept as a getter
   * (not a precomputed value) so a paginated source like invoices can fetch
   * every page on demand rather than shipping the whole set up front.
   */
  getRows: () => SheetRow[] | Promise<SheetRow[]>;
  /** Hold the buttons while the underlying data is still loading. */
  disabled?: boolean;
};

/**
 * Paired CSV / XLSX download buttons. SheetJS is pulled in only when XLSX is
 * actually chosen (see `lib/excel`), so the CSV path stays dependency-free and
 * neither format lands in the initial bundle.
 */
export function ExportButtons({ filename, sheetName, getRows, disabled = false }: Props) {
  const [busy, setBusy] = useState<'csv' | 'xlsx' | null>(null);

  async function handleExport(format: 'csv' | 'xlsx') {
    setBusy(format);
    try {
      const rows = await getRows();
      if (rows.length === 0) {
        toast('Belum ada data untuk diekspor.', { variant: 'info' });
        return;
      }
      if (format === 'csv') {
        downloadCsv(filename, rows);
      } else {
        await downloadXlsx(filename, sheetName, rows);
      }
    } catch (error) {
      toast(toAppError(error).message, { variant: 'error' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => void handleExport('csv')}
        loading={busy === 'csv'}
        disabled={disabled}
      >
        <FileDown size={15} aria-hidden="true" />
        CSV
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => void handleExport('xlsx')}
        loading={busy === 'xlsx'}
        disabled={disabled}
      >
        <FileSpreadsheet size={15} aria-hidden="true" />
        XLSX
      </Button>
    </div>
  );
}
