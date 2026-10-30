import { describe, expect, it } from 'vite-plus/test';
import { invoiceTemplateSchema, invoiceTemplateShapeSchema } from './schema';
import { DEFAULT_THEME, TEMPLATE_LIMITS, createDefaultLayout } from './model';

const baseTemplate = () => ({
  name: 'Template Saya',
  layout: createDefaultLayout(),
  theme: { ...DEFAULT_THEME },
  defaults: { header: '', content: '', footer: '' },
  businessType: null,
});

/** A layout exactly as it looked before `width` existed. */
const legacyLayout = () =>
  createDefaultLayout().map((block) => ({
    id: block.id,
    type: block.type,
    visible: block.visible,
    align: block.align,
  }));

const parse = (overrides: Record<string, unknown> = {}) =>
  invoiceTemplateSchema.safeParse({ ...baseTemplate(), ...overrides });

const issuePaths = (result: ReturnType<typeof invoiceTemplateSchema.safeParse>) =>
  result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));

describe('invoiceTemplateSchema', () => {
  it('accepts a complete template', () => {
    expect(parse().success).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(parse({ name: '   ' }).success).toBe(false);
  });

  it('rejects a name longer than the column allows', () => {
    expect(parse({ name: 'x'.repeat(TEMPLATE_LIMITS.name + 1) }).success).toBe(false);
  });

  it('rejects duplicate block ids', () => {
    const layout = createDefaultLayout();
    layout[1]!.id = layout[0]!.id;
    expect(parse({ layout }).success).toBe(false);
  });

  it('rejects a layout that dropped the item table', () => {
    const layout = createDefaultLayout().filter((block) => block.type !== 'items');
    expect(parse({ layout }).success).toBe(false);
  });

  it('rejects a layout that hid the item table', () => {
    const layout = createDefaultLayout().map((block) =>
      block.type === 'items' ? { ...block, visible: false } : block,
    );
    const result = parse({ layout });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain('layout');
  });

  it('allows decorative blocks to be hidden', () => {
    const layout = createDefaultLayout().map((block) =>
      block.type === 'notes' ? { ...block, visible: false } : block,
    );
    expect(parse({ layout }).success).toBe(true);
  });

  it('rejects an unknown block type', () => {
    const layout = [
      ...createDefaultLayout(),
      { id: 'x', type: 'carousel', visible: true, align: 'left' },
    ];
    expect(parse({ layout }).success).toBe(false);
  });

  it('rejects a colour that is not hex', () => {
    expect(parse({ theme: { ...DEFAULT_THEME, accent: 'greenish' } }).success).toBe(false);
  });

  it('rejects a radius outside 0–32', () => {
    expect(parse({ theme: { ...DEFAULT_THEME, radius: 40 } }).success).toBe(false);
    expect(parse({ theme: { ...DEFAULT_THEME, radius: -1 } }).success).toBe(false);
  });

  it('accepts every wallpaper variant', () => {
    expect(
      parse({ theme: { ...DEFAULT_THEME, wallpaper: { kind: 'solid', color: '#111111' } } })
        .success,
    ).toBe(true);
    expect(
      parse({
        theme: {
          ...DEFAULT_THEME,
          wallpaper: { kind: 'gradient', from: '#111111', to: '#eeeeee', angle: 120 },
        },
      }).success,
    ).toBe(true);
    expect(parse({ theme: { ...DEFAULT_THEME, wallpaper: { kind: 'none' } } }).success).toBe(true);
  });

  it('treats a block written before width existed as full width', () => {
    const result = invoiceTemplateSchema.safeParse({ ...baseTemplate(), layout: legacyLayout() });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.layout.every((block) => block.width === 'full')).toBe(true);
  });

  it('coerces a width that is not one of the three buckets to full width', () => {
    const layout = createDefaultLayout().map((block, index) =>
      index === 0 ? { ...block, width: 'gigantic' } : block,
    );
    const result = invoiceTemplateSchema.safeParse({ ...baseTemplate(), layout });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.layout[0]?.width).toBe('full');
  });

  it('normalises empty optional fields to undefined', () => {
    const result = parse({ defaults: { header: '', content: '', footer: '', notes: '' } });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.defaults.notes).toBeUndefined();
  });

  it('rejects rich-text defaults longer than the column allows', () => {
    const result = parse({
      defaults: { header: 'x'.repeat(TEMPLATE_LIMITS.richText + 1), content: '', footer: '' },
    });
    expect(result.success).toBe(false);
  });

  it('accepts a known business type and null', () => {
    expect(parse({ businessType: 'bengkel-mobil' }).success).toBe(true);
    expect(parse({ businessType: null }).success).toBe(true);
  });

  it('rejects a business type the taxonomy does not define', () => {
    expect(parse({ businessType: 'bengkel-kapal' }).success).toBe(false);
    expect(parse({ businessType: 'otomotif' }).success).toBe(false);
  });
});

describe('invoiceTemplateShapeSchema', () => {
  it('accepts a complete template', () => {
    expect(invoiceTemplateShapeSchema.safeParse(baseTemplate()).success).toBe(true);
  });

  it('falls back to the default theme when a colour is corrupt', () => {
    const result = invoiceTemplateShapeSchema.safeParse({
      ...baseTemplate(),
      theme: { ...DEFAULT_THEME, accent: 'not-a-colour' },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.theme).toEqual(DEFAULT_THEME);
  });

  it('collapses a malformed layout to an empty list', () => {
    const result = invoiceTemplateShapeSchema.safeParse({ ...baseTemplate(), layout: 'nope' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.layout).toEqual([]);
  });

  it('keeps an in-progress name rather than discarding the template', () => {
    const result = invoiceTemplateShapeSchema.safeParse({ ...baseTemplate(), name: '' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.name).toBe('');
  });

  it('repairs an out-of-range align instead of dropping the block', () => {
    const layout = createDefaultLayout().map((block, index) =>
      index === 0 ? { ...block, align: 'sideways' } : block,
    );
    const result = invoiceTemplateShapeSchema.safeParse({ ...baseTemplate(), layout });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.layout[0]?.align).toBe('left');
  });

  it('defaults a stored block with no width to full width', () => {
    const result = invoiceTemplateShapeSchema.safeParse({
      ...baseTemplate(),
      layout: legacyLayout(),
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.layout.every((block) => block.width === 'full')).toBe(true);
  });

  it('repairs a corrupt width instead of dropping the block', () => {
    const layout = createDefaultLayout().map((block, index) =>
      index === 0 ? { ...block, width: 'half' } : block,
    );
    const result = invoiceTemplateShapeSchema.safeParse({ ...baseTemplate(), layout });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.layout[0]?.width).toBe('full');
  });

  it('reads a row written before businessType existed as null', () => {
    const legacy: Record<string, unknown> = { ...baseTemplate() };
    delete legacy.businessType;
    const result = invoiceTemplateShapeSchema.safeParse(legacy);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.businessType).toBeNull();
  });

  it('degrades a business type the taxonomy no longer knows to null', () => {
    const result = invoiceTemplateShapeSchema.safeParse({
      ...baseTemplate(),
      businessType: 'bengkel-kapal',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.businessType).toBeNull();
  });
});
