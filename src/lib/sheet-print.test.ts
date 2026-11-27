import { describe, expect, it } from 'vite-plus/test';
import { sheetPrintHtml } from './sheet-print';

/**
 * The sheet PDF is written with `document.write`, so an unescaped cell would
 * become markup in the printer's window. These pin the escaping and the table
 * shape without a browser.
 */
describe('sheetPrintHtml', () => {
  it('renders the header row as a table head and the rest as body rows', () => {
    const html = sheetPrintHtml('Daftar nota', [
      ['Nomor', 'Total'],
      ['INV-2026-001', 'Rp 49.000'],
    ]);

    expect(html).toContain('<th>Nomor</th>');
    expect(html).toContain('<th>Total</th>');
    expect(html).toContain('<td>INV-2026-001</td>');
    expect(html).toContain('<td>Rp 49.000</td>');
    expect(html).toContain('<h1>Daftar nota</h1>');
  });

  it('escapes markup from a cell instead of writing it into the document', () => {
    const html = sheetPrintHtml('<b>Nota</b>', [
      ['a&b', '"kutip"'],
      ['<script>alert(1)</script>', 'x'],
    ]);

    expect(html).toContain('<h1>&lt;b&gt;Nota&lt;/b&gt;</h1>');
    expect(html).toContain('a&amp;b');
    expect(html).toContain('&quot;kutip&quot;');
    expect(html).not.toContain('<script>');
  });

  it('renders a column count that follows the header, not the widest row', () => {
    const html = sheetPrintHtml('Nota', [['Satu'], ['a', 'b']]);

    const bodyRow = html.slice(html.indexOf('<tbody>'));
    expect(bodyRow.match(/<td>/g)).toHaveLength(1);
  });
});
