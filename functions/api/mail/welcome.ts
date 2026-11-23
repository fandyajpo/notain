import { verifySession } from '../../_lib/appwrite';
import { apiError, json } from '../../_lib/http';
import { mailConfigured, sendMail } from '../../_lib/mail';
import { enforceLimit } from '../../_lib/quota';
import type { Env, PagesFunction } from '../../_lib/types';

/**
 * `POST /api/mail/welcome` — the greeting sent once, right after sign-up.
 *
 * Anonymous sign-up happens in the browser (the Appwrite client SDK creates the
 * account), so there is no server-side hook that could send this at creation
 * time. The register form calls it immediately after the session exists, which
 * also means the caller is authenticated and the address is the account's own —
 * this endpoint cannot be used to mail an arbitrary victim.
 *
 * Deliberate limits: the address is taken from the verified session, never from
 * the body; three sends per account per hour is far above the one a person
 * needs and far below anything useful to an abuser.
 */
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== 'POST') {
    return apiError(405, 'method_not_allowed', 'Metode ini tidak didukung.', { allow: 'POST' });
  }

  const session = await verifySession(request, env);
  if (!session) {
    return apiError(401, 'unauthenticated', 'Silakan masuk terlebih dahulu.');
  }
  if (session.email === '') {
    return apiError(400, 'validation', 'Akun ini tidak punya alamat email.');
  }
  if (!mailConfigured(env)) {
    // Not an error the user should ever see: the client calls this fire-and-
    // forget. 503 keeps the reason visible in the network log.
    return apiError(503, 'unavailable', 'Pengiriman email belum aktif di server ini.');
  }

  const limited = enforceLimit('mail-welcome', session.userId, env);
  if (limited) return limited;

  const origin = new URL(request.url).origin;
  const name = session.name.trim() || session.email.split('@')[0] || 'kamu';

  const result = await sendMail(env, {
    type: 'welcome',
    to: session.email,
    name,
    loginUrl: `${origin}/login`,
  });

  if (result !== 'sent') {
    return apiError(503, 'unavailable', 'Email selamat datang belum terkirim.');
  }
  return json(202, { ok: true });
};
