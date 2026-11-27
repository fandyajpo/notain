import type { SheetRow } from '../core/excel';

/**
 * The printable `.pdf` export for the selection toolbars — through the browser's
 * print dialog, the same path ADR 0007 chose for an invoice.
 *
 * This used to render the sheet with jsPDF and jspdf-autotable: two libraries
 * and ~390 kB pulled in on the click, for one button. The document below is
 * plain HTML, so the reader picks "Save as PDF" in the dialog exactly as
 * `/invoice/print` already asks of them, one path produces every PDF in the
 * app, and the bundle carries no generator at all.
 *
 * The sheeet format is the one the CSV/XLSX path already produces — a header
 * row, then one row per record, from the same `to*Rows` mappers — so all three
 * formats export the same selection without a per-entity PDF mapper.
 */

/** Escapes one cell for the HTML document it is written into. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * The document [`printSheet`] writes: a heading, the date, and one table.
 *
 * Pure, so the markup can be checked without a browser. Every cell is escaped
 * first: a customer name or a note is user text, and this document is written
 * with `document.write`, where an unescaped `<` would become markup.
 */
export function sheetPrintHtml(title: string, rows: SheetRow[]): string {
  const head = rows[0]?.map((cell) => escapeHtml(String(cell ?? ''))) ?? [];
  const body = rows.slice(1).map((row) => {
    const cells = head.map((_, index) => `<td>${escapeHtml(String(row[index] ?? ''))}</td>`);
    return `<tr>${cells.join('')}</tr>`;
  });
  const date = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { font: 8pt/1.45 helvetica, arial, sans-serif; color: #171717; margin: 0; }
  h1 { font-size: 13pt; margin: 0 0 4mm; }
  p.meta { color: #6d6d6d; margin: 0 0 6mm; }
  table { border-collapse: collapse; width: 100%; }
  th { background: #2563eb; color: #fff; font-weight: bold; text-align: left; }
  th, td { padding: 1.5mm 2mm; border-bottom: 0.2mm solid #e5e5e5; }
  tr:nth-child(even) td { background: #f8f8f6; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p class="meta">Notain &middot; ${escapeHtml(date)}</p>
<table>
<thead><tr>${head.map((cell) => `<th>${cell}</th>`).join('')}</tr></thead>
<tbody>${body.join('')}</tbody>
</table>
</body>
</html>`;
}

/**
 * Writes that document into the window the caller opened and asks the browser
 * to print it.
 *
 * The window arrives as an argument because a browser only allows `window.open`
 * inside the gesture itself: the caller opens it before awaiting the rows. A
 * `null` here means the popup was blocked, which is reported rather than
 * swallowed — a button that does nothing is worse than a message.
 */
export function printSheet(target: Window | null, title: string, rows: SheetRow[]): void {
  // A header plus at least one data row, the same contract `lib/excel` keeps.
  if (rows.length < 2) throw new Error('Tidak ada data untuk diekspor.');
  if (!target) throw new Error('Jendela cetak diblokir browser. Izinkan popup lalu coba lagi.');

  target.document.open();
  target.document.write(sheetPrintHtml(title, rows));
  target.document.close();
  target.focus();
  target.print();
}
