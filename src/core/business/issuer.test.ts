import { describe, expect, it } from 'vite-plus/test';
import { toBusinessIssuer, type OrgIdentity } from './issuer';
import { BUSINESS_SUBTYPE_SLUGS } from './taxonomy';
import { EMPTY_PROFILE } from '../profile/model';

describe('toBusinessIssuer', () => {
  it('joins the profile with the org name and a known business type', () => {
    const slug = BUSINESS_SUBTYPE_SLUGS[0];
    const issuer = toBusinessIssuer(
      { ...EMPTY_PROFILE, name: 'Budi', phone: '081234567890' },
      { name: 'Kopi Uji', businessType: slug },
    );
    expect(issuer.name).toBe('Budi');
    expect(issuer.businessName).toBe('Kopi Uji');
    expect(issuer.businessType).toBe(slug);
  });

  it('degrades an unknown or retired slug to null instead of trusting the row', () => {
    expect(
      toBusinessIssuer(null, { name: 'Kopi Uji', businessType: 'slug-yang-sudah-dihapus' })
        .businessType,
    ).toBeNull();
    // A database row is untyped at runtime: a non-string must degrade too.
    const badRow = { name: 'Kopi Uji', businessType: 42 } as unknown as OrgIdentity;
    expect(toBusinessIssuer(null, badRow).businessType).toBeNull();
    expect(toBusinessIssuer(null, { name: 'Kopi Uji' }).businessType).toBeNull();
  });

  it('still renders a usable issuer when either half is missing', () => {
    const issuer = toBusinessIssuer(undefined, undefined);
    expect(issuer.name).toBe('');
    expect(issuer.businessName).toBe('');
    expect(issuer.logoUrl).toBeNull();
  });
});
