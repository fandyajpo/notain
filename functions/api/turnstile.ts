import { checkTurnstile } from '../_lib/turnstile';
import { apiError, json } from '../_lib/http';
import { enforceLimit, requestKey } from '../_lib/quota';
import type { Env, PagesFunction } from '../_lib/types';

/**
 * `POST /api/turnstile` — check a Turnstile token with Cloudflare.
 *
 * It answers with `{ success }` rather than an error status for a normal
 * rejection, because "Cloudflare said no" is an expected outcome, not a fault.
 * The verification itself lives in `_lib/turnstile.ts` so the payment-proof
 * upload can gate on the same code path.
 */
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== 'POST') {
    return apiError(405, 'method_not_allowed', 'Metode ini tidak didukung.', { allow: 'POST' });
  }

  // Turnstile verification itself is unmetered on Free, but each call here
  // still costs a Worker invocation and a subrequest — cap the per-IP rate so
  // a script cannot spend Cloudflare request quota through this endpoint.
  const limited = enforceLimit('turnstile', requestKey(request), env);
  if (limited) return limited;

  let token: string;
  try {
    const body: unknown = await request.json();
    token =
      typeof body === 'object' &&
      body !== null &&
      'token' in body &&
      typeof (body as { token: unknown }).token === 'string'
        ? (body as { token: string }).token
        : '';
  } catch {
    token = '';
  }

  const outcome = await checkTurnstile(request, env, token);
  if (outcome.state === 'unconfigured') {
    return apiError(500, 'validation', 'Verifikasi keamanan belum dikonfigurasi.');
  }
  if (outcome.state === 'missing_token') {
    return apiError(400, 'validation', 'Token verifikasi belum tersedia.');
  }
  if (outcome.state === 'unreachable') {
    return apiError(502, 'validation', 'Verifikasi keamanan gagal dihubungi.');
  }

  // Cloudflare explains a rejection via `error-codes` (e.g.
  // `invalid-input-secret` when the secret does not match the sitekey,
  // `timeout-or-duplicate` for an expired/spent token). The body is echoed
  // so the cause can be read straight from the browser's Network tab.
  return json(200, {
    success: outcome.state === 'ok',
    errorCodes: outcome.state === 'rejected' ? outcome.errorCodes : [],
  });
};
