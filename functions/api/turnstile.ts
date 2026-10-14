import { apiError, json } from '../_lib/http';
import type { Env, PagesFunction } from '../_lib/types';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * `POST /api/turnstile` — check a Turnstile token with Cloudflare.
 *
 * The browser cannot be trusted to decide a token is good: anyone can skip the
 * widget and call Appwrite directly. This Function is the one place the secret
 * lives, so verifying here is what turns the widget from decoration into a
 * gate. It answers with `{ success }` rather than an error status for a normal
 * rejection, because "Cloudflare said no" is an expected outcome, not a fault.
 */
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== 'POST') {
    return apiError(405, 'method_not_allowed', 'Metode ini tidak didukung.', { allow: 'POST' });
  }

  const secret = env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    // A missing secret must never read as "passed" — that would silently
    // disable the gate for every caller.
    return apiError(500, 'validation', 'Verifikasi keamanan belum dikonfigurasi.');
  }

  let token: string;
  try {
    const body: unknown = await request.json();
    token =
      typeof body === 'object' && body !== null && 'token' in body &&
      typeof (body as { token: unknown }).token === 'string'
        ? ((body as { token: string }).token)
        : '';
  } catch {
    token = '';
  }
  if (!token) {
    return apiError(400, 'validation', 'Token verifikasi belum tersedia.');
  }

  // Cloudflare uses the caller IP for token quality and abuse signals. The
  // token must go in the `response` field — siteverify ignores `token` and
  // answers `missing-input-response` for it.
  const remoteip = request.headers.get('cf-connecting-ip');
  const form = new URLSearchParams({ secret, response: token });
  if (remoteip) form.set('remoteip', remoteip);

  let success: boolean;
  let errorCodes: string[] = [];
  try {
    const response = await fetch(SITEVERIFY_URL, { method: 'POST', body: form });
    const result = (await response.json()) as { success?: unknown; 'error-codes'?: unknown };
    success = result.success === true;
    // Cloudflare explains a rejection via `error-codes` (e.g.
    // `invalid-input-secret` when the secret does not match the sitekey,
    // `timeout-or-duplicate` for an expired/spent token). The body is echoed
    // so the cause can be read straight from the browser's Network tab.
    if (Array.isArray(result['error-codes'])) {
      errorCodes = result['error-codes'].filter((code): code is string => typeof code === 'string');
    }
  } catch {
    return apiError(502, 'validation', 'Verifikasi keamanan gagal dihubungi.');
  }

  return json(200, { success, errorCodes });
};
