import { ID, Permission } from 'appwrite';
import { APPWRITE } from '../appwrite/config';
import { getStorage } from '../appwrite/client';
import { toAppError } from '../appwrite/errors';
import type { AssetRepository, UploadedAsset, UploadAssetInput } from '../ports/asset-repository';

/**
 * Logos are granted public read so `<img>` tags and PDF generation can load
 * them without carrying an auth header. Upload and delete stay owner-only.
 */
export class AppwriteAssetRepository implements AssetRepository {
  async uploadLogo(input: UploadAssetInput): Promise<UploadedAsset> {
    try {
      const file = await getStorage().createFile({
        bucketId: APPWRITE.assetsBucketId,
        fileId: ID.unique(),
        file: input.file,
        // Public read keeps `<img>` and PDF generation working without a
        // session; delete stays with the owner so only they can replace it.
        permissions: [Permission.read('any'), Permission.delete(`user:${input.ownerId}`)],
      });

      return { fileId: file.$id, url: this.viewUrl(file.$id) ?? '' };
    } catch (error) {
      throw toAppError(error);
    }
  }

  async remove(fileId: string): Promise<void> {
    try {
      await getStorage().deleteFile({
        bucketId: APPWRITE.assetsBucketId,
        fileId,
      });
    } catch (error) {
      if (isNotFound(error)) return;
      throw toAppError(error);
    }
  }

  viewUrl(fileId: string | null | undefined): string | null {
    if (!fileId) return null;
    return getStorage().getFileView({
      bucketId: APPWRITE.assetsBucketId,
      fileId,
    });
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
