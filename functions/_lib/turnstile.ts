import { fetchUpstream as fetch } from './http';
import type { Env } from './types';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Outcome of one siteverify round-trip, as a value the caller maps onto its
 * own response. `unconfigured` and `unreachable` are distinguished from a
 * plain `rejected` because a Function that gates a write has to fail closed
 * differently: "the secret is missing" is a deployment bug, "Cloudflare said
 * no" is an expected outcome.
 */
export type TurnstileOutcome =
  | { state: 'ok' }
  | { state: 'unconfigured' }
  | { state: 'missing_token' }
  | { state: 'unreachable' }
  | { state: 'rejected'; errorCodes: string[] };

/**
 * Asks Cloudflare whether `token` is a real, unspent Turnstile token.
 *
 * The browser cannot be trusted to decide a token is good: anyone can skip the
 * widget and call the API directly. The secret lives only in Functions, so
 * verifying here is what turns the widget from decoration into a gate.
 * `remoteip` is best-effort — Cloudflare uses it for token quality signals.
 */
export async function checkTurnstile(
  request: Request,
  env: Env,
  token: string,
): Promise<TurnstileOutcome> {
  const secret = env.TURNSTILE_SECRET_KEY?.trim();
  // A missing secret must never read as "passed" — that would silently
  // disable the gate for every caller.
  if (!secret) return { state: 'unconfigured' };
  if (!token) return { state: 'missing_token' };

  // Cloudflare requires the token in the `response` field — siteverify ignores
  // a `token` field and answers `missing-input-response` for it.
  const remoteip = request.headers.get('cf-connecting-ip');
  const form = new URLSearchParams({ secret, response: token });
  if (remoteip) form.set('remoteip', remoteip);

  try {
    const response = await fetch(SITEVERIFY_URL, { method: 'POST', body: form });
    const result = (await response.json()) as { success?: unknown; 'error-codes'?: unknown };
    const errorCodes = Array.isArray(result['error-codes'])
      ? result['error-codes'].filter((code): code is string => typeof code === 'string')
      : [];
    return result.success === true ? { state: 'ok' } : { state: 'rejected', errorCodes };
  } catch {
    return { state: 'unreachable' };
  }
}
