import { PAYMENT_PROOF_KEY_PREFIX } from '../../../src/core/invoice/payment-proof';
import { verifySession } from '../../_lib/appwrite';
import { acquireProofUploadLock, releaseProofUploadLock } from '../../_lib/proof-lock';
import { patchRow, tableAuth } from '../../_lib/rows';
import { apiError, fetchUpstream as fetch, IMAGE_RESPONSE_HEADERS } from '../../_lib/http';
import type { Env, PagesFunction } from '../../_lib/types';

/**
 * `GET /api/proof/:key`  — serve the uploaded image. Unauthenticated on
 *   purpose, for the same reasons as `GET /api/logo/:key`: it has to load
 *   inside `<img>` in the customer's print view and any PDF opened from it,
 *   none of which carry an auth header. Keys carry 56 bits of randomness and
 *   are never listed, so this is a capability URL, not an enumeration hole.
 *
 * `DELETE /api/proof/:key` — the owner removes a proof so the customer can
 *   upload a corrected one. Requires a session, the object's
 *   `customMetadata.owner` matching that session's user, and a successful
 *   invoice-pointer clear before the object can be removed.
 */
export const onRequest: PagesFunction<Env> = async ({ request, params, env }) => {
  const key = params.key;
  if (typeof key !== 'string' || !key.startsWith(PAYMENT_PROOF_KEY_PREFIX)) {
    return apiError(404, 'not_found', 'Bukti pembayaran tidak ditemukan.');
  }

  if (request.method === 'GET') return read(key, env);
  if (request.method === 'DELETE') return remove(request, key, env);

  return apiError(405, 'method_not_allowed', 'Metode ini tidak didukung.', {
    allow: 'GET, DELETE',
  });
};

async function read(key: string, env: Env): Promise<Response> {
  const object = await env.LOGOS.get(key);
  if (!object) return apiError(404, 'not_found', 'Bukti pembayaran tidak ditemukan.');

  return new Response(object.body, {
    headers: {
      ...IMAGE_RESPONSE_HEADERS,
      // Every upload mints a fresh key, so this URL never changes for a
      // given proof and may be cached as long as the browser likes.
      'cache-control': 'public, max-age=31536000, immutable',
      'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      'content-length': String(object.size),
    },
  });
}

async function remove(request: Request, key: string, env: Env): Promise<Response> {
  const session = await verifySession(request, env);
  if (!session) return apiError(401, 'unauthenticated', 'Silakan masuk terlebih dahulu.');

  let object = await env.LOGOS.head(key);
  // A missing object and someone else's object both answer 404: replying 403
  // for the latter would confirm the key exists to a caller who does not own it.
  if (!object || object.customMetadata?.owner !== session.userId) {
    return apiError(404, 'not_found', 'Bukti pembayaran tidak ditemukan.');
  }

  const invoiceId = object.customMetadata?.invoice;
  if (invoiceId) {
    const auth = tableAuth(env);
    if (!auth) return apiError(503, 'unavailable', 'Layanan sedang tidak tersedia.');
    const lockResult = await acquireProofUploadLock(env.LOGOS, invoiceId);
    if (lockResult.kind === 'unavailable') {
      return apiError(503, 'unavailable', 'Bukti pembayaran tidak bisa dihapus saat ini. Coba lagi.');
    }
    if (lockResult.kind === 'busy') {
      return apiError(409, 'conflict', 'Unggahan bukti sedang diproses. Coba lagi sebentar.');
    }

    try {
      object = await env.LOGOS.head(key);
      if (!object || object.customMetadata?.owner !== session.userId) {
        return apiError(404, 'not_found', 'Bukti pembayaran tidak ditemukan.');
      }

      let invoiceResponse: Response;
      try {
        invoiceResponse = await fetch(
          `${auth.endpoint}/databases/notain_db/collections/invoices/documents/${encodeURIComponent(invoiceId)}`,
          { headers: auth.headers },
        );
      } catch {
        return apiError(503, 'unavailable', 'Invoice tidak bisa diverifikasi. Bukti tetap tersimpan.');
      }

      if (invoiceResponse.status !== 404) {
        if (!invoiceResponse.ok) {
          return apiError(503, 'unavailable', 'Invoice tidak bisa diverifikasi. Bukti tetap tersimpan.');
        }
        const invoice = (await invoiceResponse.json().catch(() => null)) as {
          ownerId?: unknown;
          paymentProofKey?: unknown;
        } | null;
        if (!invoice) {
          return apiError(503, 'unavailable', 'Invoice tidak bisa diverifikasi. Bukti tetap tersimpan.');
        }
        if (invoice.ownerId !== session.userId) {
          return apiError(404, 'not_found', 'Bukti pembayaran tidak ditemukan.');
        }
        // The row is authoritative. Keep the object if clearing its pointer
        // fails, so the invoice never points at a deleted proof.
        if (invoice.paymentProofKey === key) {
          const cleared = await patchRow(auth, 'invoices', invoiceId, {
            paymentProofKey: null,
            paymentProofUploadedAt: null,
          });
          if (!cleared) {
            return apiError(503, 'unavailable', 'Gagal memperbarui invoice. Bukti tetap tersimpan.');
          }
        }
      }

      try {
        await env.LOGOS.delete(key);
      } catch {
        return apiError(503, 'unavailable', 'Gagal menghapus bukti pembayaran. Coba lagi.');
      }
      return new Response(null, { status: 204 });
    } finally {
      await releaseProofUploadLock(env.LOGOS, lockResult.lock);
    }
  }

  try {
    await env.LOGOS.delete(key);
  } catch {
    return apiError(503, 'unavailable', 'Gagal menghapus bukti pembayaran. Coba lagi.');
  }
  return new Response(null, { status: 204 });
}
