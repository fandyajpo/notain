import { describe, expect, it } from 'vitest';
import { createEmptyDraft, EMPTY_SECTIONS } from '../invoice/model';
import { applyTemplateDefaults } from './apply';
import { BUILTIN_TEMPLATES, getBuiltinTemplate } from './builtins';

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
  });
});
