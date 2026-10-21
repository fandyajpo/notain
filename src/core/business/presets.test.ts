import { describe, expect, it } from 'vite-plus/test';
import { INVOICE_LIMITS } from '../invoice/model';
import { TEMPLATE_LIMITS, hasRequiredBlocks } from '../template/model';
import { BUSINESS_CATEGORIES } from './taxonomy';
import {
  BUSINESS_PRESETS,
  GENERAL_PRESET,
  SAMPLE_ITEM_COUNT,
  getBusinessPreset,
  getBusinessPresetForCategory,
} from './presets';

const allPresets = Object.values(BUSINESS_PRESETS);

describe('BUSINESS_PRESETS', () => {
  it('has exactly one preset per taxonomy category', () => {
    expect(Object.keys(BUSINESS_PRESETS).sort()).toEqual(
      BUSINESS_CATEGORIES.map((category) => category.slug).sort(),
    );
  });

  it.each(allPresets.map((preset) => [preset.categorySlug, preset] as const))(
    'builds a valid layout for %s',
    (_slug, preset) => {
      const layout = preset.layout();
      const ids = layout.map((block) => block.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(hasRequiredBlocks(layout)).toBe(true);
    },
  );

  it('returns fresh block instances on every call', () => {
    for (const preset of allPresets) {
      const first = preset.layout();
      const second = preset.layout();
      expect(second).not.toBe(first);
      // A shared block object would let one template's edits leak into the
      // next template seeded from the same preset.
      expect(second[0]).not.toBe(first[0]);
    }
  });

  it.each(allPresets.map((preset) => [preset.categorySlug, preset] as const))(
    'keeps %s prose inside the rich-text limits',
    (_slug, preset) => {
      for (const section of [preset.prose.header, preset.prose.content, preset.prose.footer]) {
        expect(section.trim().length).toBeGreaterThan(0);
        expect(section.length).toBeLessThanOrEqual(TEMPLATE_LIMITS.richText);
      }
      if (preset.prose.notes !== undefined) {
        expect(preset.prose.notes.length).toBeLessThanOrEqual(TEMPLATE_LIMITS.notes);
      }
    },
  );

  it.each(allPresets.map((preset) => [preset.categorySlug, preset] as const))(
    'keeps %s sample items inside the invoice item limits',
    (_slug, preset) => {
      expect(preset.sampleItems.length).toBe(SAMPLE_ITEM_COUNT);
      for (const item of preset.sampleItems) {
        expect(item.name.trim().length).toBeGreaterThan(0);
        expect(item.name.length).toBeLessThanOrEqual(INVOICE_LIMITS.itemName);
        expect(item.quantity).toBeGreaterThanOrEqual(1);
        expect(item.quantity).toBeLessThanOrEqual(INVOICE_LIMITS.maxQuantity);
        expect(item.unitPrice).toBeGreaterThanOrEqual(0);
        expect(item.unitPrice).toBeLessThanOrEqual(INVOICE_LIMITS.maxUnitPrice);
        if (item.unit !== undefined) {
          expect(item.unit.trim().length).toBeGreaterThan(0);
          expect(item.unit.length).toBeLessThanOrEqual(16);
        }
      }
    },
  );

  it.each(allPresets.map((preset) => [preset.categorySlug, preset] as const))(
    'offers usable unit hints for %s',
    (_slug, preset) => {
      expect(preset.units.length).toBeGreaterThan(0);
      for (const unit of preset.units) {
        expect(unit.trim().length).toBeGreaterThan(0);
        expect(unit.length).toBeLessThanOrEqual(16);
      }
      expect(new Set(preset.units).size).toBe(preset.units.length);
    },
  );

  it('leaves no sample item without a unit, since every category hints units', () => {
    for (const preset of allPresets) {
      for (const item of preset.sampleItems) {
        expect(item.unit, `${preset.categorySlug}: ${item.name}`).toBeTruthy();
      }
    }
  });
});

describe('getBusinessPreset', () => {
  it('resolves a subtype to its category preset', () => {
    expect(getBusinessPreset('bengkel-mobil').categorySlug).toBe('otomotif');
    expect(getBusinessPreset('restoran').categorySlug).toBe('makanan-minuman');
    expect(getBusinessPreset('koperasi').categorySlug).toBe('organisasi-lainnya');
  });

  it('falls back to the general preset for empty or unknown slugs', () => {
    expect(getBusinessPreset(null)).toBe(GENERAL_PRESET);
    expect(getBusinessPreset(undefined)).toBe(GENERAL_PRESET);
    expect(getBusinessPreset('')).toBe(GENERAL_PRESET);
    expect(getBusinessPreset('bengkel-kapal')).toBe(GENERAL_PRESET);
  });
});

describe('getBusinessPresetForCategory', () => {
  it('resolves every category slug', () => {
    for (const category of BUSINESS_CATEGORIES) {
      expect(getBusinessPresetForCategory(category.slug).categorySlug).toBe(category.slug);
    }
  });

  it('falls back to the general preset for an unknown category', () => {
    expect(getBusinessPresetForCategory('nope')).toBe(GENERAL_PRESET);
  });
});
