/**
 * CSV parsing and building, written by hand rather than via SheetJS.
 *
 * Import must not go through SheetJS' reader: the advisories that used to ship
 * with it (prototype pollution, ReDoS) live exactly on that path, and a CSV is
 * simple enough to parse safely here. SheetJS is reserved for `.xlsx` read and
 * write, which this module never touches.
 */

/** A cell is either raw text or a number (money, counts) on the way out. */
export type SheetRow = (string | number)[];

/**
 * Parse CSV text into a matrix of cells.
 *
 * Handles RFC 4180 quoting: a field may be wrapped in double quotes, an
 * embedded quote is doubled (`""`), and a quoted field may contain commas and
 * newlines. Tolerates CRLF and lone-LF line endings, and strips a UTF-8 BOM
 * (which Excel writes when saving CSV).
 */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    rows.push(row);
    row = [];
  };

  while (i < src.length) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      pushField();
      i += 1;
      continue;
    }
    if (ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '\n') {
      pushField();
      pushRow();
      i += 1;
      continue;
    }

    field += ch;
    i += 1;
  }

  // Flush the final field/row when the text does not end with a newline.
  if (field.length > 0 || row.length > 0) {
    pushField();
    pushRow();
  }

  return rows;
}

function escapeCell(cell: string | number): string {
  const value = cell === null || cell === undefined ? '' : String(cell);
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Build CSV text from a matrix. Fields containing a comma, quote or newline are
 * quoted; embedded quotes are doubled. CRLF line endings are used because that
 * is what Excel expects.
 */
export function buildCsv(rows: SheetRow[]): string {
  return rows.map((row) => row.map(escapeCell).join(',')).join('\r\n');
}

/** Coerce a cell to the plain string CSV and row inspection expect. */
export function cellToString(cell: string | number | null | undefined): string {
  return cell === null || cell === undefined ? '' : String(cell);
}
