import { getBusinessPreset } from '../business/presets';
import type { BusinessSubtypeSlug } from '../business/taxonomy';
import { getBuiltinTemplate } from './builtins';
import { DEFAULT_THEME, type AuthoredTemplate, type TemplateDefaults } from './model';

/**
 * What a brand-new template starts as, before anyone edits it.
 *
 * Two seed sources, never mixed:
 *   - a built-in copy (`?from=classic`) keeps that style's layout, theme and
 *     prose — the user picked it for its look — while still carrying the
 *     business type so picker grouping and sample items know what it is;
 *   - a blank template takes the whole skeleton from the business preset: the
 *     block layout recipe and the prose defaults, so it reads like an invoice
 *     from that trade the moment it opens.
 *
 * `businessType === null` (skipped the step, or a profile that never chose)
 * falls back to the general preset — a usable neutral template, never nothing.
 *
 * Pure: every call returns fresh objects, so two templates never share a block
 * instance and editing one cannot mutate a preset.
 */
export function seedTemplateForBusiness(
  seedId?: string | null,
  businessType: BusinessSubtypeSlug | null = null,
): AuthoredTemplate {
  const seed = seedId ? getBuiltinTemplate(seedId) : undefined;
  const preset = getBusinessPreset(businessType);

  return {
    name: seed ? `${seed.name} (salinan)` : 'Template baru',
    layout: seed ? seed.layout.map((block) => ({ ...block })) : preset.layout(),
    theme: seed ? { ...seed.theme, wallpaper: { ...seed.theme.wallpaper } } : { ...DEFAULT_THEME },
    defaults: seed ? { ...seed.defaults } : defaultsForBusiness(businessType),
    businessType,
  };
}

/**
 * The example prose a business type ships with — what the template editor
 * swaps into "Teks default" when the user changes "Jenis bisnis" after the
 * seed. Always a fresh copy, so form edits never reach the preset itself.
 */
export function defaultsForBusiness(
  businessType: BusinessSubtypeSlug | null = null,
): TemplateDefaults {
  return { ...getBusinessPreset(businessType).prose };
}
