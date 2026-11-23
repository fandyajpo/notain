import { querySearchAll } from '../../_lib/appwrite';
import { apiError, noContent, readJson } from '../../_lib/http';
import { mailConfigured, sendMail } from '../../_lib/mail';
import { enforceLimit, quotaPolicy, rateLimit } from '../../_lib/quota';
import {
  hashResetToken,
  newResetToken,
  resetExpiry,
  resetRowId,
  RESET_TOKEN_TTL_MINUTES,
} from '../../_lib/reset-token';
import { createRow, getRow, patchRow, tableAuth, type ListQuery } from '../../_lib/rows';
import type { Env, PagesFunction } from '../../_lib/types';

/**
 * `POST /api/mail/password-reset` — "Lupa password", step 1.
 *
 * ## Why this is not Appwrite's own recovery email
 *
 * `account.createRecovery()` sends the email itself, from Appwrite, with
 * Appwrite's template. Notain now sends its own mail through one service
 * (`mailer/`, on `@sendust/ts`), so the reset link has to be ours too. The
 * catch is that Appwrite never reveals the recovery secret it emails — which
 * is exactly what `account.updateRecovery` needs. So this flow owns both
 * halves: a token in `password_resets`, and `users.updatePassword` with the API
 * key at the end (see `password-reset/confirm.ts`). The legacy
 * `userId`/`secret` link keeps working for messages already in inboxes.
 *
 * ## Account enumeration
 *
 * Every outcome is 204, including "no such account", "rate limited for this
 * address" and "the mailer failed". The only way to learn whether an address is
 * registered is to open its inbox — which is the intended proof. A 429 would
 * leak the same thing by existing only for real accounts, so the per-address
 * fence is silent while the per-IP fence (which is not account-specific) is a
 * real 429.
 *
 * ## Cost
 *
 * One user lookup, one row read-or-write, one send. The row id is derived from
 * the account id, so the second request for the same account is a `getRow` +
 * `patchRow` rather than another create.
 */
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== 'POST') {
    return apiError(405, 'method_not_allowed', 'Metode ini tidak didukung.', { allow: 'POST' });
  }

  const limited = enforceLimit('password-reset', requestKeyOf(request), env);
  if (limited) return limited;

  const body = await readJson(request);
  if (body === null) return apiError(400, 'validation', 'Format permintaan tidak valid.');

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return apiError(400, 'validation', 'Masukkan email yang valid.');
  }

  const auth = tableAuth(env);
  if (!auth) {
    return apiError(503, 'unavailable', 'Layanan sedang tidak tersedia.');
  }

  const origin = safeOrigin(request);
  if (origin === null) return apiError(400, 'validation', 'Permintaan tidak valid.');

  // Per-address fence: silently capped, because a 429 here would answer "this
  // address exists". The key is a hash so the rate-limit map holds no email,
  // and it is lowercased so casing variants share one bucket.
  const addressKey = await hashResetToken(`address:${email.toLowerCase()}`);
  const addressAllowed = rateLimit('password-reset-address', addressKey, quotaPolicy(env)).allowed;

  // Appwrite normalises addresses, but do not bet a reset link on it: try the
  // lowercased form first (the common case, one read) and fall back to exactly
  // what the person typed when the two differ.
  const lookups = email.toLowerCase() === email ? [email] : [email.toLowerCase(), email];
  let user: ResetUser | null = null;
  for (const candidate of lookups) {
    user = await findUserByEmail(candidate, auth);
    if (user !== null) break;
  }

  if (user === null || !addressAllowed || !mailConfigured(env)) {
    // Nothing to send, or nothing we are willing to send right now.
    return noContent();
  }

  const token = newResetToken();
  const rowId = await resetRowId(user.id);
  const data = {
    tokenHash: await hashResetToken(token),
    userId: user.id,
    expiresAt: resetExpiry(),
    origin,
  };

  const created = await createRow(auth, 'password_resets', rowId, data, []);
  if (!created) {
    const existing = await getRow(auth, 'password_resets', rowId, env);
    // A row that exists but cannot be patched, or a create that failed for a
    // reason other than "already there", is a provider problem: log it and
    // answer 204 — the user is told to check their inbox either way.
    if (existing) await patchRow(auth, 'password_resets', rowId, data);
  }

  await sendMail(env, {
    type: 'password-reset',
    to: email,
    name: user.name,
    resetUrl: `${origin}/reset-password?token=${token}`,
    expiresMinutes: RESET_TOKEN_TTL_MINUTES,
  });

  return noContent();
};

/**
 * The origin the reset link is built from.
 *
 * Taken from the request, not from configuration: the same build is served from
 * `notain.pages.dev`, a preview URL and `localhost:4321`, and a baked-in domain
 * would break the others. `Origin` is preferred (a browser always sends it on a
 * cross-origin POST); the request URL is the fallback, and both must be https
 * outside local dev so a reset token never travels over plain http.
 */
function safeOrigin(request: Request): string | null {
  const header = request.headers.get('origin');
  const candidate = header && header !== 'null' ? header : new URL(request.url).origin;
  try {
    const url = new URL(candidate);
    if (url.protocol === 'https:') return url.origin;
    if (url.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(url.hostname)) {
      return url.origin;
    }
    return null;
  } catch {
    return null;
  }
}

function requestKeyOf(request: Request): string {
  return request.headers.get('cf-connecting-ip') ?? 'unknown';
}

type ResetUser = { id: string; name: string };

/**
 * The account behind an address, or `null`.
 *
 * `GET /users` with an equality query on `email` returns at most one row:
 * Appwrite enforces unique emails. `null` covers both "no such account" and
 * "the provider failed", which is deliberate — the caller answers 204 for both.
 */
async function findUserByEmail(
  email: string,
  auth: { endpoint: string; headers: Record<string, string> },
): Promise<ResetUser | null> {
  const queries: ListQuery[] = [
    { method: 'equal', attribute: 'email', values: [email] },
    { method: 'limit', values: [1] },
  ];
  try {
    const response = await fetch(`${auth.endpoint}/users?${querySearchAll(queries)}`, {
      headers: auth.headers,
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { users?: Array<Record<string, unknown>> };
    const row = Array.isArray(body.users) ? body.users[0] : undefined;
    if (!row || typeof row.$id !== 'string') return null;
    return {
      id: row.$id,
      // Appwrite refuses an empty name at creation, so this is only ever a
      // placeholder like the email's local part.
      name: typeof row.name === 'string' ? row.name : '',
    };
  } catch {
    return null;
  }
}
