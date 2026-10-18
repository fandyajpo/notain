import {
  PAYMENT_PROOF_MAX_BYTES,
  PAYMENT_PROOF_MAX_EDGE,
  isHeicFile,
} from '../core/invoice/payment-proof';

/**
 * Client-side preparation of a payment-proof upload.
 *
 * The server only stores jpeg/png/webp (see `PAYMENT_PROOF_STORED_TYPES`),
 * but a customer's phone hands over whatever it shoots: HEIC from an iPhone,
 * a 12-megapixel PNG, a 20 MB screenshot. Re-encoding here — before the
 * upload — is what makes the 5 MB server ceiling reachable on a phone
 * connection and what guarantees the stored file opens in every browser the
 * owner might use. HEIC never leaves the browser: `heic2any` decodes it to
 * JPEG, then the same canvas pipeline resizes and compresses.
 */

/** Result of preparing a file for upload: the bytes to send and their name. */
export type PreparedProof = { file: File };

/**
 * Turns any image the picker accepts into a stored-type file.
 *
 * Throws `Error` with an Indonesian message when the file cannot be decoded
 * (corrupt, unsupported) — the upload card shows that message verbatim.
 */
export async function prepareProofFile(input: File): Promise<PreparedProof> {
  const source = isHeicFile(input) ? await heicToJpeg(input) : input;
  const reencoded = await reencode(source);
  if (reencoded.size > PAYMENT_PROOF_MAX_BYTES) {
    throw new Error('Foto masih terlalu besar. Coba foto dengan resolusi lebih rendah.');
  }
  return { file: reencoded };
}

/** Decodes HEIC/HEIF into a JPEG blob; `heic2any` is lazy-loaded WASM. */
async function heicToJpeg(input: File): Promise<Blob> {
  let convert: typeof import('heic2any')['default'];
  try {
    ({ default: convert } = await import('heic2any'));
  } catch {
    throw new Error('Konversi foto iPhone gagal dimuat. Coba kirim foto JPG biasa.');
  }
  try {
    const result = await convert({ blob: input, toType: 'image/jpeg', quality: 0.9 });
    // heic2any answers with one blob or several (multi-page HEIC); the first
    // page is the photo.
    return Array.isArray(result) ? result[0]! : result;
  } catch {
    throw new Error('Foto iPhone tidak bisa dibaca. Coba foto ulang atau kirim JPG biasa.');
  }
}

/**
 * Resizes to `PAYMENT_PROOF_MAX_EDGE` on the longest side and compresses to
 * WebP (JPEG fallback for browsers that cannot encode it). The result is a
 * new File whose extension matches its type, because the server derives the
 * stored Content-Type from the name.
 */
async function reencode(source: Blob): Promise<File> {
  const bitmap = await decode(source);
  const scale = Math.min(1, PAYMENT_PROOF_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('Browser ini tidak bisa memproses foto. Coba peramban lain.');
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const webp = await canvasToBlob(canvas, 'image/webp');
  const blob = webp ?? (await canvasToBlob(canvas, 'image/jpeg'));
  if (!blob) throw new Error('Foto tidak bisa dikompres. Coba foto lain.');

  const extension = blob.type === 'image/webp' ? 'webp' : 'jpg';
  return new File([blob], `bukti-pembayaran.${extension}`, { type: blob.type });
}

/** Decodes any stored-type blob into a bitmap we can draw and close. */
async function decode(source: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(source);
  } catch {
    throw new Error('Foto tidak bisa dibaca. Pastikan file-nya benar-benar gambar.');
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.85));
}
