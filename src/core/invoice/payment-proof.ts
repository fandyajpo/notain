/**
 * Rules a payment-proof file has to satisfy.
 *
 * Shared on purpose: the browser checks them (and re-encodes the image) before
 * uploading so the customer gets instant feedback and the stored file is
 * guaranteed openable, and the Pages Function in `functions/api/invoice/`
 * checks them again because anything a browser enforces is only advisory.
 * Keep this module free of Appwrite, React and `import.meta` — it is bundled
 * into a Worker.
 */

/** Hard ceiling on the uploaded file. Larger uploads are rejected outright. */
export const PAYMENT_PROOF_MAX_BYTES = 5 * 1024 * 1024;

/**
 * What the server will store.
 *
 * The client re-encodes every upload (HEIC included) to one of these before
 * sending, so the stored file always renders in every browser. HEIC is
 * deliberately absent: no mainstream browser outside Safari can display it,
 * and the Worker cannot decode it either.
 */
export const PAYMENT_PROOF_STORED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/**
 * Extension → content type for what the server will store.
 *
 * Derived from the file *name* rather than the browser-supplied `File.type`,
 * because the stored `Content-Type` is what the response is served with and
 * that must never be attacker-chosen. Every value here is also in
 * `PAYMENT_PROOF_STORED_TYPES`.
 */
export const PAYMENT_PROOF_CONTENT_TYPE_BY_EXT: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/**
 * `<input accept>` for the picker: every image type a phone can produce,
 * HEIC/HEIF included, plus the raw extensions for pickers that key off those.
 * The client re-encodes anything outside `PAYMENT_PROOF_STORED_TYPES`.
 */
export const PAYMENT_PROOF_ACCEPT = [
  'image/*',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.heic',
  '.heif',
].join(',');

/**
 * Longest edge of the re-encoded upload, in pixels. A payment screenshot at
 * 1600px stays legible for zooming into an amount while keeping the file well
 * under the size ceiling.
 */
export const PAYMENT_PROOF_MAX_EDGE = 1600;

/** R2 key prefix, mirroring `logos_` — kept human-findable in the bucket. */
export const PAYMENT_PROOF_KEY_PREFIX = 'proofs_';

/** Lowercase extension of `fileName`, or `null` when it is not a stored type. */
export function paymentProofExtension(fileName: string): string | null {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0 || dot === fileName.length - 1) return null;
  const ext = fileName.slice(dot + 1).toLowerCase();
  return Object.hasOwn(PAYMENT_PROOF_CONTENT_TYPE_BY_EXT, ext) ? ext : null;
}

/** True when the file is a HEIC/HEIF image the client must convert first. */
export function isHeicFile(file: { name: string; type: string }): boolean {
  const type = file.type.toLowerCase();
  if (type === 'image/heic' || type === 'image/heif') return true;
  return /\.(heic|heif)$/i.test(file.name);
}
