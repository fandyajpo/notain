import { passwordSchema } from '../../../../src/core/auth/schema';
import { fetchUpstream as fetch, apiError } from '../../../_lib/http';
import { enforceLimit, logQuota } from '../../../_lib/quota';
import { hashResetToken, isResetToken } from '../../../_lib/reset-token';
import { deleteRow, listRows, tableAuth } from '../../../_lib/rows';
import type { Env, PagesFunction } from '../../../_lib/types';

/**
 * `POST /api/mail/password-reset/confirm` — "Lupa password", step 2.
 *
 * Redeems the token from the emailed link and stores the new password. Three
 * properties this endpoint has to keep:
 *
 * 1. **Single use.** The row is deleted the moment the password is written, so
 *    a link that leaked cannot be replayed, and neither can a browser's
 *    back-button resubmission.
 * 2. **No oracle.** A wrong token, an expired token and a token for a deleted
 *    account all answer the same 400 with the same copy.
 * 3. **Server-side validation.** The password is checked against the same Zod
 *    schema the form uses (`src/core/auth/schema.ts`), then written with the
 *    API key — not by trusting the client's own validation.
 *
 * Sessions are revoked afterwards (best effort): a password reset exists to
 * evict whoever else had the account, so every other session is ended.
 */
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== 'POST') {
    return apiError(405, 'method_not_allowed', 'Metode ini tidak didukung.', { allow: 'POST' });
  }

  // Shares the per-IP fence with the request endpoint: 256-bit tokens are not
  // guessable, but a flood should still not spend Appwrite reads.
  const limited = enforceLimit('password-reset', requestKey(request), env);
  if (limited) return limited;

  let token = '';
  let password = '';
  try {
    const body = (await request.json()) as { token?: unknown; password?: unknown };
    token = typeof body.token === 'string' ? body.token.trim() : '';
    password = typeof body.password === 'string' ? body.password : '';
  } catch {
    return apiError(400, 'validation', 'Format permintaan tidak valid.');
  }

  if (!isResetToken(token)) return invalidLink();

  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Kata sandi belum memenuhi syarat.';
    return apiError(400, 'validation', message);
  }

  const auth = tableAuth(env);
  if (!auth) return apiError(503, 'unavailable', 'Layanan sedang tidak tersedia.');

  const rows = await listRows(auth, 'password_resets', [
    { method: 'equal', attribute: 'tokenHash', values: [await hashResetToken(token)] },
    { method: 'limit', values: [1] },
  ]);
  // `null` is a provider failure, not "no such token": answering 400 there
  // would turn an Appwrite blip into a burned password reset.
  if (rows === null) {
    return apiError(503, 'unavailable', 'Layanan sedang tidak tersedia. Coba lagi.');
  }
  const row = rows[0];
  if (!row) return invalidLink();

  const userId = typeof row.userId === 'string' ? row.userId : '';
  const expiresAt = Date.parse(typeof row.expiresAt === 'string' ? row.expiresAt : '');
  if (userId === '' || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    // Expired links are cleaned up on sight: nothing else ever walks this table.
    if (row.$id) await deleteRow(auth, 'password_resets', row.$id, env);
    return invalidLink();
  }

  const updated = await fetch(`${auth.endpoint}/users/${encodeURIComponent(userId)}/password`, {
    method: 'PATCH',
    headers: { ...auth.headers, 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  }).catch(() => null);
  if (updated === null || !updated.ok) {
    return apiError(503, 'unavailable', 'Kata sandi belum bisa disimpan. Coba lagi.');
  }

  await deleteRow(auth, 'password_resets', row.$id, env);
  logQuota('mail', 'password-reset.applied');

  // Best effort: the password is already changed, so a failed revoke must not
  // turn a successful reset into an error. Appwrite's own session invalidation
  // on password change still applies.
  await fetch(`${auth.endpoint}/users/${encodeURIComponent(userId)}/sessions`, {
    method: 'DELETE',
    headers: auth.headers,
  }).catch(() => null);

  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
};

function requestKey(request: Request): string {
  return request.headers.get('cf-connecting-ip') ?? 'unknown';
}

/** One answer for "wrong token", "expired token" and "gone account". */
function invalidLink(): Response {
  return apiError(
    400,
    'validation',
    'Tautan reset sudah kedaluwarsa atau tidak valid. Minta tautan baru lewat halaman lupa password.',
  );
}
