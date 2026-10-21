import { describe, expect, it } from 'vite-plus/test';
import { CUSTOMER_TEMPLATE_ROWS, parseCustomerImportRows, toCustomerRows } from './customers';

const HEADER = ['Nama', 'Email', 'WhatsApp'];

describe('toCustomerRows', () => {
  it('puts the header first, then one row per customer', () => {
    const rows = toCustomerRows([
      { id: '1', name: 'Budi', email: 'budi@mail.com', phone: '0812', lastUsedAt: '2026-01-01' },
    ]);
    expect(rows[0]).toEqual(HEADER);
    expect(rows[1]).toEqual(['Budi', 'budi@mail.com', '0812']);
  });

  it('writes empty fields as empty strings', () => {
    const rows = toCustomerRows([
      { id: '1', name: 'Sri', email: '', phone: '', lastUsedAt: '2026-01-01' },
    ]);
    expect(rows[1]).toEqual(['Sri', '', '']);
  });
});

describe('parseCustomerImportRows', () => {
  it('parses valid rows into drafts', () => {
    const result = parseCustomerImportRows([
      HEADER,
      ['Budi', 'budi@mail.com', '081234567890'],
      ['Sri', '', '08111'],
    ]);
    expect(result.issues).toEqual([]);
    expect(result.customers).toEqual([
      { name: 'Budi', email: 'budi@mail.com', phone: '081234567890' },
      { name: 'Sri', email: '', phone: '08111' },
    ]);
  });

  it('skips fully blank rows', () => {
    const result = parseCustomerImportRows([HEADER, ['Budi', '', '0812'], ['', '   ', '']]);
    expect(result.issues).toEqual([]);
    expect(result.customers).toHaveLength(1);
  });

  it('matches the header case-insensitively and with aliases', () => {
    const result = parseCustomerImportRows([
      [' Nama ', 'E-mail', 'No. HP'],
      ['Budi', 'budi@mail.com', '0812'],
    ]);
    expect(result.issues).toEqual([]);
    expect(result.customers).toEqual([{ name: 'Budi', email: 'budi@mail.com', phone: '0812' }]);
  });

  it('allows empty email and phone', () => {
    const result = parseCustomerImportRows([HEADER, ['Budi', '', '']]);
    expect(result.issues).toEqual([]);
    expect(result.customers).toEqual([{ name: 'Budi', email: '', phone: '' }]);
  });

  it('reports a 1-based spreadsheet row number for an invalid name', () => {
    const result = parseCustomerImportRows([HEADER, ['Budi', '', '0812'], ['   ', '', '0811']]);
    expect(result.customers).toHaveLength(1);
    expect(result.issues).toEqual([{ row: 3, message: expect.stringContaining('nama') }]);
  });

  it('rejects a phone over the column limit', () => {
    const result = parseCustomerImportRows([HEADER, ['Budi', '', '0'.repeat(33)]]);
    expect(result.customers).toHaveLength(0);
    expect(result.issues).toEqual([
      { row: 2, message: expect.stringContaining('Nomor terlalu panjang') },
    ]);
  });

  it('errors when the Nama column is missing', () => {
    const result = parseCustomerImportRows([
      ['Foo', 'Bar'],
      ['x', 'y'],
    ]);
    expect(result.customers).toHaveLength(0);
    expect(result.issues[0]?.message).toContain('Nama');
  });

  it('parses the shipped template without issues', () => {
    const result = parseCustomerImportRows(CUSTOMER_TEMPLATE_ROWS);
    expect(result.issues).toEqual([]);
    expect(result.customers).toHaveLength(1);
  });
});
