import {
  PAYMENT_PROOF_CONTENT_TYPE_BY_EXT,
  PAYMENT_PROOF_MAX_BYTES,
  PAYMENT_PROOF_KEY_PREFIX,
  paymentProofExtension,
} from '../../../../src/core/invoice/payment-proof';
import { ID_SEGMENT_PATTERN } from '../../../../src/lib/edit-route';
import { checkTurnstile } from '../../../_lib/turnstile';
import { verifySession } from '../../../_lib/appwrite';
import { getRow, patchRow, tableAuth } from '../../../_lib/rows';
import { apiError, json } from '../../../_lib/http';
import type { Env, PagesFunction } from '../../../_lib/types';

/**
 * Multipart framing around a 5 MB file is small, but a client that ignores
 * the limit must not get to stream megabytes before we notice.
 */
const MAX_REQUEST_BYTES = PAYMENT_PROOF_MAX_BYTES + 64 * 1024;

/**
 * Same reasoning as `logos_`: `proofs_`(7) + invoice id(≤64) + `_`(1) +
 * 14 hex + `.` + ext(4) = 90, under the column's 128-char cap.
 */
const RANDOM_HEX_LENGTH = 14;

/**
 * `POST /api/invoice/<id>/proof` — upload a payment-proof screenshot for one
 * invoice. Two callers, two contracts:
 *
 * **The customer** (no session, holds the capability URL):
 *
 * 1. **Turnstile** — the one gate a public write can have; the token is
 *    verified server-side before a single byte is stored.
 * 2. **Status gate** — once the invoice is Lunas or Batal the question is
 *    settled either way, so the endpoint answers 409 and the card on the
 *    public page stops offering the form altogether.
 * 3. **One-shot** — the invoice row's `paymentProofKey` is checked *and*
 *    written with the API key, so once a proof exists the endpoint answers
 *    409 until the owner deletes it. The row is the source of truth, not the
 *    bucket: a stray object without a row reference cannot resurrect the
 *    upload form.
 *
 * **The owner** (session JWT, from the dashboard): no status gate and no
 * one-shot — the owner may attach or replace a proof even on a Lunas/Batal
 * invoice (a corrected screenshot for the books). The session must belong to
 * the invoice's owner, and a replaced proof's old object is removed after the
 * row points at the new key.
 *
 * **Re-encoding upstream** — the browser always sends jpeg/png/webp (HEIC is
 * converted client-side before this ever runs), so the stored file is
 * guaranteed openable and the extension → content type mapping below can
 * trust the file name.
 */
export const onRequest: PagesFunction<Env> = async ({ request, params, env }) => {
  if (request.method !== 'POST') {
    return apiError(405, 'method_not_allowed', 'Metode ini tidak didukung.', { allow: 'POST' });
  }

  const id = typeof params.id === 'string' ? params.id : '';
  if (!ID_SEGMENT_PATTERN.test(id)) {
    return apiError(404, 'not_found', 'Invoice tidak ditemukan.');
  }

  const auth = tableAuth(env);
  if (!auth) {
    return apiError(500, 'validation', 'Konfigurasi server tidak lengkap.');
  }

  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null && Number(declaredLength) > MAX_REQUEST_BYTES) {
    return apiError(413, 'validation', 'Bukti pembayaran terlalu besar. Maksimal 5 MB.');
  }

  // Owner mode is opt-in via the header the dashboard already sends; without
  // it the request is the customer's and every public-write gate applies.
  const owner = request.headers.has('authorization') ? await verifySession(request, env) : null;
  if (request.headers.has('authorization') && !owner) {
    return apiError(401, 'unauthenticated', 'Silakan masuk terlebih dahulu.');
  }

  let file: File;
  let turnstileToken: string;
  try {
    const form = await request.formData();
    const entry = form.get('file');
    if (!(entry instanceof File)) {
      return apiError(400, 'validation', 'File bukti pembayaran belum dipilih.');
    }
    file = entry;
    turnstileToken = form.get('turnstileToken')?.toString() ?? '';
  } catch {
    return apiError(400, 'validation', 'Berkas yang dikirim tidak bisa dibaca.');
  }

  if (!owner) {
    const gate = await checkTurnstile(request, env, turnstileToken);
    if (gate.state !== 'ok') {
      return turnstileError(gate.state);
    }
  }

  const extension = paymentProofExtension(file.name);
  const contentType = extension === null ? undefined : PAYMENT_PROOF_CONTENT_TYPE_BY_EXT[extension];
  if (!extension || !contentType) {
    return apiError(400, 'validation', 'Format bukti pembayaran harus PNG, JPG, atau WEBP.');
  }
  if (file.size > PAYMENT_PROOF_MAX_BYTES) {
    return apiError(413, 'validation', 'Bukti pembayaran terlalu besar. Maksimal 5 MB.');
  }

  const row = await getRow(auth, 'invoices', id);
  if (!row) return apiError(404, 'not_found', 'Invoice tidak ditemukan.');

  if (owner) {
    if (String(row.ownerId ?? '') !== owner.userId) {
      return apiError(403, 'unauthenticated', 'Kamu tidak punya akses ke invoice ini.');
    }
  } else {
    if (row.status === 'paid' || row.status === 'void') {
      return apiError(
        409,
        'conflict',
        row.status === 'paid'
          ? 'Invoice ini sudah ditandai Lunas — unggah bukti pembayaran sudah ditutup.'
          : 'Invoice ini sudah dibatalkan — unggah bukti pembayaran sudah ditutup.',
      );
    }
    if (typeof row.paymentProofKey === 'string' && row.paymentProofKey !== '') {
      return apiError(
        409,
        'conflict',
        'Bukti pembayaran sudah pernah diunggah untuk invoice ini.',
      );
    }
  }

  const previousKey =
    typeof row.paymentProofKey === 'string' && row.paymentProofKey !== ''
      ? row.paymentProofKey
      : null;
  const key = `${PAYMENT_PROOF_KEY_PREFIX}${id}_${randomHex()}.${extension}`;
  const uploadedAt = new Date().toISOString();
  await env.LOGOS.put(key, file.stream(), {
    httpMetadata: { contentType },
    customMetadata: { owner: String(row.ownerId ?? ''), invoice: id },
  });

  // The row is what the one-shot check reads, so it is written after the
  // object; if this fails the object is removed again rather than left as an
  // orphan nobody's form knows about.
  const saved = await patchRow(auth, 'invoices', id, {
    paymentProofKey: key,
    paymentProofUploadedAt: uploadedAt,
  });
  if (!saved) {
    await env.LOGOS.delete(key).catch(() => undefined);
    return apiError(500, 'validation', 'Gagal menyimpan bukti pembayaran. Coba lagi.');
  }

  // Owner replace: only once the row points at the new proof does the
  // superseded object go away, so a reader mid-flight never sees a gap.
  if (owner && previousKey && previousKey !== key) {
    await env.LOGOS.delete(previousKey).catch(() => undefined);
  }

  return json(200, { key, uploadedAt, url: proofUrl(key) });
};

function proofUrl(key: string): string {
  return `/api/proof/${encodeURIComponent(key)}`;
}

function turnstileError(state: 'unconfigured' | 'missing_token' | 'unreachable' | 'rejected') {
  switch (state) {
    case 'unconfigured':
      return apiError(500, 'validation', 'Verifikasi keamanan belum dikonfigurasi.');
    case 'missing_token':
    case 'rejected':
      return apiError(400, 'validation', 'Verifikasi keamanan gagal. Muat ulang lalu coba lagi.');
    case 'unreachable':
      return apiError(502, 'validation', 'Verifikasi keamanan gagal dihubungi.');
  }
}

function randomHex(): string {
  const bytes = new Uint8Array(RANDOM_HEX_LENGTH / 2);
  crypto.getRandomValues(bytes);
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return hex;
}
