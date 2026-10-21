import { describe, expect, it } from 'vite-plus/test';
import { createEmptyDraft, EMPTY_SECTIONS } from '../invoice/model';
import { invoiceDraftSchema } from '../invoice/schema';
import { applyTemplateDefaults } from './apply';
import { BUILTIN_TEMPLATES, getBuiltinTemplate } from './builtins';
import { getBusinessPreset } from '../business/presets';
import type { InvoiceTemplate } from './model';

const CLASSIC = getBuiltinTemplate('classic')!;

function draftWith(overrides: Partial<ReturnType<typeof createEmptyDraft>> = {}) {
  return {
    ...createEmptyDraft('INV-2026-001', '2026-01-01'),
    sections: { ...EMPTY_SECTIONS },
    ...overrides,
  };
}

describe('applyTemplateDefaults', () => {
  it('points the draft at the template and fills every empty section', () => {
    const draft = applyTemplateDefaults(draftWith(), CLASSIC);

    expect(draft.templateId).toBe('classic');
    expect(draft.sections).toEqual({
      header: CLASSIC.defaults.header,
      content: CLASSIC.defaults.content,
      footer: CLASSIC.defaults.footer,
    });
    expect(draft.notes).toBe(CLASSIC.defaults.notes);
  });

  it('keeps prose the author already wrote', () => {
    const draft = draftWith({
      sections: { header: '<p>sudah diketik</p>', content: '', footer: '' },
      notes: 'catatan sendiri',
    });

    const applied = applyTemplateDefaults(draft, CLASSIC);

    expect(applied.sections.header).toBe('<p>sudah diketik</p>');
    expect(applied.sections.content).toBe(CLASSIC.defaults.content);
    expect(applied.notes).toBe('catatan sendiri');
  });

  it('normalises the id to the resolved template, not to the pick', () => {
    const builtins = BUILTIN_TEMPLATES;
    expect(builtins.length).toBeGreaterThan(0);

    for (const template of builtins) {
      expect(applyTemplateDefaults(draftWith(), template).templateId).toBe(template.id);
    }
  });

  it('does not mutate the draft it was handed', () => {
    const draft = draftWith();
    applyTemplateDefaults(draft, CLASSIC);

    expect(draft.templateId).toBeUndefined();
    expect(draft.sections).toEqual(EMPTY_SECTIONS);
    expect(draft.items).toEqual([]);
  });
});

describe('applyTemplateDefaults sample items', () => {
  const forType = (businessType: InvoiceTemplate['businessType']) => ({
    ...CLASSIC,
    id: 'row-1',
    builtin: false,
    businessType,
  });

  it('seeds sample rows from the template trade when the draft has none', () => {
    const draft = applyTemplateDefaults(draftWith(), forType('bengkel-mobil'));
    const preset = getBusinessPreset('bengkel-mobil');

    expect(draft.items).toHaveLength(preset.sampleItems.length);
    expect(draft.items.map((item) => item.name)).toEqual(
      preset.sampleItems.map((item) => item.name),
    );
    expect(draft.items.every((item) => item.id.length > 0)).toBe(true);
    expect(new Set(draft.items.map((item) => item.id)).size).toBe(draft.items.length);
  });

  it('prefers the template type over the viewer fallback', () => {
    const draft = applyTemplateDefaults(draftWith(), forType('restoran'), 'bengkel-mobil');
    const preset = getBusinessPreset('restoran');

    expect(draft.items[0]?.name).toBe(preset.sampleItems[0]?.name);
  });

  it('uses the viewer type when the template carries none (builtins, legacy rows)', () => {
    const draft = applyTemplateDefaults(draftWith(), forType(null), 'restoran');
    const preset = getBusinessPreset('restoran');

    expect(draft.items.map((item) => item.name)).toEqual(
      preset.sampleItems.map((item) => item.name),
    );
  });

  it('falls back to the generic samples when neither side picked a type', () => {
    const draft = applyTemplateDefaults(draftWith(), forType(null), null);

    expect(draft.items.map((item) => item.name)).toEqual(
      getBusinessPreset(null).sampleItems.map((item) => item.name),
    );
  });

  it('leaves items the author already entered alone', () => {
    const mine = [{ id: 'keep-1', name: 'Sudah diketik', quantity: 1, unitPrice: 5_000 }];
    const draft = applyTemplateDefaults(draftWith({ items: mine }), forType('restoran'));

    expect(draft.items).toEqual(mine);
  });

  it('carries each preset unit so the grid column is worth showing', () => {
    const draft = applyTemplateDefaults(draftWith(), forType('bengkel-mobil'));

    expect(draft.items.every((item) => typeof item.unit === 'string' && item.unit.length > 0)).toBe(
      true,
    );
  });

  it('produces items the draft schema accepts', () => {
    const draft = applyTemplateDefaults(draftWith(), forType('bengkel-mobil'));

    expect(invoiceDraftSchema.safeParse({ ...draft, customerName: 'Budi' }).success).toBe(true);
  });
});
