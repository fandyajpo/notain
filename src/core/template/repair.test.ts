import { describe, expect, it } from 'vite-plus/test';
import { getBuiltinTemplate } from './builtins';
import { repairTemplateContent } from './repair';
import type { AuthoredTemplate, TemplateBlock } from './model';

const classic = getBuiltinTemplate('classic');
if (!classic) throw new Error('classic built-in missing');

const base: AuthoredTemplate = {
  name: 'Kop Resmi',
  businessType: null,
  layout: classic.layout.map((block) => ({ ...block })),
  theme: { ...classic.theme },
  defaults: { ...classic.defaults },
};

const blocksOf = (template: AuthoredTemplate, type: TemplateBlock['type']) =>
  template.layout.filter((block) => block.type === type);

describe('repairTemplateContent', () => {
  it('leaves a schema-valid template untouched', () => {
    const { template, repaired } = repairTemplateContent(base);
    expect(repaired).toEqual([]);
    expect(template).toEqual(base);
  });

  it('does not mutate its input', () => {
    const snapshot = JSON.parse(JSON.stringify(base)) as AuthoredTemplate;
    repairTemplateContent(base);
    expect(base).toEqual(snapshot);
  });

  it('re-mints duplicate block ids without touching the blocks themselves', () => {
    const layout = base.layout.map((block, index) =>
      index > 0 ? { ...block, id: base.layout[0].id } : { ...block },
    );
    const { template, repaired } = repairTemplateContent({ ...base, layout });
    expect(repaired).toContain('ID blok duplikat diganti.');
    const ids = template.layout.map((block) => block.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(template.layout.map((block) => block.type)).toEqual(layout.map((block) => block.type));
  });

  it('shows a required block the owner hid', () => {
    const layout = base.layout.map((block) =>
      block.type === 'letterhead' ? { ...block, visible: false } : { ...block },
    );
    const { template, repaired } = repairTemplateContent({ ...base, layout });
    expect(repaired).toContain('Blok wajib yang disembunyikan ditampilkan kembali.');
    expect(blocksOf(template, 'letterhead')[0].visible).toBe(true);
  });

  it('appends a required block that went missing, from the classic built-in', () => {
    const layout = base.layout.filter((block) => block.type !== 'totals');
    const { template, repaired } = repairTemplateContent({ ...base, layout });
    expect(repaired).toContain('Blok wajib yang hilang ditambahkan kembali.');
    const totals = blocksOf(template, 'totals');
    expect(totals).toHaveLength(1);
    expect(totals[0].id).toBe('totals-repair');
    expect(totals[0].visible).toBe(true);
  });

  it('names an empty template rather than leaving it unsaveable', () => {
    const { template, repaired } = repairTemplateContent({ ...base, name: '   ' });
    expect(template.name).toBe('Template');
    expect(repaired).toContain('Nama template kosong diganti “Template”.');
  });

  it('caps an oversized layout without dropping required blocks', () => {
    const filler: TemplateBlock[] = Array.from({ length: 50 }, (_, index) => ({
      id: `spacer-${index}`,
      type: 'spacer',
      visible: true,
      align: 'left',
      width: 'full',
    }));
    const { template, repaired } = repairTemplateContent({
      ...base,
      layout: [...base.layout, ...filler],
    });
    expect(template.layout).toHaveLength(40);
    expect(repaired).toContain('Jumlah blok melebihi batas dan dipotong.');
    for (const type of ['letterhead', 'items', 'totals'] as const) {
      expect(blocksOf(template, type).length).toBeGreaterThan(0);
    }
  });
});
