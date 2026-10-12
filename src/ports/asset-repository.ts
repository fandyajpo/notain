export type UploadedAsset = {
  fileId: string;
  /** Publicly readable URL used directly by `<img>` elements. */
  url: string;
};

export type UploadAssetInput = {
  ownerId: string;
  file: File;
};

/**
 * Port for binary assets such as the business logo.
 *
 * Replacing is deliberately not part of this port: the caller uploads first,
 * persists the new id, and only then deletes the previous file, so a failed
 * save can never leave the record pointing at a deleted file. Owning that
 * ordering inside the repository is what used to make it lossy.
 */
export interface AssetRepository {
  uploadLogo(input: UploadAssetInput): Promise<UploadedAsset>;
  remove(fileId: string): Promise<void>;
  /** View URL for a stored file id, or `null` when the id is empty. */
  viewUrl(fileId: string | null | undefined): string | null;
}
