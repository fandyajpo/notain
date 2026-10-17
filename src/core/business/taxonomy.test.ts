import { describe, expect, it } from 'vitest';
import {
  BUSINESS_CATEGORIES,
  BUSINESS_SUBTYPE_SLUGS,
  businessSubtypeLabel,
  getBusinessCategory,
  getBusinessSubtype,
  isBusinessSubtypeSlug,
  searchBusinessSubtypes,
} from './taxonomy';

describe('BUSINESS_CATEGORIES', () => {
  it('groups the whole taxonomy under 19 categories', () => {
    expect(BUSINESS_CATEGORIES).toHaveLength(19);
    expect(BUSINESS_SUBTYPE_SLUGS).toHaveLength(175);
  });

  it('has unique category slugs, every one with subtypes', () => {
    const slugs = BUSINESS_CATEGORIES.map((category) => category.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const category of BUSINESS_CATEGORIES) {
      expect(category.label.length).toBeGreaterThan(0);
      expect(category.subtypes.length).toBeGreaterThan(0);
    }
  });

  it('has unique subtype slugs across every category', () => {
    expect(new Set(BUSINESS_SUBTYPE_SLUGS).size).toBe(BUSINESS_SUBTYPE_SLUGS.length);
  });

  it('labels every subtype and keeps slugs kebab-case ASCII', () => {
    for (const subtype of BUSINESS_CATEGORIES.flatMap((category) => category.subtypes)) {
      expect(subtype.label.trim().length).toBeGreaterThan(0);
      expect(subtype.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });
});

describe('getBusinessCategory', () => {
  it('finds a category by slug', () => {
    expect(getBusinessCategory('otomotif')?.label).toBe('Otomotif');
  });

  it('does not resolve a subtype as a category', () => {
    expect(getBusinessCategory('bengkel-mobil')).toBeUndefined();
    expect(getBusinessCategory('nope')).toBeUndefined();
  });
});

describe('getBusinessSubtype', () => {
  it('resolves a subtype together with its category', () => {
    expect(getBusinessSubtype('bengkel-mobil')).toEqual({
      slug: 'bengkel-mobil',
      label: 'Bengkel Mobil',
      categorySlug: 'otomotif',
      categoryLabel: 'Otomotif',
    });
  });

  it('resolves every slug the taxonomy defines', () => {
    for (const slug of BUSINESS_SUBTYPE_SLUGS) {
      expect(getBusinessSubtype(slug), slug).not.toBeNull();
    }
  });

  it('degrades to null for empty, unknown or renamed slugs', () => {
    expect(getBusinessSubtype(null)).toBeNull();
    expect(getBusinessSubtype(undefined)).toBeNull();
    expect(getBusinessSubtype('')).toBeNull();
    expect(getBusinessSubtype('bengkel-kapal')).toBeNull();
  });
});

describe('businessSubtypeLabel', () => {
  it('returns the label for a known slug', () => {
    expect(businessSubtypeLabel('katering')).toBe('Katering');
  });

  it('returns null when nothing resolves', () => {
    expect(businessSubtypeLabel(null)).toBeNull();
    expect(businessSubtypeLabel('bengkel-kapal')).toBeNull();
  });
});

describe('isBusinessSubtypeSlug', () => {
  it('accepts known slugs and rejects everything else', () => {
    expect(isBusinessSubtypeSlug('restoran')).toBe(true);
    expect(isBusinessSubtypeSlug('restoran-makan')).toBe(false);
    expect(isBusinessSubtypeSlug('otomotif')).toBe(false);
  });
});

describe('searchBusinessSubtypes', () => {
  it('returns the taxonomy untouched for a blank query', () => {
    expect(searchBusinessSubtypes('   ')).toEqual([...BUSINESS_CATEGORIES]);
  });

  it('matches subtypes by label, case-insensitively', () => {
    const results = searchBusinessSubtypes('bengkel');
    expect(results).toHaveLength(1);
    expect(results[0]?.slug).toBe('otomotif');
    expect(results[0]?.subtypes.map((subtype) => subtype.slug)).toEqual([
      'bengkel-mobil',
      'bengkel-motor',
    ]);
  });

  it('keeps every subtype when the category label matches', () => {
    const results = searchBusinessSubtypes('otomotif');
    expect(results).toHaveLength(1);
    expect(results[0]?.subtypes).toHaveLength(10);
  });

  it('finds subtypes across several categories', () => {
    const slugs = searchBusinessSubtypes('kesehatan').flatMap((category) =>
      category.subtypes.map((subtype) => subtype.slug),
    );
    expect(slugs).toContain('klinik-kesehatan');
    expect(slugs).toContain('layanan-kesehatan-hewan');
  });

  it('returns nothing when no label matches', () => {
    expect(searchBusinessSubtypes('kapal pesiar')).toEqual([]);
  });
});
