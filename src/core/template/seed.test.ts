import { describe, expect, it } from 'vitest';
import { defaultsForBusiness, seedTemplateForBusiness } from './seed';
import { getBuiltinTemplate } from './builtins';
import { getBusinessPreset } from '../business/presets';
import { createDefaultLayout, hasRequiredBlocks } from './model';
import { invoiceTemplateSchema } from './schema';

describe('seedTemplateForBusiness', () => {
  it('builds a blank template from the business preset', () => {
    const template = seedTemplateForBusiness(undefined, 'bengkel-mobil');
    const preset = getBusinessPreset('bengkel-mobil');

    expect(template.businessType).toBe('bengkel-mobil');
    expect(template.layout).toEqual(preset.layout());
    expect(template.defaults.header).toBe(preset.prose.header);
    expect(template.defaults.notes).toBe(preset.prose.notes);
  });

  it('falls back to the neutral skeleton when no type was chosen', () => {
    const template = seedTemplateForBusiness(null, null);

    expect(template.businessType).toBeNull();
    expect(template.layout).toEqual(createDefaultLayout());
    expect(template.defaults.header).toBe(getBusinessPreset(null).prose.header);
  });

  it('keeps a copied built-in look but carries the business type', () => {
    const seed = getBuiltinTemplate('classic');
    const template = seedTemplateForBusiness('classic', 'restoran');

    expect(seed).toBeDefined();
    expect(template.name).toBe(`${seed?.name} (salinan)`);
    expect(template.layout).toEqual(seed?.layout);
    expect(template.defaults).toEqual(seed?.defaults);
    expect(template.businessType).toBe('restoran');
  });

  it('returns fresh block instances on every call', () => {
    const first = seedTemplateForBusiness(undefined, 'bengkel-mobil');
    const second = seedTemplateForBusiness(undefined, 'bengkel-mobil');

    expect(first.layout).not.toBe(second.layout);
    expect(first.layout[0]).not.toBe(second.layout[0]);
    expect(first.layout[0]?.id).toBe(second.layout[0]?.id);

    first.layout[0]!.visible = false;
    expect(second.layout[0]?.visible).toBe(true);
    expect(getBusinessPreset('bengkel-mobil').layout()[0]?.visible).toBe(true);
  });

  it('passes its own schema and keeps the required blocks', () => {
    const template = seedTemplateForBusiness(undefined, 'bengkel-mobil');
    const result = invoiceTemplateSchema.safeParse(template);

    expect(result.success).toBe(true);
    expect(hasRequiredBlocks(template.layout)).toBe(true);
  });

  it('never writes a slug the taxonomy rejects', () => {
    const slugs = ['bengkel-mobil', 'kedai-kopi', 'salon', null] as const;
    for (const slug of slugs) {
      const result = invoiceTemplateSchema.safeParse(seedTemplateForBusiness(undefined, slug));
      expect(result.success).toBe(true);
    }
  });
});

describe('defaultsForBusiness', () => {
  it("is the preset's prose for the type", () => {
    const defaults = defaultsForBusiness('bengkel-mobil');

    expect(defaults).toEqual(getBusinessPreset('bengkel-mobil').prose);
    expect(defaults.header).toContain('perawatan kendaraan kamu');
  });

  it('falls back to the neutral prose without a type', () => {
    expect(defaultsForBusiness(null)).toEqual(getBusinessPreset(null).prose);
    expect(defaultsForBusiness()).toEqual(getBusinessPreset(null).prose);
  });

  it('gives each trade its own wording', () => {
    expect(defaultsForBusiness('bengkel-mobil')).not.toEqual(defaultsForBusiness('kedai-kopi'));
  });

  it('returns a fresh copy so form edits never reach the preset', () => {
    const first = defaultsForBusiness('bengkel-mobil');
    first.header = '<p>diubah</p>';
    first.notes = 'diubah';

    const second = defaultsForBusiness('bengkel-mobil');
    expect(second.header).not.toBe('<p>diubah</p>');
    expect(second.notes).toBe(getBusinessPreset('bengkel-mobil').prose.notes);
  });
});
