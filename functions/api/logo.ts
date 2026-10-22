import {
  LOGO_CONTENT_TYPE_BY_EXT,
  LOGO_MAX_BYTES,
  logoExtension,
} from '../../src/core/profile/logo';
import { verifySession } from '../_lib/appwrite';
import { apiError, json } from '../_lib/http';
import { enforceLimit } from '../_lib/quota';
import type { Env, PagesFunction } from '../_lib/types';

/**
 * Multipart framing around a 2 MB file is small, but a client that ignores the
 * limit must not get to stream megabytes before we notice.
 */
const MAX_REQUEST_BYTES = LOGO_MAX_BYTES + 64 * 1024;

/**
 * Object keys are the id the profile stores, so `profileSchema` caps them at
 * 64 characters: `logos_`(6) + owner(36 max) + `_`(1) + 14 hex + `.` + ext(4)
 * = 62. The owner is embedded for human debugging and repeated in
 * `customMetadata.owner`, which is what delete actually trusts — a bare string
 * prefix can be confused by one user id that extends another.
 */
const RANDOM_HEX_LENGTH = 14;

/**
 * `POST /api/logo` — store one logo for the signed-in user.
 *
 * Reading stays public (`GET /api/logo/:key`), but writing and deleting need a
 * session: without one this would be an open, billable write into the
 * account's R2 bucket.
 */
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== 'POST') {
    return apiError(405, 'method_not_allowed', 'Metode ini tidak didukung.', { allow: 'POST' });
  }

  const session = await verifySession(request, env);
  if (!session) {
    return apiError(401, 'unauthenticated', 'Silakan masuk terlebih dahulu.');
  }

  // One logo upload is a real R2 Class A/B pair; replacements are rare in
  // practice, so a small per-user per-hour bucket keeps a scripted flood from
  // eating the R2 free allowance (1M Class A / 10M Class B per month — the
  // only metered-and-billed overage in this stack).
  const limited = enforceLimit('logo-upload', session.userId, env);
  if (limited) return limited;

  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null && Number(declaredLength) > MAX_REQUEST_BYTES) {
    return apiError(413, 'validation', 'Logo terlalu besar. Maksimal 2 MB.');
  }

  let file: File;
  try {
    const form = await request.formData();
    const entry = form.get('file');
    if (!(entry instanceof File)) {
      return apiError(400, 'validation', 'File logo belum dipilih.');
    }
    file = entry;
  } catch {
    return apiError(400, 'validation', 'Berkas yang dikirim tidak bisa dibaca.');
  }

  const extension = logoExtension(file.name);
  const contentType = extension === null ? undefined : LOGO_CONTENT_TYPE_BY_EXT[extension];
  if (!extension || !contentType) {
    return apiError(400, 'validation', 'Format logo harus PNG, JPG, SVG, WEBP, atau ICO.');
  }
  if (file.size > LOGO_MAX_BYTES) {
    return apiError(413, 'validation', 'Logo terlalu besar. Maksimal 2 MB.');
  }

  const fileId = `logos_${session.userId}_${randomHex()}.${extension}`;
  await env.LOGOS.put(fileId, file.stream(), {
    httpMetadata: { contentType },
    customMetadata: { owner: session.userId },
  });

  return json(200, { fileId });
};

function randomHex(): string {
  const bytes = new Uint8Array(RANDOM_HEX_LENGTH / 2);
  crypto.getRandomValues(bytes);
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return hex;
}
