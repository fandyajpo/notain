/**
 * Cloudflare Turnstile, the bot gate in front of sign-in and sign-up.
 *
 * The sitekey is public (it ships to the browser) and is the only half that
 * reaches the Vite build; the matching secret stays server-side in the Pages
 * Function (`functions/api/turnstile.ts`) and never appears here.
 *
 * The feature is off until a sitekey is configured: with none set, no widget
 * renders and the auth forms behave exactly as they did before it existed.
 */

function readEnv(key: string): string {
  const value = import.meta.env[key];
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * The production widget's public sitekey.
 *
 * It ships to the browser by design, so carrying it in the source is safe — and
 * it is the only way the key reaches users, since the CI build reads no `.env`.
 *
 * Applied only to a production build. `astro dev` stays unprotected by default
 * so a local login never stalls on a widget the local origin is not allowlisted
 * for; set `PUBLIC_TURNSTILE_SITE_KEY` to a localhost-capable widget to test the
 * gate locally.
 */
const PROD_TURNSTILE_SITE_KEY = '0x4AAAAAAFWFjVLimTes8CZC';

/** Public Turnstile sitekey; empty when the gate is not configured here. */
export const TURNSTILE_SITE_KEY =
  readEnv('PUBLIC_TURNSTILE_SITE_KEY') ||
  (import.meta.env.PROD ? PROD_TURNSTILE_SITE_KEY : '');

export function turnstileEnabled(): boolean {
  return TURNSTILE_SITE_KEY !== '';
}

/**
 * What the client learns about one verification attempt.
 *
 * - `ok` — Cloudflare accepted the token.
 * - `fail` — no token, or Cloudflare rejected it. The caller must stop.
 * - `unavailable` — the verify endpoint is not deployed (see below), so there
 *   is nothing to enforce against and the request may proceed.
 */
export type CaptchaVerdict = 'ok' | 'fail' | 'unavailable';

const VERIFY_ENDPOINT = '/api/turnstile';

/**
 * Asks our Pages Function to check the token with Cloudflare's siteverify.
 *
 * A Turnstile token is single-use and expires in five minutes, so the caller
 * should treat it as spent the moment this resolves and mint a fresh one for
 * any retry.
 *
 * A 404 means the Function is not running. Under `astro dev` Pages Functions
 * are not served at all, so a developer filling in the form locally would
 * otherwise be locked out; reading "no endpoint" as "nothing to enforce" keeps
 * local work unblocked while a deployed Function keeps production gated.
 */
export async function verifyTurnstile(token: string | null): Promise<CaptchaVerdict> {
  if (!token) return 'fail';

  let response: Response;
  try {
    response = await fetch(VERIFY_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    });
  } catch {
    return 'fail';
  }

  if (response.status === 404) return 'unavailable';
  if (!response.ok) return 'fail';

  try {
    const body = (await response.json()) as { success?: unknown };
    return body.success === true ? 'ok' : 'fail';
  } catch {
    return 'fail';
  }
}
