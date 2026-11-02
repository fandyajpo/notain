import type { SheetRow } from '../core/excel';

/**
 * `.pdf` export for the selection toolbars.
 *
 * Same discipline as `lib/excel`: both libraries are pulled in with a dynamic
 * `import()` the moment a PDF is actually requested, so neither SheetJS nor
 * jsPDF lands in a page's initial payload — the toolbar ships as a few KB and
 * the ~350 KB generator only arrives on the click that needs it.
 *
 * The sheet format the CSV/XLSX path already produces (a header row, then one
 * row per record) is what this renders, so all three formats export byte-for-
 * byte the same selection without a per-entity PDF mapper.
 */

type PdfRuntime = {
  jsPDF: typeof import('jspdf').jsPDF;
  autoTable: (typeof import('jspdf-autotable'))['default'];
};

let pdfPromise: Promise<PdfRuntime> | null = null;

function loadPdf(): Promise<PdfRuntime> {
  if (!pdfPromise) {
    pdfPromise = Promise.all([import('jspdf'), import('jspdf-autotable')]).then(
      ([jspdf, autotable]) => ({
        jsPDF: jspdf.jsPDF,
        // The package ships CJS and ESM builds; whichever resolves, the
        // callable default is the `autoTable(doc, options)` function.
        autoTable: autotable.default ?? (autotable as unknown as PdfRuntime['autoTable']),
      }),
    );
  }
  return pdfPromise;
}

/** A4 in millimetres — what an Indonesian office printer expects. */
const PAGE_MARGIN = 12;
/** Brand accent, matching `--color-accent` (Tailwind's blue-600). */
const HEAD_FILL: [number, number, number] = [37, 99, 235];

function withPdfExtension(filename: string): string {
  return filename.toLowerCase().endsWith('.pdf') ? filename : `${filename}.pdf`;
}

/**
 * Renders `rows` (header first, like every `to*Rows` mapper produces) as a
 * paginated A4 table and downloads it.
 *
 * Rejects only when the generator itself fails — callers (the export
 * buttons) already toast the message, matching the CSV/XLSX path.
 */
export async function downloadPdf(
  filename: string,
  title: string,
  rows: SheetRow[],
): Promise<void> {
  // `noUncheckedIndexedAccess`: read the header defensively, then keep the
  // real contract — a header plus at least one data row.
  const head = rows[0]?.map((cell) => String(cell)) ?? [];
  if (rows.length < 2) throw new Error('Tidak ada data untuk diekspor.');

  const { jsPDF, autoTable } = await loadPdf();
  const body = rows.slice(1).map((row) => row.map((cell) => String(cell ?? '')));

  // Wide record sets (invoices carry six-plus columns) read far better turned
  // on their side than squeezed into a portrait sheet.
  const doc = new jsPDF({
    orientation: head.length > 6 ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(title, PAGE_MARGIN, PAGE_MARGIN + 3);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(109, 109, 109);
  doc.text(
    `Notain · ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`,
    PAGE_MARGIN,
    PAGE_MARGIN + 9,
  );

  autoTable(doc, {
    head: [head],
    body,
    startY: PAGE_MARGIN + 14,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, top: PAGE_MARGIN, bottom: PAGE_MARGIN },
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 2, textColor: [23, 23, 23] },
    headStyles: { fillColor: HEAD_FILL, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 248, 246] },
  });

  doc.save(withPdfExtension(filename));
}
