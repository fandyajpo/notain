import type { BusinessSubtypeSlug } from './taxonomy';
import { businessSubtypeSlugSchema } from './schema';
import type { BusinessProfile } from '../profile/model';

/**
 * The business identity an invoice renders — the person's contact profile
 * (`profiles/<orgId>`) joined with the organization it belongs to
 * (`organizations/<orgId>`).
 *
 * This is the only place the two halves meet. The profile owns the contact
 * fields and the logo; the organization owns the business name and type.
 * Invoice letterheads, template samples and the print view all take a
 * `BusinessIssuer`, so none of them needs to know which half a field came
 * from — and neither half is duplicated in storage.
 */
export type BusinessIssuer = {
  /** The person behind the business — the letterhead's fallback name. */
  name: string;
  /** The organization's display name; what the letterhead leads with. */
  businessName: string;
  phone: string;
  address?: string;
  email?: string;
  logoUrl?: string | null;
  /** The org's trade, driving detail rows and the public-site template. */
  businessType: BusinessSubtypeSlug | null;
};

/** The org fields the issuer needs — a structural subset of `OrgView`. */
export type OrgIdentity = {
  name?: string;
  businessType?: string | null;
};

/**
 * Joins a profile with its org. Missing pieces degrade to blanks rather than
 * throwing: a half-loaded profile, or an org whose type was never picked,
 * still renders a usable letterhead.
 */
export function toBusinessIssuer(
  profile: BusinessProfile | null | undefined,
  org: OrgIdentity | null | undefined,
): BusinessIssuer {
  return {
    name: profile?.name ?? '',
    businessName: org?.name ?? '',
    phone: profile?.phone ?? '',
    address: profile?.address,
    email: profile?.email,
    logoUrl: profile?.logoUrl ?? null,
    businessType: parseSubtypeSlug(org?.businessType),
  };
}

/** Unknown or retired slugs degrade to `null` instead of lying about the type. */
function parseSubtypeSlug(value: unknown): BusinessSubtypeSlug | null {
  const parsed = businessSubtypeSlugSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** The demo issuer the landing page and template previews fall back to. */
export const SAMPLE_ISSUER: BusinessIssuer = {
  name: 'Warung Maju Jaya',
  businessName: 'Warung Maju Jaya',
  phone: '081234567890',
  address: 'Jl. Melati No. 12, Bandung',
  email: 'halo@warungmaju.id',
  logoUrl: null,
  businessType: null,
};
