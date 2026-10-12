import type { BusinessProfile } from '../core/profile/model';
import { APPWRITE } from '../appwrite/config';
import { getTables } from '../appwrite/client';
import { toAppError } from '../appwrite/errors';
import { ownerRowPermissions } from '../appwrite/permissions';
import { profileRowToDomain, profileToRowData, type ProfileRow } from '../appwrite/mappers';
import type { ProfileRepository } from '../ports/profile-repository';

/**
 * The profile row uses the owner's user id as its row id, which gives us
 * one profile per user without an extra lookup.
 */
export class AppwriteProfileRepository implements ProfileRepository {
  async getByOwner(ownerId: string): Promise<BusinessProfile | null> {
    try {
      const row = await getTables().getRow<ProfileRow>({
        databaseId: APPWRITE.databaseId,
        tableId: APPWRITE.profilesTableId,
        rowId: ownerId,
      });
      return profileRowToDomain(row);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw toAppError(error);
    }
  }

  async save(input: { ownerId: string; profile: BusinessProfile }): Promise<BusinessProfile> {
    const data = profileToRowData(input.profile);
    try {
      const row = await getTables().upsertRow<ProfileRow>({
        databaseId: APPWRITE.databaseId,
        tableId: APPWRITE.profilesTableId,
        rowId: input.ownerId,
        data,
        permissions: ownerRowPermissions(input.ownerId),
      });
      return profileRowToDomain(row);
    } catch (error) {
      if (isNotFound(error)) {
        const row = await getTables().createRow<ProfileRow>({
          databaseId: APPWRITE.databaseId,
          tableId: APPWRITE.profilesTableId,
          rowId: input.ownerId,
          data,
          permissions: ownerRowPermissions(input.ownerId),
        });
        return profileRowToDomain(row);
      }
      throw toAppError(error);
    }
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 404
  );
}
