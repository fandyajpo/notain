import { verifySession } from '../../_lib/appwrite';
import { apiError, LOGO_RESPONSE_HEADERS } from '../../_lib/http';
import type { Env, PagesFunction } from '../../_lib/types';

/**
 * `GET /api/logo/:key`  — serve the file. Unauthenticated on purpose: the logo
 *   has to load inside `<img>` in the invoice preview, the print view and any
 *   PDF a visitor can open, none of which carry an auth header. Keys carry 56
 *   bits of randomness and are never listed, so this is a capability URL, not
 *   an enumeration hole.
 *
 * `DELETE /api/logo/:key` — remove it. Requires a session *and* proof that the
 *   object belongs to that session's user, so one tenant can never delete
 *   another's logo even if it learns the key.
 */
export const onRequest: PagesFunction<Env> = async ({ request, params, env }) => {
  const key = params.key;
  if (!key) return apiError(404, 'not_found', 'Logo tidak ditemukan.');

  if (request.method === 'GET') return read(key, env);
  if (request.method === 'DELETE') return remove(request, key, env);

  return apiError(405, 'method_not_allowed', 'Metode ini tidak didukung.', {
    allow: 'GET, DELETE',
  });
};

async function read(key: string, env: Env): Promise<Response> {
  const object = await env.LOGOS.get(key);
  if (!object) return apiError(404, 'not_found', 'Logo tidak ditemukan.');

  return new Response(object.body, {
    headers: {
      ...LOGO_RESPONSE_HEADERS,
      // Every upload mints a fresh key, so this URL never changes for a given
      // logo and may be cached as long as the browser likes.
      'cache-control': 'public, max-age=31536000, immutable',
      'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      'content-length': String(object.size),
    },
  });
}

async function remove(request: Request, key: string, env: Env): Promise<Response> {
  const session = await verifySession(request, env);
  if (!session) return apiError(401, 'unauthenticated', 'Silakan masuk terlebih dahulu.');

  const object = await env.LOGOS.head(key);
  // A missing object and someone else's object both answer 404: replying 403
  // for the latter would confirm the key exists to a caller who does not own it.
  if (!object || object.customMetadata?.owner !== session.userId) {
    return apiError(404, 'not_found', 'Logo tidak ditemukan.');
  }

  await env.LOGOS.delete(key);
  return new Response(null, { status: 204 });
}
