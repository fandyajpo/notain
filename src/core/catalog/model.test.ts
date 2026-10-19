import { describe, expect, it } from 'vitest';
import { catalogKey, isSameCatalogItem, mergeCatalogItem, type CatalogDraft } from './model';

function draft(overrides: Partial<CatalogDraft> = {}): CatalogDraft {
  return { name: '', kind: 'barang', unit: '', unitPrice: 0, ...overrides };
}

describe('catalogKey', () => {
  it('folds case and collapses repeated whitespace', () => {
    expect(catalogKey('  Nasi   Goreng ')).toBe('nasi goreng');
  });

  it('treats a blank name as an empty key', () => {
    expect(catalogKey('   ')).toBe('');
  });
});

describe('isSameCatalogItem', () => {
  it('matches names that differ only by case and spacing', () => {
    expect(isSameCatalogItem(draft({ name: 'Nasi Goreng' }), draft({ name: 'nasi  goreng' }))).toBe(
      true,
    );
  });

  it('never matches two blank names', () => {
    expect(isSameCatalogItem(draft({ name: '  ' }), draft({ name: '' }))).toBe(false);
  });

  it('keeps differently named items apart', () => {
    expect(isSameCatalogItem(draft({ name: 'Nasi' }), draft({ name: 'Mie' }))).toBe(false);
  });
});

describe('mergeCatalogItem', () => {
  it('keeps the existing name and takes the incoming price and unit', () => {
    const merged = mergeCatalogItem(
      draft({ name: 'Nasi Goreng', unit: 'pcs', unitPrice: 20_000 }),
      draft({ name: 'nasi goreng', unit: 'porsi', unitPrice: 25_000 }),
    );
    expect(merged).toEqual({
      name: 'Nasi Goreng',
      kind: 'barang',
      unit: 'porsi',
      unitPrice: 25_000,
    });
  });

  it('never erases stored values with an empty incoming field', () => {
    const merged = mergeCatalogItem(
      draft({ name: 'Cuci Sepatu', kind: 'jasa', unit: 'pasang', unitPrice: 30_000 }),
      draft({ name: 'Cuci Sepatu', kind: 'barang', unit: '', unitPrice: 0 }),
    );
    expect(merged).toEqual({
      name: 'Cuci Sepatu',
      kind: 'jasa',
      unit: 'pasang',
      unitPrice: 30_000,
    });
  });
});
