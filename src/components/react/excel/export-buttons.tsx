import { FileDown, FileImage, FileSpreadsheet } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../ui/button';
import { downloadCsv, downloadXlsx } from '../../../lib/excel';
import { downloadPdf } from '../../../lib/pdf';
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
  /**
   * Document heading printed on the PDF — the sheet name suits a workbook
   * tab, but a PDF page wants a real title.
   */
  pdfTitle?: string;
};

/**
 * The CSV / XLSX / PDF download buttons. SheetJS is pulled in only when XLSX
 * is chosen and jsPDF only when PDF is chosen (see `lib/excel` / `lib/pdf`),
 * so the CSV path stays dependency-free and neither library lands in the
 * initial bundle.
 *
 * One `busy` flag across all three doubles as the duplicate-request guard:
 * the active button spins while the others stay disabled.
 */
export function ExportButtons({ filename, sheetName, getRows, disabled = false, pdfTitle }: Props) {
  const [busy, setBusy] = useState<'csv' | 'xlsx' | 'pdf' | null>(null);

  async function handleExport(format: 'csv' | 'xlsx' | 'pdf') {
    if (busy) return;
    setBusy(format);
    try {
      const rows = await getRows();
      if (rows.length === 0) {
        toast('Belum ada data untuk diekspor.', { variant: 'info' });
        return;
      }
      if (format === 'csv') {
        downloadCsv(filename, rows);
      } else if (format === 'xlsx') {
        await downloadXlsx(filename, sheetName, rows);
      } else {
        await downloadPdf(filename, pdfTitle ?? sheetName, rows);
      }
    } catch (error) {
      toast(toAppError(error).message, { variant: 'error' });
    } finally {
      setBusy(null);
    }
  }

  const pending = busy !== null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => void handleExport('csv')}
        loading={busy === 'csv'}
        disabled={disabled || pending}
      >
        <FileDown size={15} aria-hidden="true" />
        CSV
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => void handleExport('xlsx')}
        loading={busy === 'xlsx'}
        disabled={disabled || pending}
      >
        <FileSpreadsheet size={15} aria-hidden="true" />
        XLSX
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => void handleExport('pdf')}
        loading={busy === 'pdf'}
        disabled={disabled || pending}
      >
        <FileImage size={15} aria-hidden="true" />
        PDF
      </Button>
    </div>
  );
}
