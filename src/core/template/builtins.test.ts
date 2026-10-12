import { describe, expect, it } from 'vitest';
import { BUILTIN_TEMPLATES, getBuiltinTemplate, isBuiltinTemplateId } from './builtins';
import { invoiceTemplateSchema } from './schema';
import { REQUIRED_BLOCK_TYPES, hasRequiredBlocks, visibleBlocks } from './model';
import { listSelectableTemplates, resolveTemplate } from './resolve';

/** The persisted subset — `id` and `builtin` are owned by the row and the code. */
const authored = (template: (typeof BUILTIN_TEMPLATES)[number]) => ({
  name: template.name,
  layout: template.layout,
  theme: template.theme,
  defaults: template.defaults,
});

describe('BUILTIN_TEMPLATES', () => {
  it('defines classic, minimal and modern', () => {
    expect(BUILTIN_TEMPLATES.map((template) => template.id)).toEqual([
      'classic',
      'minimal',
      'modern',
    ]);
  });

  it.each(BUILTIN_TEMPLATES.map((template) => [template.id, template] as const))(
    'passes the business schema (%s)',
    (_id, template) => {
      expect(invoiceTemplateSchema.safeParse(authored(template)).success).toBe(true);
    },
  );

  it.each(BUILTIN_TEMPLATES.map((template) => [template.id, template] as const))(
    'keeps every block id unique and the required blocks visible (%s)',
    (_id, template) => {
      const ids = template.layout.map((block) => block.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(hasRequiredBlocks(template.layout)).toBe(true);
    },
  );

  it('looks visibly different from one another', () => {
    const [classic, minimal, modern] = BUILTIN_TEMPLATES;
    expect(classic?.theme).not.toEqual(minimal?.theme);
    expect(classic?.theme).not.toEqual(modern?.theme);
    expect(minimal?.theme.accent).not.toBe(classic?.theme.accent);
    expect(modern?.theme.accentBar).toBe(true);
    expect(classic?.theme.accentBar).toBe(false);
  });

  it('does not share one layout array across builtins', () => {
    const layouts = BUILTIN_TEMPLATES.map((template) => template.layout);
    expect(new Set(layouts).size).toBe(layouts.length);
    expect(layouts.every((layout) => layout.length === 8)).toBe(true);
  });

  it('recognises its own ids', () => {
    expect(isBuiltinTemplateId('classic')).toBe(true);
    expect(isBuiltinTemplateId('nope')).toBe(false);
    expect(getBuiltinTemplate('modern')?.id).toBe('modern');
    expect(getBuiltinTemplate('nope')).toBeUndefined();
  });
});

describe('resolveTemplate', () => {
  const saved = [
    {
      id: 'row-1',
      name: 'Punya saya',
      layout: BUILTIN_TEMPLATES[0]!.layout.map((block) => ({ ...block })),
      theme: BUILTIN_TEMPLATES[0]!.theme,
      defaults: { header: '', content: '', footer: '' },
      builtin: false,
    },
  ];

  it('prefers a saved template', () => {
    expect(resolveTemplate('row-1', saved).id).toBe('row-1');
  });

  it('falls back to the builtin when the saved row is gone', () => {
    expect(resolveTemplate('row-1', []).id).toBe('classic');
  });

  it('resolves a builtin id without any saved rows', () => {
    expect(resolveTemplate('modern', []).id).toBe('modern');
  });

  it('falls back to classic when nothing matches', () => {
    expect(resolveTemplate('deleted-id', saved).id).toBe('classic');
    expect(resolveTemplate('', saved).id).toBe('classic');
    expect(resolveTemplate(undefined, saved).id).toBe('classic');
    expect(resolveTemplate(null, saved).id).toBe('classic');
  });

  it('never resolves to a builtin without an item table', () => {
    for (const id of ['row-1', 'deleted-id', 'modern', undefined]) {
      expect(hasRequiredBlocks(resolveTemplate(id, saved).layout)).toBe(true);
    }
  });
});

describe('listSelectableTemplates', () => {
  it('offers builtins first, then saved copies', () => {
    const saved = [
      {
        id: 'row-9',
        name: 'Arsip',
        layout: BUILTIN_TEMPLATES[0]!.layout.map((block) => ({ ...block })),
        theme: BUILTIN_TEMPLATES[0]!.theme,
        defaults: { header: '', content: '', footer: '' },
        builtin: false,
      },
    ];

    const list = listSelectableTemplates(saved);
    expect(list.map((template) => template.id)).toEqual(['classic', 'minimal', 'modern', 'row-9']);
    expect(list.every((template) => visibleBlocks(template.layout).length > 0)).toBe(true);
    expect(
      REQUIRED_BLOCK_TYPES.every((type) => list.some((t) => t.layout.some((b) => b.type === type))),
    ).toBe(true);
  });

  it('is still usable when the table is empty', () => {
    expect(listSelectableTemplates([]).map((template) => template.id)).toEqual([
      'classic',
      'minimal',
      'modern',
    ]);
  });
});

describe('resolveTemplate guard rails', () => {
  const rotted = {
    id: 'rotted',
    name: 'Rusak',
    layout: BUILTIN_TEMPLATES[0]!.layout.filter((block) => block.type !== 'items'),
    theme: BUILTIN_TEMPLATES[0]!.theme,
    defaults: { header: '', content: '', footer: '' },
    builtin: false,
  };

  it('refuses a saved template that lost its item table', () => {
    expect(resolveTemplate('rotted', [rotted]).id).toBe('classic');
    expect(hasRequiredBlocks(resolveTemplate('rotted', [rotted]).layout)).toBe(true);
  });

  it('hides an unusable template from the picker instead of offering a blank invoice', () => {
    expect(listSelectableTemplates([rotted]).map((template) => template.id)).toEqual([
      'classic',
      'minimal',
      'modern',
    ]);
  });
});
