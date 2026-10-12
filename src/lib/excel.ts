import { buildCsv, cellToString, parseCsv, type SheetRow } from '../core/excel';

/**
 * Browser-facing Excel plumbing. SheetJS is pulled in with a dynamic `import()`
 * so its ~900 KB never lands in the initial bundle — it only loads when a user
 * actually opens an export or import. CSV never touches SheetJS: it is parsed
 * and built in `core/excel/csv` (see ADR 0002 for the reasoning).
 */

type XlsxModule = typeof import('xlsx');

let xlsxPromise: Promise<XlsxModule> | null = null;

function loadXlsx(): Promise<XlsxModule> {
  if (!xlsxPromise) xlsxPromise = import('xlsx');
  return xlsxPromise;
}

const CSV_MIME = 'text/csv;charset=utf-8;';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function withExtension(filename: string, extension: string): string {
  return filename.toLowerCase().endsWith(extension) ? filename : `${filename}${extension}`;
}

/**
 * Download the rows as CSV. A UTF-8 BOM is prepended so Excel opens Indonesian
 * characters (é, ü, etc.) correctly instead of mojibake.
 */
export function downloadCsv(filename: string, rows: SheetRow[]): void {
  const csv = buildCsv(rows.map((row) => row.map(cellToString)));
  triggerDownload(new Blob(['﻿' + csv], { type: CSV_MIME }), withExtension(filename, '.csv'));
}

/** Download the rows as a single-sheet `.xlsx` workbook. */
export async function downloadXlsx(
  filename: string,
  sheetName: string,
  rows: SheetRow[],
): Promise<void> {
  const XLSX = await loadXlsx();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  const data = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  triggerDownload(new Blob([data], { type: XLSX_MIME }), withExtension(filename, '.xlsx'));
}

/**
 * Read the first sheet of an uploaded file into a matrix. `.csv` (and `.txt`)
 * go through the safe hand-written parser; anything else is treated as `.xlsx`
 * and read via SheetJS. Every row is normalised to strings so the Zod import
 * validation in `core/excel/customers` sees a consistent shape.
 */
export async function readFileRows(file: File): Promise<SheetRow[]> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    return parseCsv(await file.text());
  }

  const XLSX = await loadXlsx();
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) return [];

  const rows = XLSX.utils.sheet_to_json<string[]>(firstSheet, {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false,
  });
  return rows.map((row) => row.map((cell) => cellToString(cell)));
}
