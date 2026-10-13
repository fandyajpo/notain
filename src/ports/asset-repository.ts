export type UploadedAsset = {
  fileId: string;
  /** Publicly readable URL used directly by `<img>` elements. */
  url: string;
};

export type UploadAssetInput = {
  file: File;
};

/**
 * Port for binary assets such as the business logo.
 *
 * The owner is deliberately absent from the input: every implementation
 * resolves it from the caller's own session, so an upload can never claim to
 * belong to somebody else.
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
