import { verifySession } from '../../_lib/appwrite';
import { apiError, json } from '../../_lib/http';
import { mailConfigured, sendMail } from '../../_lib/mail';
import { enforceLimit } from '../../_lib/quota';
import { markWelcomeSent, welcomeAlreadySent, welcomeAuth } from '../../_lib/welcome';
import type { Env, PagesFunction } from '../../_lib/types';

/**
 * `POST /api/mail/welcome` — the greeting, sent once per account.
 *
 * Anonymous sign-up happens in the browser (the Appwrite client SDK creates the
 * account), so there is no server-side hook that could send this at creation
 * time. The client therefore asks for it after a session exists — and it asks on
 * three occasions: after sign-up, after every sign-in, and at the end of an OAuth
 * round trip. Only the first call sends; the rest answer `200 { sent: false }`.
 *
 * That is what makes the greeting reach accounts the register form never sees: an
 * OAuth sign-up, and anyone who registered before this feature existed. The
 * marker is the account's own `welcomeSentAt` pref (`_lib/welcome.ts`), so no
 * table is involved.
 *
 * Deliberate limits: the address is taken from the verified session, never from
 * the body; the rate fence stays as a backstop for the one case that can repeat,
 * a probe that could not tell whether the greeting already went out.
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

  const auth = welcomeAuth(env);
  if (auth !== null && (await welcomeAlreadySent(auth, session.userId)) === true) {
    // Already greeted. `200`, not an error and not a rate-limit hit: every
    // sign-in lands here, so this is the normal answer for an existing account.
    return json(200, { ok: true, sent: false });
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

  // Stamped only after the relay accepted it, so a failed send is retried by the
  // account's next sign-in instead of being remembered as done.
  if (auth !== null) await markWelcomeSent(auth, session.userId);
  return json(202, { ok: true, sent: true });
};
