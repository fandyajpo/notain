import type { R2Bucket, R2Object } from './types';

const LOCK_PREFIX = 'proof_upload_lock_';
const LOCK_LEASE_MS = 60_000;

export type ProofUploadLock = { key: string; etag: string };

export type ProofLockResult =
  | { kind: 'acquired'; lock: ProofUploadLock }
  | { kind: 'busy' }
  | { kind: 'unavailable' };

/**
 * Acquires a short per-invoice lock with R2 conditional writes. A released or
 * expired lock can only be replaced if the ETag we inspected is still current,
 * so two competing uploads cannot both become the owner of the lock.
 */
export async function acquireProofUploadLock(
  bucket: R2Bucket,
  invoiceId: string,
): Promise<ProofLockResult> {
  const key = `${LOCK_PREFIX}${invoiceId}`;
  const token = crypto.randomUUID();
  let current: R2Object | null;
  try {
    current = await bucket.head(key);
  } catch {
    return { kind: 'unavailable' };
  }

  let written: R2Object | null;
  try {
    if (!current) {
      written = await bucket.put(key, token, {
        onlyIf: { etagDoesNotMatch: '*' },
        customMetadata: { token },
      });
    } else {
      const released = current.customMetadata?.released === 'true';
      const expired =
        current.uploaded instanceof Date &&
        Date.now() - current.uploaded.getTime() >= LOCK_LEASE_MS;
      if (!released && !expired) return { kind: 'busy' };
      if (!current.etag) return { kind: 'unavailable' };
      written = await bucket.put(key, token, {
        onlyIf: { etagMatches: current.etag },
        customMetadata: { token },
      });
    }
  } catch {
    return { kind: 'unavailable' };
  }

  if (!written) return { kind: 'busy' };
  if (!written.etag) return { kind: 'unavailable' };
  return { kind: 'acquired', lock: { key, etag: written.etag } };
}

/** Releases only the lock version this request acquired; otherwise it expires. */
export async function releaseProofUploadLock(
  bucket: R2Bucket,
  lock: ProofUploadLock,
): Promise<void> {
  try {
    await bucket.put(lock.key, '', {
      onlyIf: { etagMatches: lock.etag },
      customMetadata: { released: 'true' },
    });
  } catch (error) {
    console.error(
      'proof: could not release upload lock:',
      error instanceof Error ? error.message : 'unknown error',
    );
  }
}
