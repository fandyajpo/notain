import { describe, expect, it } from 'vite-plus/test';
import { buildCsv, parseCsv } from './csv';

describe('parseCsv', () => {
  it('splits plain rows on commas', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('keeps a comma inside a quoted field', () => {
    expect(parseCsv('"Jl. Merdeka, No. 5",Budi')).toEqual([['Jl. Merdeka, No. 5', 'Budi']]);
  });

  it('unescapes a doubled quote inside a quoted field', () => {
    expect(parseCsv('"Kata ""ganda""",x')).toEqual([['Kata "ganda"', 'x']]);
  });

  it('keeps a newline inside a quoted field', () => {
    expect(parseCsv('"baris satu\nbaris dua",y')).toEqual([['baris satu\nbaris dua', 'y']]);
  });

  it('handles CRLF line endings from Excel', () => {
    expect(parseCsv('a,b\r\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('strips a leading UTF-8 BOM', () => {
    expect(parseCsv('﻿a,b')).toEqual([['a', 'b']]);
  });

  it('round-trips through buildCsv', () => {
    const rows = [
      ['Nama', 'WhatsApp'],
      ['Budi, Santoso', '081234567890'],
      ['Kata "ganda"', '0811'],
    ];
    expect(parseCsv(buildCsv(rows))).toEqual(rows);
  });

  it('parses an empty string as no rows', () => {
    expect(parseCsv('')).toEqual([]);
  });
});

describe('buildCsv', () => {
  it('quotes a field that contains a comma', () => {
    expect(buildCsv([['a,b', 'c']])).toBe('"a,b",c');
  });

  it('quotes a field that contains a quote', () => {
    expect(buildCsv([['say "hi"']])).toBe('"say ""hi"""');
  });

  it('uses CRLF between rows', () => {
    expect(buildCsv([['a'], ['b']])).toBe('a\r\nb');
  });

  it('coerces numbers to strings', () => {
    expect(buildCsv([[150000, 2]])).toBe('150000,2');
  });
});
