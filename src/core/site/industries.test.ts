import { describe, expect, it } from 'vite-plus/test';
import { BUSINESS_SUBTYPE_SLUGS, businessSubtypeLabel } from '../business/taxonomy';
import {
  INDUSTRY_LABELS,
  industryForSubtype,
  industrySubtypes,
  type IndustryId,
} from './industries';

const MAPPED_INDUSTRIES = (Object.keys(INDUSTRY_LABELS) as IndustryId[]).filter(
  (id) => id !== 'general',
);

/** Every subtype each non-general industry claims, flattened once. */
const DECLARED = MAPPED_INDUSTRIES.flatMap((industry) =>
  industrySubtypes(industry).map((slug) => ({ slug, industry })),
);

describe('industryForSubtype', () => {
  it('maps one representative subtype of each of the eight industries', () => {
    expect(industryForSubtype('katering')).toBe('catering');
    expect(industryForSubtype('desain-grafis')).toBe('designer');
    expect(industryForSubtype('web-development')).toBe('developer');
    expect(industryForSubtype('warung-makan')).toBe('warung');
    expect(industryForSubtype('e-commerce')).toBe('online-shop');
    expect(industryForSubtype('freelancer')).toBe('freelancer');
    expect(industryForSubtype('bengkel-motor')).toBe('repair');
    expect(industryForSubtype('barbershop')).toBe('salon');
  });

  it('degrades to general for missing, unknown and unmapped slugs', () => {
    expect(industryForSubtype(null)).toBe('general');
    expect(industryForSubtype(undefined)).toBe('general');
    // A slug the taxonomy has since renamed must not throw.
    expect(industryForSubtype('slug-yang-tidak-ada')).toBe('general');

    const mapped = new Set(DECLARED.map((entry) => entry.slug));
    const unmapped = BUSINESS_SUBTYPE_SLUGS.find((slug) => !mapped.has(slug));
    // The fallback exists because most of the 175 subtypes sit outside the
    // eight industries — if that ever stops being true, the assertion flips.
    expect(unmapped).toBeDefined();
    expect(industryForSubtype(unmapped)).toBe('general');
  });

  it('lands every taxonomy subtype on a labelled, valid industry', () => {
    for (const slug of BUSINESS_SUBTYPE_SLUGS) {
      const industry = industryForSubtype(slug);
      expect(INDUSTRY_LABELS[industry]).toBeTruthy();
      // The subtype itself still resolves a display label for the page.
      expect(businessSubtypeLabel(slug)).toBeTruthy();
    }
  });

  it('declares only real taxonomy subtypes, with no subtype claimed twice', () => {
    const seen = new Map<string, IndustryId>();
    for (const { slug, industry } of DECLARED) {
      expect(BUSINESS_SUBTYPE_SLUGS).toContain(slug);
      const previous = seen.get(slug);
      expect(previous).toBeUndefined();
      seen.set(slug, industry);
      // The declaration and the resolver can never disagree.
      expect(industryForSubtype(slug)).toBe(industry);
    }
  });
});
