import type { BusinessProfile } from '../core/profile/model';

/** Persistence port for the per-user business profile. */
export interface ProfileRepository {
  getByOwner(ownerId: string): Promise<BusinessProfile | null>;
  /** Upserts the profile for `ownerId`. */
  save(input: { ownerId: string; profile: BusinessProfile }): Promise<BusinessProfile>;
}
