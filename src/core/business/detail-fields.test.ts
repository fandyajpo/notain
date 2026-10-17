import { describe, expect, it } from 'vitest';
import {
  BUSINESS_CATEGORIES,
  getBusinessSubtype,
  isBusinessSubtypeSlug,
  type BusinessCategorySlug,
} from './taxonomy';
import { BUSINESS_PRESETS, getBusinessPreset } from './presets';
import {
  DETAIL_FIELD_OVERRIDES,
  getDetailFields,
  type BusinessDetailField,
} from './detail-fields';

const DETAIL_FIELD_TYPES: readonly BusinessDetailField['type'][] = ['text', 'number', 'date'];

function expectWellFormedFields(fields: readonly BusinessDetailField[], where: string) {
  const keys = new Set<string>();
  for (const field of fields) {
    expect(field.key, `${where}: key must be kebab-case ASCII`).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(field.key.length, `${where}: key too long`).toBeLessThanOrEqual(32);
    expect(field.label.trim(), `${where}: label must be non-empty`).not.toBe('');
    expect(field.label.length, `${where}: label too long`).toBeLessThanOrEqual(64);
    expect(DETAIL_FIELD_TYPES, `${where}: unknown type`).toContain(field.type);
    expect(keys.has(field.key), `${where}: duplicate key ${field.key}`).toBe(false);
    keys.add(field.key);
  }
}

describe('laundry in the taxonomy', () => {
  it('is a Jasa subtype with its own label', () => {
    const subtype = getBusinessSubtype('laundry');
    expect(subtype).not.toBeNull();
    expect(subtype?.label).toBe('Laundry');
    expect(subtype?.categorySlug).toBe('jasa');
  });

  it('resolves as a known subtype slug', () => {
    expect(isBusinessSubtypeSlug('laundry')).toBe(true);
  });
});

describe('getDetailFields', () => {
  it("returns a subtype's override when it has one", () => {
    expect(getDetailFields('laundry')).toEqual([
      { key: 'berat-kg', label: 'Berat (kg)', type: 'number' },
      { key: 'nomor-tiket', label: 'Nomor tiket', type: 'text' },
    ]);
  });

  it('falls back to the category default for a subtype without an override', () => {
    expect(getDetailFields('bengkel-mobil')).toBe(
      getBusinessPreset('bengkel-mobil').detailFields,
    );
  });

  it('keeps the rental override distinct from the rest of Otomotif', () => {
    const rental = getDetailFields('rental-kendaraan');
    expect(rental.map((field) => field.key)).toContain('tanggal-sewa');
    const bengkel = getDetailFields('bengkel-mobil');
    expect(bengkel.map((field) => field.key)).not.toContain('tanggal-sewa');
  });

  it('returns no fields for trades whose documents need nothing extra', () => {
    expect(getDetailFields('retail')).toEqual([]);
    expect(getDetailFields('usaha-lainnya')).toEqual([]);
  });

  it('returns no fields for unknown or absent slugs', () => {
    expect(getDetailFields('slug-yang-tidak-ada')).toEqual([]);
    expect(getDetailFields(null)).toEqual([]);
    expect(getDetailFields(undefined)).toEqual([]);
    expect(getDetailFields('')).toEqual([]);
  });
});

describe('detail-field catalogue integrity', () => {
  it('every category preset carries a well-formed field list', () => {
    for (const category of BUSINESS_CATEGORIES) {
      const preset = BUSINESS_PRESETS[category.slug as BusinessCategorySlug];
      expect(preset, `missing preset for ${category.slug}`).toBeDefined();
      expectWellFormedFields(preset.detailFields, category.slug);
    }
  });

  it('every override targets a subtype that exists and is well-formed', () => {
    for (const [slug, fields] of Object.entries(DETAIL_FIELD_OVERRIDES)) {
      expect(isBusinessSubtypeSlug(slug), `override for unknown subtype ${slug}`).toBe(true);
      expectWellFormedFields(fields, `override:${slug}`);
    }
  });
});
