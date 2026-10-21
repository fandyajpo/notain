import { describe, expect, it } from 'vite-plus/test';
import { catalogShapeSchema, catalogDraftSchema } from './schema';

describe('catalogDraftSchema', () => {
  it('trims the name and unit', () => {
    expect(
      catalogDraftSchema.parse({
        name: '  Nasi Goreng ',
        kind: 'barang',
        unit: ' porsi ',
        unitPrice: 20_000,
      }),
    ).toEqual({ name: 'Nasi Goreng', kind: 'barang', unit: 'porsi', unitPrice: 20_000 });
  });

  it('accepts a service with no unit', () => {
    expect(
      catalogDraftSchema.parse({ name: 'Jasa Pasang', kind: 'jasa', unit: '', unitPrice: 150_000 }),
    ).toEqual({ name: 'Jasa Pasang', kind: 'jasa', unit: '', unitPrice: 150_000 });
  });

  it('rejects a blank name', () => {
    expect(
      catalogDraftSchema.safeParse({ name: '  ', kind: 'barang', unit: '', unitPrice: 0 }).success,
    ).toBe(false);
  });

  it('rejects a negative price', () => {
    expect(
      catalogDraftSchema.safeParse({ name: 'X', kind: 'barang', unit: '', unitPrice: -1 }).success,
    ).toBe(false);
  });

  it('falls back to "barang" for an unknown kind', () => {
    const parsed = catalogDraftSchema.parse({
      name: 'X',
      kind: 'nonsense',
      unit: '',
      unitPrice: 0,
    });
    expect(parsed.kind).toBe('barang');
  });
});

describe('catalogShapeSchema', () => {
  it('passes a well-formed row through', () => {
    expect(
      catalogShapeSchema.parse({
        name: 'Nasi Goreng',
        kind: 'barang',
        unit: 'porsi',
        unitPrice: 20_000,
        lastUsedAt: '2026-10-12T00:00:00.000Z',
      }),
    ).toEqual({
      name: 'Nasi Goreng',
      kind: 'barang',
      unit: 'porsi',
      unitPrice: 20_000,
      lastUsedAt: '2026-10-12T00:00:00.000Z',
    });
  });

  it('falls back rather than failing on null columns', () => {
    expect(
      catalogShapeSchema.parse({
        name: 'Nasi Goreng',
        kind: null,
        unit: null,
        unitPrice: null,
        lastUsedAt: null,
      }),
    ).toEqual({ name: 'Nasi Goreng', kind: 'barang', unit: '', unitPrice: 0, lastUsedAt: '' });
  });
});
