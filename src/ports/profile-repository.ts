import type { BusinessProfile } from '../core/profile/model';

/** Persistence port for the organization's business profile. */
export interface ProfileRepository {
  getByOrg(orgId: string): Promise<BusinessProfile | null>;
  /** Upserts the profile of `orgId` (the caller must be a member). */
  save(input: { orgId: string; profile: BusinessProfile }): Promise<BusinessProfile>;
}
