/**
 * The industry layer of the public business page (`/site/<ownerId>`).
 *
 * A business already picks one subtype of the 175-entry taxonomy
 * (`profiles.businessType`, see `core/business/taxonomy`) — the public page
 * reuses that choice instead of asking for a second one, so template
 * selection persists with the existing profile editor for free: save a type
 * in settings, the public page follows.
 *
 * This module maps subtype → one of the eight industry templates the product
 * ships (plus `general` as the honest fallback for every subtype outside the
 * eight, and for profiles that never picked a type). Pure data + one
 * resolver — no framework, no storage.
 *
 * Slugs are the persisted taxonomy slugs: a mapping only changes here when
 * the taxonomy gains or renames a subtype. Unknown slugs degrade to
 * `general`, never throw (same contract as `getBusinessSubtype`).
 */

import type { BusinessSubtypeSlug } from '../business/taxonomy';

export type IndustryId =
  | 'catering'
  | 'designer'
  | 'developer'
  | 'warung'
  | 'online-shop'
  | 'freelancer'
  | 'repair'
  | 'salon'
  | 'general';

/** Display labels — Indonesian, matching the taxonomy's own labelling. */
export const INDUSTRY_LABELS: Record<IndustryId, string> = {
  catering: 'Katering',
  designer: 'Desain & Kreatif',
  developer: 'Developer & Teknologi',
  warung: 'Warung & Toko Lokal',
  'online-shop': 'Online Shop',
  freelancer: 'Freelancer & Konsultan',
  repair: 'Jasa Servis & Reparasi',
  salon: 'Salon & Barbershop',
  general: 'Umum',
};

/**
 * Subtypes that render each industry template. Deliberately explicit rather
 * than derived from category: several categories straddle two industries
 * (Makanan dan Minuman splits between warung and katering; Jasa splits
 * between freelancer and repair), and an explicit list is the only shape a
 * test can assert "every taxonomy subtype lands somewhere sensible" against.
 *
 * Every subtype NOT listed here falls through to `general` — that is the
 * contract, not an oversight.
 */
const INDUSTRY_SUBTYPES: Record<Exclude<IndustryId, 'general'>, readonly BusinessSubtypeSlug[]> = {
  catering: ['katering'],
  designer: [
    'desain-grafis',
    'desain-interior',
    'ilustrasi-seni',
    'media-digital',
    'periklanan',
    'fotografi',
    'videografi',
    'production-house',
  ],
  developer: [
    'software-development',
    'web-development',
    'digital-agency',
    'it-services',
    'saas',
    'hosting-domain',
  ],
  warung: [
    'warung-makan',
    'restoran',
    'kafe',
    'kedai-kopi',
    'usaha-minuman',
    'usaha-makanan-rumahan',
    'bakery-pastry',
    'food-truck',
    'frozen-food',
    'perdagangan-umum',
    'retail',
  ],
  'online-shop': ['e-commerce', 'marketplace-seller', 'toko-online', 'reseller', 'dropshipper'],
  freelancer: [
    'freelancer',
    'konsultan',
    'jasa-profesional',
    'jasa-personal',
    'jasa-administrasi',
    'content-creator',
    'penulisan',
    'penerjemahan',
    'les-privat',
    'manajemen-influencer',
    'digital-marketing',
  ],
  repair: [
    'jasa-reparasi',
    'servis-elektronik',
    'bengkel-mobil',
    'bengkel-motor',
    'cuci-kendaraan',
    'salon-detailing-kendaraan',
    'modifikasi-kendaraan',
    'jasa-perawatan',
    'laundry',
    'instalasi-teknik',
  ],
  salon: [
    'salon',
    'barbershop',
    'klinik-kecantikan',
    'makeup-artist',
    'spa-wellness',
    'nail-art',
    'perawatan-tubuh',
    'skincare',
    'perawatan-hewan',
  ],
};

/** Subtype slug → industry, built once from the explicit lists above. */
const SUBTYPE_TO_INDUSTRY: ReadonlyMap<string, IndustryId> = new Map(
  (
    Object.entries(INDUSTRY_SUBTYPES) as Array<[Exclude<IndustryId, 'general'>, readonly string[]]>
  ).flatMap(([industry, subtypes]) => subtypes.map((slug) => [slug, industry] as const)),
);

/**
 * The industry template for a stored subtype slug.
 *
 * `null` (no type chosen), a slug the taxonomy no longer knows, and any
 * subtype outside the eight industries all resolve to `general` — a neutral
 * page built from the same primitives, never a crash and never a wrong
 * industry's skin.
 */
export function industryForSubtype(slug: string | null | undefined): IndustryId {
  if (!slug) return 'general';
  return SUBTYPE_TO_INDUSTRY.get(slug) ?? 'general';
}

/** The subtype slugs each industry claims — exported for the mapping test. */
export function industrySubtypes(industry: Exclude<IndustryId, 'general'>): readonly string[] {
  return INDUSTRY_SUBTYPES[industry];
}
